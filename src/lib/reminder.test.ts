import { describe, expect, it } from "vitest";
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

describe("buildClientReminders: wybór faktur", () => {
  it("bierze tylko etapy 1-4, pomija bieżące i przed progiem", () => {
    const reminders = buildClientReminders(sampleInvoices, TODAY);
    const acme = reminders.find((r) => r.clientId === ACME.id);
    expect(acme?.items.map((i) => i.number)).toEqual(["FV/2026/08/001", "FV/2026/08/002", "FV/2026/09/007"]);
    const zabka = reminders.find((r) => r.clientId === ZABKA.id);
    expect(zabka?.items.map((i) => i.number)).toEqual(["FV/2026/09/004", "FV/2026/09/010"]);
  });

  it("pomija klienta mającego wyłącznie faktury bieżące lub przed progiem", () => {
    const reminders = buildClientReminders(
      [inv(ACME, "A/1", 10000, "2026-10-04"), inv(ACME, "A/2", 10000, "2026-10-20")],
      TODAY,
    );
    expect(reminders).toEqual([]);
  });
});

describe("buildClientReminders: wstrzymane faktury", () => {
  const paused = (invoice: Invoice): Invoice => ({ ...invoice, pausedOn: "2026-10-01" });

  it("pomija wstrzymaną fakturę 40 dni po terminie; etap i sumy odpowiadają niewstrzymanej pozycji", () => {
    const active = inv(ACME, "A/1", 123456, "2026-08-20");
    const reminders = buildClientReminders([active, paused(inv(ACME, "A/2", 650000, "2026-08-26"))], TODAY);
    const [expected] = buildClientReminders([active], TODAY);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].items.map((i) => i.number)).toEqual(["A/1"]);
    expect(reminders[0].stage).toBe(4);
    expect(reminders[0]).toEqual(expected);
  });

  it("wstrzymana faktura na etapie 4 nie podnosi etapu ponaglenia", () => {
    const reminders = buildClientReminders(
      [inv(ACME, "A/1", 10000, "2026-09-25"), paused(inv(ACME, "A/2", 10000, "2026-08-26"))],
      TODAY,
    );
    expect(reminders.map((r) => [r.stage, r.items.map((i) => i.number)])).toEqual([[2, ["A/1"]]]);
  });

  it("pomija klienta, którego jedyna faktura po terminie jest wstrzymana", () => {
    const reminders = buildClientReminders(
      [paused(inv(ACME, "A/1", 10000, "2026-08-26")), inv(ACME, "A/2", 10000, "2026-10-20")],
      TODAY,
    );
    expect(reminders).toEqual([]);
  });
});

describe("buildClientReminders: etap", () => {
  it("bierze maksimum etapów pozycji, także gdy wyższy etap nie jest pierwszy na wejściu", () => {
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

  it("respektuje granice progów", () => {
    const at = (days: number) => {
      const due = new Date(Date.UTC(2026, 9, 5 - days)).toISOString().slice(0, 10);
      return buildClientReminders([inv(ACME, "A/1", 10000, due)], TODAY);
    };
    expect(at(2)).toEqual([]);
    expect(at(3)[0].stage).toBe(1);
    expect(at(30)[0].stage).toBe(4);
  });
});

describe("buildClientReminders: grupowanie i kolejność", () => {
  it("daje po jednym ponagleniu na klienta, etap malejąco, potem nazwa", () => {
    const reminders = buildClientReminders(sampleInvoices, TODAY);
    expect(reminders.map((r) => [r.clientName, r.stage])).toEqual([
      ["Acme Sp. z o.o.", 4],
      ["Żabka Handel", 3],
    ]);
  });

  it("przy równym etapie sortuje po nazwie klienta", () => {
    const reminders = buildClientReminders(
      [inv(ZABKA, "Z/1", 10000, "2026-09-25"), inv(ACME, "A/1", 10000, "2026-09-25")],
      TODAY,
    );
    expect(reminders.map((r) => r.clientName)).toEqual(["Acme Sp. z o.o.", "Żabka Handel"]);
  });
});

describe("buildClientReminders: sumy", () => {
  it("liczy sumy Acme (z rekompensatą)", () => {
    const acme = buildClientReminders(sampleInvoices, TODAY)[0];
    expect(acme.principalGrosze).toBe(873356);
    expect(acme.interestGrosze).toBe(12517);
    expect(acme.compensationGrosze).toBe(63750);
    expect(acme.totalGrosze).toBe(949623);
    expect(acme.items.map((i) => i.daysOverdue)).toEqual([46, 41, 9]);
  });

  it("liczy sumy Żabki (bez rekompensaty)", () => {
    const zabka = buildClientReminders(sampleInvoices, TODAY)[1];
    expect(zabka.principalGrosze).toBe(300050);
    expect(zabka.interestGrosze).toBe(754);
    expect(zabka.compensationGrosze).toBe(0);
    expect(zabka.totalGrosze).toBe(300804);
  });
});

describe("renderReminder", () => {
  const [acme, zabka] = buildClientReminders(sampleInvoices, TODAY);

  it("renderuje pełny tekst Acme (etap 4)", () => {
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

  it("renderuje Żabkę (etap 3) bez rekompensaty", () => {
    const text = renderReminder(zabka, TODAY);
    expect(text).toContain("Wezwanie do zapłaty");
    expect(text).not.toMatch(/rekompensat/i);
    expect(text).toContain(`Odsetki: 7,54${NB}zł`);
    expect(text).toContain(`Razem do zapłaty: 3008,04${NB}zł`);
  });

  it("po renderze żaden z 4 szablonów nie zawiera nawiasów klamrowych", () => {
    for (const stage of [1, 2, 3, 4] as const) {
      const text = renderReminder({ ...acme, stage }, TODAY);
      expect(text).not.toMatch(/[{}]/);
    }
    expect(Object.keys(REMINDER_TEMPLATES)).toHaveLength(4);
  });

  it("nie podstawia pól drugi raz w nazwie klienta i zostawia nieznane pola", () => {
    const tricky = { ...acme, clientName: "Firma {data}" };
    const text = renderReminder(tricky, TODAY, EMPTY_SENDER_PROFILE, {
      ...REMINDER_TEMPLATES,
      4: "{klient} / {data} / {nieznane}",
    });
    expect(text).toBe("Firma {data} / 05.10.2026 / {nieznane}");
  });

  it("używa 'dzień' przy 1 dniu po terminie (progi [1, 2, 3, 4])", () => {
    const [reminder] = buildClientReminders([inv(ACME, "A/1", 10000, "2026-10-04")], TODAY, [1, 2, 3, 4]);
    expect(renderReminder(reminder, TODAY)).toContain("1 dzień po terminie");
  });

  it("liczy termin zapłaty przez koniec miesiąca (28.10 -> 04.11)", () => {
    const text = renderReminder(acme, "2026-10-28");
    expect(text).toContain("do 04.11.2026");
  });

  describe("dane nadawcy", () => {
    const FULL: SenderProfile = {
      companyName: "Firma Testowa Sp. z o.o.",
      nip: "5260250995",
      address: "ul. Prosta 1\n00-001 Warszawa",
      bankAccount: "61109010140000071219812874",
    };

    it("pełny profil: blok nadawcy kończy etap 4, a rachunek stoi w zdaniu o terminie", () => {
      const text = renderReminder(acme, TODAY, FULL);
      expect(text).toContain("uregulowana do 12.10.2026 na rachunek nr 61 1090 1014 0000 0712 1981 2874, sprawa");
      expect(
        text.endsWith("Z poważaniem\nFirma Testowa Sp. z o.o.\nul. Prosta 1\n00-001 Warszawa\nNIP: 5260250995"),
      ).toBe(true);
    });

    it("profil z samym kontem kończy się na 'Z poważaniem' i ma zdanie z rachunkiem", () => {
      const text = renderReminder(acme, TODAY, { ...EMPTY_SENDER_PROFILE, bankAccount: FULL.bankAccount });
      expect(text.endsWith("Z poważaniem")).toBe(true);
      expect(text).toContain("do 12.10.2026 na rachunek nr 61 1090 1014 0000 0712 1981 2874, sprawa");
    });

    it("profil bez konta nie ma 'na rachunek', a blok nadawcy zostaje", () => {
      const text = renderReminder(acme, TODAY, { ...FULL, bankAccount: null });
      expect(text).not.toContain("na rachunek");
      expect(text).toContain("do 12.10.2026, sprawa");
      expect(text.endsWith("NIP: 5260250995")).toBe(true);
    });

    it("adres z pustymi liniami i spacjami nie daje pustych linii w bloku", () => {
      const text = renderReminder(acme, TODAY, {
        ...EMPTY_SENDER_PROFILE,
        address: "  ul. Prosta 1  \n\n   \n00-001 Warszawa\n",
      });
      expect(text.endsWith("Z poważaniem\nul. Prosta 1\n00-001 Warszawa")).toBe(true);
    });

    it("nazwa firmy z polem w nawiasach nie jest podstawiana ponownie", () => {
      const text = renderReminder(acme, TODAY, { ...EMPTY_SENDER_PROFILE, companyName: "Firma {klient}" });
      expect(text.endsWith("Z poważaniem\nFirma {klient}")).toBe(true);
    });

    it("przy pełnym profilu żaden z 4 szablonów nie zostawia nawiasów klamrowych", () => {
      for (const stage of [1, 2, 3, 4] as const) {
        const text = renderReminder({ ...acme, stage }, TODAY, FULL);
        expect(text).not.toMatch(/[{}]/);
        expect(text).toContain("na rachunek nr 61 1090 1014 0000 0712 1981 2874");
        expect(text.endsWith("NIP: 5260250995")).toBe(true);
      }
    });
  });
});
