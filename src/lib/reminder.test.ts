import { describe, expect, it } from "vitest";
import { chargeSettingsFrom } from "@/lib/charges";
import { buildClientReminders, renderReminder } from "@/lib/reminder";
import { REMINDER_TEMPLATES } from "@/lib/reminder-templates";
import { EMPTY_SENDER_PROFILE } from "@/lib/sender-profile";
import type { Invoice, SenderProfile } from "@/types";

const TODAY = "2026-10-05";
const NB = " ";

const ACME = { id: "client-acme", name: "Acme Sp. z o.o.", compensation: true };
const ZABKA = { id: "client-zabka", name: "Żabka Handel", compensation: false };

function inv(
  client: typeof ACME,
  number: string,
  amountGrosze: number,
  dueDate: string,
  id = `${client.id}-${number}`,
): Invoice {
  return {
    id,
    clientId: client.id,
    clientName: client.name,
    clientChargesCompensation: client.compensation,
    number,
    amountGrosze,
    dueDate,
    paidOn: null,
    paidRateBp: null,
    paidCompensationGrosze: null,
    cancelledOn: null,
    pausedOn: null,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

const sampleInvoices: Invoice[] = [
  inv(ACME, "FV/2026/08/001", 123456, "2026-08-20"),
  inv(ACME, "FV/2026/08/002", 650000, "2026-08-25"),
  inv(ZABKA, "FV/2026/09/004", 50000, "2026-09-15"),
  inv(ACME, "FV/2026/09/007", 99900, "2026-09-26"),
  inv(ZABKA, "FV/2026/09/010", 250050, "2026-10-01"),
  inv(ACME, "FV/2026/10/002", 10000, "2026-10-04"),
  inv(ZABKA, "FV/2026/10/005", 75000, "2026-10-20"),
];

describe("buildClientReminders: invoice selection", () => {
  it("takes only stages 1-4, skips current and pre-threshold", () => {
    const reminders = buildClientReminders(sampleInvoices, TODAY);
    const acme = reminders.find((r) => r.clientId === ACME.id);
    expect(acme?.items.map((i) => i.number)).toEqual(["FV/2026/08/001", "FV/2026/08/002", "FV/2026/09/007"]);
    const zabka = reminders.find((r) => r.clientId === ZABKA.id);
    expect(zabka?.items.map((i) => i.number)).toEqual(["FV/2026/09/004", "FV/2026/09/010"]);
  });

  it("skips a client with only current or pre-threshold invoices", () => {
    const reminders = buildClientReminders(
      [inv(ACME, "A/1", 10000, "2026-10-04"), inv(ACME, "A/2", 10000, "2026-10-20")],
      TODAY,
    );
    expect(reminders).toEqual([]);
  });
});

describe("buildClientReminders: paused invoices", () => {
  const paused = (invoice: Invoice): Invoice => ({ ...invoice, pausedOn: "2026-10-01" });

  it("skips a paused invoice 40 days overdue; stage and totals match the unpaused item", () => {
    const active = inv(ACME, "A/1", 123456, "2026-08-20");
    const reminders = buildClientReminders([active, paused(inv(ACME, "A/2", 650000, "2026-08-26"))], TODAY);
    expect(reminders).toEqual([
      {
        clientId: ACME.id,
        clientName: ACME.name,
        chargesCompensation: true,
        stage: 4,
        items: [
          {
            number: "A/1",
            amountGrosze: 123456,
            dueDate: "2026-08-20",
            daysOverdue: 46,
            interestGrosze: 2139,
            compensationGrosze: 17000,
          },
        ],
        principalGrosze: 123456,
        interestGrosze: 2139,
        compensationGrosze: 17000,
        totalGrosze: 142595,
      },
    ]);
  });

  it("a paused stage-4 invoice does not raise the reminder stage", () => {
    const reminders = buildClientReminders(
      [inv(ACME, "A/1", 10000, "2026-09-25"), paused(inv(ACME, "A/2", 10000, "2026-08-26"))],
      TODAY,
    );
    expect(reminders.map((r) => [r.stage, r.items.map((i) => i.number)])).toEqual([[2, ["A/1"]]]);
  });

  it("skips a client whose only overdue invoice is paused", () => {
    const reminders = buildClientReminders(
      [paused(inv(ACME, "A/1", 10000, "2026-08-26")), inv(ACME, "A/2", 10000, "2026-10-20")],
      TODAY,
    );
    expect(reminders).toEqual([]);
  });
});

describe("buildClientReminders: stage", () => {
  it("takes the maximum item stage, even when the higher stage is not first in the input", () => {
    const reminders = buildClientReminders(
      [
        inv(ACME, "A/1", 10000, "2026-10-01"),
        inv(ACME, "A/2", 10000, "2026-08-01"),
        inv(ACME, "A/3", 10000, "2026-09-25"),
      ],
      TODAY,
    );
    expect(reminders).toHaveLength(1);
    expect(reminders[0].stage).toBe(4);
  });

  it("respects threshold boundaries", () => {
    const at = (days: number) => {
      const due = new Date(Date.UTC(2026, 9, 5 - days)).toISOString().slice(0, 10);
      return buildClientReminders([inv(ACME, "A/1", 10000, due)], TODAY);
    };
    expect(at(2)).toEqual([]);
    expect(at(3)[0].stage).toBe(1);
    expect(at(30)[0].stage).toBe(4);
  });
});

describe("buildClientReminders: grouping and order", () => {
  it("yields one reminder per client, by stage descending, then name", () => {
    const reminders = buildClientReminders(sampleInvoices, TODAY);
    expect(reminders.map((r) => [r.clientName, r.stage])).toEqual([
      ["Acme Sp. z o.o.", 4],
      ["Żabka Handel", 3],
    ]);
  });

  it("sorts by client name when stages are equal", () => {
    const reminders = buildClientReminders(
      [inv(ZABKA, "Z/1", 10000, "2026-09-25"), inv(ACME, "A/1", 10000, "2026-09-25")],
      TODAY,
    );
    expect(reminders.map((r) => r.clientName)).toEqual(["Acme Sp. z o.o.", "Żabka Handel"]);
  });
});

describe("buildClientReminders: totals", () => {
  it("computes Acme totals (with compensation)", () => {
    const acme = buildClientReminders(sampleInvoices, TODAY)[0];
    expect(acme.principalGrosze).toBe(873356);
    expect(acme.interestGrosze).toBe(12517);
    expect(acme.compensationGrosze).toBe(63750);
    expect(acme.totalGrosze).toBe(949623);
    expect(acme.items.map((i) => i.daysOverdue)).toEqual([46, 41, 9]);
  });

  it("computes Żabka totals (without compensation)", () => {
    const zabka = buildClientReminders(sampleInvoices, TODAY)[1];
    expect(zabka.principalGrosze).toBe(300050);
    expect(zabka.interestGrosze).toBe(754);
    expect(zabka.compensationGrosze).toBe(0);
    expect(zabka.totalGrosze).toBe(300804);
  });
});

describe("renderReminder", () => {
  const [acme, zabka] = buildClientReminders(sampleInvoices, TODAY);

  it("renders the full Acme text (stage 4)", () => {
    const expected = `Ostateczne przedsądowe wezwanie do zapłaty
05.10.2026

Acme Sp. z o.o.

Wobec braku zapłaty mimo wcześniejszych przypomnień ostatecznie wzywam do zapłaty należności z tytułu poniższych faktur:

1. Faktura FV/2026/08/001 — kwota 1234,56${NB}zł, termin płatności 20.08.2026, 46 dni po terminie, odsetki 21,39${NB}zł, rekompensata 170,00${NB}zł
2. Faktura FV/2026/08/002 — kwota 6500,00${NB}zł, termin płatności 25.08.2026, 41 dni po terminie, odsetki 100,39${NB}zł, rekompensata 297,50${NB}zł
3. Faktura FV/2026/09/007 — kwota 999,00${NB}zł, termin płatności 26.09.2026, 9 dni po terminie, odsetki 3,39${NB}zł, rekompensata 170,00${NB}zł

Należność główna: 8733,56${NB}zł
Odsetki: 125,17${NB}zł
Rekompensata: 637,50${NB}zł
Razem do zapłaty: 9496,23${NB}zł

Jeżeli należność nie zostanie uregulowana do 12.10.2026, sprawa zostanie skierowana na drogę postępowania sądowego, co narazi Państwa na dodatkowe koszty.

Z poważaniem`;
    expect(renderReminder(acme, TODAY)).toBe(expected);
  });

  it("renders Żabka (stage 3) without compensation", () => {
    const text = renderReminder(zabka, TODAY);
    expect(text).toContain("Wezwanie do zapłaty");
    expect(text).not.toMatch(/rekompensat/i);
    expect(text).toContain(`Odsetki: 7,54${NB}zł`);
    expect(text).toContain(`Razem do zapłaty: 3008,04${NB}zł`);
  });

  it("none of the 4 templates contains curly braces after rendering", () => {
    for (const stage of [1, 2, 3, 4] as const) {
      const text = renderReminder({ ...acme, stage }, TODAY);
      expect(text).not.toMatch(/[{}]/);
    }
    expect(Object.keys(REMINDER_TEMPLATES)).toHaveLength(4);
  });

  it("does not substitute fields twice in the client name and leaves unknown fields", () => {
    const tricky = { ...acme, clientName: "Firma {data}" };
    const text = renderReminder(tricky, TODAY, EMPTY_SENDER_PROFILE, {
      ...REMINDER_TEMPLATES,
      4: "{klient} / {data} / {nieznane}",
    });
    expect(text).toBe("Firma {data} / 05.10.2026 / {nieznane}");
  });

  it("uses 'dzień' for 1 day overdue (thresholds [1, 2, 3, 4])", () => {
    const [reminder] = buildClientReminders([inv(ACME, "A/1", 10000, "2026-10-04")], TODAY, [1, 2, 3, 4]);
    expect(renderReminder(reminder, TODAY)).toContain("1 dzień po terminie");
  });

  it("computes the payment deadline across the month end (28.10 -> 04.11)", () => {
    const text = renderReminder(acme, "2026-10-28");
    expect(text).toContain("do 04.11.2026");
  });

  describe("sender profile", () => {
    const FULL: SenderProfile = {
      companyName: "Firma Testowa Sp. z o.o.",
      nip: "5260250995",
      address: "ul. Prosta 1\n00-001 Warszawa",
      bankAccount: "61109010140000071219812874",
    };

    it("full profile: the sender block ends stage 4 and the account is in the deadline sentence", () => {
      const text = renderReminder(acme, TODAY, FULL);
      expect(text).toContain("uregulowana do 12.10.2026 na rachunek nr 61 1090 1014 0000 0712 1981 2874, sprawa");
      expect(
        text.endsWith("Z poważaniem\nFirma Testowa Sp. z o.o.\nul. Prosta 1\n00-001 Warszawa\nNIP: 5260250995"),
      ).toBe(true);
    });

    it("account-only profile ends with 'Z poważaniem' and has the account sentence", () => {
      const text = renderReminder(acme, TODAY, { ...EMPTY_SENDER_PROFILE, bankAccount: FULL.bankAccount });
      expect(text.endsWith("Z poważaniem")).toBe(true);
      expect(text).toContain("do 12.10.2026 na rachunek nr 61 1090 1014 0000 0712 1981 2874, sprawa");
    });

    it("profile without an account has no 'na rachunek' but keeps the sender block", () => {
      const text = renderReminder(acme, TODAY, { ...FULL, bankAccount: null });
      expect(text).not.toContain("na rachunek");
      expect(text).toContain("do 12.10.2026, sprawa");
      expect(text.endsWith("NIP: 5260250995")).toBe(true);
    });

    it("an address with blank lines and spaces yields no blank lines in the block", () => {
      const text = renderReminder(acme, TODAY, {
        ...EMPTY_SENDER_PROFILE,
        address: "  ul. Prosta 1  \n\n   \n00-001 Warszawa\n",
      });
      expect(text.endsWith("Z poważaniem\nul. Prosta 1\n00-001 Warszawa")).toBe(true);
    });

    it("a company name with a braced field is not substituted again", () => {
      const text = renderReminder(acme, TODAY, { ...EMPTY_SENDER_PROFILE, companyName: "Firma {klient}" });
      expect(text.endsWith("Z poważaniem\nFirma {klient}")).toBe(true);
    });

    it("with a full profile none of the 4 templates leaves curly braces", () => {
      for (const stage of [1, 2, 3, 4] as const) {
        const text = renderReminder({ ...acme, stage }, TODAY, FULL);
        expect(text).not.toMatch(/[{}]/);
        expect(text).toContain("na rachunek nr 61 1090 1014 0000 0712 1981 2874");
        expect(text.endsWith("NIP: 5260250995")).toBe(true);
      }
    });
  });
});

describe("buildClientReminders: client with invoices in mixed states", () => {
  const NOW = "2026-10-14";
  const mixed: Invoice[] = [
    inv(ACME, "A5", 999900, "2026-09-04", "a5"),
    inv(ACME, "A1", 100000, "2026-10-11", "a1"),
    inv(ACME, "A7", 70000, "2026-10-14", "a7"),
    inv(ACME, "A3", 300000, "2026-09-30", "a3"),
    inv(ACME, "A6", 50000, "2026-10-12", "a6"),
    inv(ACME, "A4", 400000, "2026-09-14", "a4"),
    inv(ACME, "A2", 200000, "2026-10-07", "a2"),
  ].map((invoice) => (invoice.number === "A5" ? { ...invoice, pausedOn: "2026-09-20" } : invoice));
  const clientB: Invoice[] = [inv(ZABKA, "B2", 100000, "2026-10-10"), inv(ZABKA, "B1", 100000, "2026-10-07")];

  it("takes exactly stages 1-4 in due-date order, with the highest stage and summed totals", () => {
    const [a] = buildClientReminders([...mixed, ...clientB], NOW);
    expect(a.clientId).toBe(ACME.id);
    expect(a.stage).toBe(4);
    expect(a.items.map((i) => [i.number, i.daysOverdue, i.interestGrosze, i.compensationGrosze])).toEqual([
      ["A4", 30, 4521, 17000],
      ["A3", 14, 1582, 17000],
      ["A2", 7, 527, 17000],
      ["A1", 3, 113, 17000],
    ]);
    expect(a.principalGrosze).toBe(1000000);
    expect(a.interestGrosze).toBe(6743);
    expect(a.compensationGrosze).toBe(68000);
    expect(a.totalGrosze).toBe(1074743);
  });

  it("client without compensation: stage 2, no compensation anywhere, and the order is higher stage first", () => {
    const reminders = buildClientReminders([...mixed, ...clientB], NOW);
    expect(reminders.map((r) => r.clientId)).toEqual([ACME.id, ZABKA.id]);
    const b = reminders[1];
    expect(b.stage).toBe(2);
    expect(b.items.map((i) => [i.number, i.interestGrosze, i.compensationGrosze])).toEqual([
      ["B1", 264, 0],
      ["B2", 151, 0],
    ]);
    expect(b.compensationGrosze).toBe(0);
    expect(b.totalGrosze).toBe(200415);
    expect(renderReminder(b, NOW)).not.toMatch(/rekompensat/i);
  });
});

describe("buildClientReminders: total equals sum of rounded items", () => {
  it("two items with 0.6 gr interest each total 2 gr, not 1 gr", () => {
    const settings = chargeSettingsFrom({
      thresholds: [3, 7, 14, 30],
      annualRateBp: 1000,
      compensationGrosze: [10000, 20000, 30000],
    });
    const [reminder] = buildClientReminders(
      [inv(ACME, "A/1", 730, "2026-10-02"), inv(ACME, "A/2", 730, "2026-10-02")],
      TODAY,
      [3, 7, 14, 30],
      settings,
    );
    expect(reminder.interestGrosze).toBe(2);
    expect(reminder.totalGrosze).toBe(21462);
    expect(renderReminder(reminder, TODAY)).toContain(`Odsetki: 0,02${NB}zł`);
  });
});

describe("renderReminder: template selection", () => {
  const markers = { 1: "ETAP1 {klient}", 2: "ETAP2 {klient}", 3: "ETAP3 {klient}", 4: "ETAP4 {klient}" };

  it.each([
    [1, "2026-10-02"],
    [2, "2026-09-28"],
    [3, "2026-09-21"],
    [4, "2026-09-05"],
  ] as const)("a single invoice at stage %i renders the stage template", (stage, dueDate) => {
    const [reminder] = buildClientReminders([inv(ACME, "A/1", 10000, dueDate)], TODAY);
    expect(reminder.stage).toBe(stage);
    expect(renderReminder(reminder, TODAY, EMPTY_SENDER_PROFILE, markers)).toBe(`ETAP${stage} ${ACME.name}`);
  });
});
