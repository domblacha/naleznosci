import { describe, expect, it } from "vitest";
import {
  chargeSettingsFrom,
  chargesAsOf,
  compensationGrosze,
  DEFAULT_CHARGE_SETTINGS,
  DEFAULT_ESCALATION_SETTINGS,
  frozenChargesAsOf,
  interestGrosze,
  paymentSnapshot,
} from "@/lib/charges";

describe("interestGrosze", () => {
  it("computes interest at the default rate", () => {
    const cases: [number, number, number][] = [
      [123456, 40, 1860],
      [100000, 1, 38],
      [100000, 365, 13750],
    ];
    for (const [amount, days, expected] of cases) {
      expect(interestGrosze(amount, days), `${amount} gr, ${days} dni`).toBe(expected);
    }
  });

  it("returns 0 for zero or negative days", () => {
    expect(interestGrosze(100000, 0)).toBe(0);
    expect(interestGrosze(100000, -3)).toBe(0);
  });

  it("rounds half up", () => {
    expect(interestGrosze(1825, 1, 1000)).toBe(1);
    expect(interestGrosze(1824, 1, 1000)).toBe(0);
  });

  it("rounds half up at the default rate over many days", () => {
    // 400000 * 1375 * 30 / 3650000 = 4520,5479...
    expect(interestGrosze(400000, 30)).toBe(4521);
    // 100000 * 1375 * 7 / 3650000 = 263,6986...
    expect(interestGrosze(100000, 7)).toBe(264);
  });

  it("keeps precision for the largest amount", () => {
    expect(interestGrosze(99999999999, 3650)).toBe(137499999999);
  });

  it("throws for a non-integer argument", () => {
    expect(() => interestGrosze(100.5, 1)).toThrow();
  });
});

describe("compensationGrosze", () => {
  // Art. 10 ust. 1 ustawy o przeciwdziałaniu nadmiernym opóźnieniom w transakcjach handlowych:
  // wartość „nie przekracza 5 000 zł” -> 40 EUR; „wyższa niż 5 000 zł i niższa niż 50 000 zł” -> 70 EUR;
  // „równa lub wyższa niż 50 000 zł” -> 100 EUR.
  it("picks the tier by amount (statutory boundaries)", () => {
    const cases: [number, number][] = [
      [100, 17000],
      [500000, 17000],
      [500001, 29750],
      [4999999, 29750],
      [5000000, 42500],
      [99999999999, 42500],
    ];
    for (const [amount, expected] of cases) {
      expect(compensationGrosze(amount, 1, true), `${amount} gr`).toBe(expected);
    }
  });

  it("returns 0 when the toggle is off", () => {
    expect(compensationGrosze(100000, 1, false)).toBe(0);
  });

  it("returns 0 when the due date has not passed", () => {
    expect(compensationGrosze(100000, 0, true)).toBe(0);
  });
});

describe("chargesAsOf", () => {
  const invoice = { dueDate: "2026-09-01", amountGrosze: 123456, clientChargesCompensation: true };

  it("returns zeros for payment before and on the due date", () => {
    const zero = { days: 0, interestGrosze: 0, compensationGrosze: 0 };
    expect(chargesAsOf(invoice, "2026-08-20")).toEqual(zero);
    expect(chargesAsOf(invoice, "2026-09-01")).toEqual(zero);
  });

  it("counts 1 day for payment one day after the due date", () => {
    expect(chargesAsOf(invoice, "2026-09-02")).toEqual({ days: 1, interestGrosze: 47, compensationGrosze: 17000 });
  });

  it("computes charges 40 days after the due date", () => {
    expect(chargesAsOf(invoice, "2026-10-11")).toEqual({ days: 40, interestGrosze: 1860, compensationGrosze: 17000 });
  });

  it("skips compensation for a client who does not charge it", () => {
    expect(chargesAsOf({ ...invoice, clientChargesCompensation: false }, "2026-10-11").compensationGrosze).toBe(0);
  });

  it("depends only on the given day, not on today's date", () => {
    expect(chargesAsOf(invoice, "2026-09-11")).toEqual({ days: 10, interestGrosze: 465, compensationGrosze: 17000 });
  });

  it("keeps accruing interest while escalation is paused (FR-007)", () => {
    // Wstrzymanie zatrzymuje tylko eskalację; dodatkowe pole pausedOn nie zmienia kwot.
    const paused = { ...invoice, pausedOn: "2026-09-15" };
    expect(chargesAsOf(paused, "2026-10-11")).toEqual({ days: 40, interestGrosze: 1860, compensationGrosze: 17000 });
    expect(chargesAsOf(invoice, "2026-10-11")).toEqual({ days: 40, interestGrosze: 1860, compensationGrosze: 17000 });
  });
});

describe("chargeSettingsFrom", () => {
  it("default settings: day thresholds from PRD FR-005, rate and amounts from the statute (40/70/100 EUR at ~4.25 PLN)", () => {
    expect(DEFAULT_ESCALATION_SETTINGS).toEqual({
      thresholds: [3, 7, 14, 30],
      annualRateBp: 1375,
      compensationGrosze: [17000, 29750, 42500],
    });
  });

  it("yields the statutory tier boundaries for default settings", () => {
    expect(chargeSettingsFrom(DEFAULT_ESCALATION_SETTINGS)).toEqual({
      annualRateBp: 1375,
      compensationTiers: [
        { maxAmountGrosze: 500000, inclusive: true, compensationGrosze: 17000 },
        { maxAmountGrosze: 5000000, inclusive: false, compensationGrosze: 29750 },
        { maxAmountGrosze: null, inclusive: false, compensationGrosze: 42500 },
      ],
    });
  });

  it("keeps statutory tier boundaries and takes the user's rate and amounts", () => {
    const settings = chargeSettingsFrom({
      thresholds: [1, 2, 3, 4],
      annualRateBp: 1000,
      compensationGrosze: [10000, 20000, 0],
    });
    expect(settings.annualRateBp).toBe(1000);
    const cases: [number, number][] = [
      [500000, 10000],
      [500001, 20000],
      [4999999, 20000],
      [5000000, 0],
    ];
    for (const [amount, expected] of cases) {
      expect(compensationGrosze(amount, 1, true, settings.compensationTiers), `${amount} gr`).toBe(expected);
    }
  });
});

describe("paymentSnapshot and frozenChargesAsOf", () => {
  const custom = chargeSettingsFrom({
    thresholds: [3, 7, 14, 30],
    annualRateBp: 1000,
    compensationGrosze: [10000, 20000, 30000],
  });
  const invoices = [
    { dueDate: "2026-09-01", amountGrosze: 123456, clientChargesCompensation: true },
    { dueDate: "2026-09-01", amountGrosze: 650000, clientChargesCompensation: true },
    { dueDate: "2026-09-01", amountGrosze: 5000000, clientChargesCompensation: true },
    { dueDate: "2026-09-01", amountGrosze: 650000, clientChargesCompensation: false },
  ];

  it("matches chargesAsOf for the same settings", () => {
    for (const settings of [DEFAULT_CHARGE_SETTINGS, custom]) {
      for (const invoice of invoices) {
        for (const asOf of ["2026-08-20", "2026-09-01", "2026-09-02", "2026-10-11"]) {
          expect(frozenChargesAsOf(invoice, paymentSnapshot(invoice, settings), asOf)).toEqual(
            chargesAsOf(invoice, asOf, settings),
          );
        }
      }
    }
  });

  it("yields hand-computed amounts for custom settings on 2026-10-11 (40 days)", () => {
    const expected = [
      { days: 40, interestGrosze: 1353, compensationGrosze: 10000 },
      { days: 40, interestGrosze: 7123, compensationGrosze: 20000 },
      { days: 40, interestGrosze: 54795, compensationGrosze: 30000 },
      { days: 40, interestGrosze: 7123, compensationGrosze: 0 },
    ];
    invoices.forEach((invoice, i) => {
      expect(chargesAsOf(invoice, "2026-10-11", custom), `${invoice.amountGrosze} gr`).toEqual(expected[i]);
      expect(frozenChargesAsOf(invoice, paymentSnapshot(invoice, custom), "2026-10-11")).toEqual(expected[i]);
    });
  });

  it("stores the tier amount and rate from settings", () => {
    expect(paymentSnapshot(invoices[1], custom)).toEqual({ rateBp: 1000, compensationGrosze: 20000 });
  });

  it("shows no compensation for on-time payment despite the snapshot amount", () => {
    const snapshot = { rateBp: 1375, compensationGrosze: 17000 };
    expect(frozenChargesAsOf(invoices[0], snapshot, "2026-09-01")).toEqual({
      days: 0,
      interestGrosze: 0,
      compensationGrosze: 0,
    });
  });

  it("stores 0 for a client without compensation", () => {
    const snapshot = paymentSnapshot(invoices[3], DEFAULT_CHARGE_SETTINGS);
    expect(snapshot.compensationGrosze).toBe(0);
    expect(frozenChargesAsOf(invoices[3], snapshot, "2026-10-11").compensationGrosze).toBe(0);
  });

  it("stops interest on the payment date", () => {
    const paid = { dueDate: "2026-09-01", amountGrosze: 100000, paidOn: "2026-09-11" };
    const snapshot = { rateBp: 1375, compensationGrosze: 17000 };
    // Historia podaje paidOn jako asOf (PaidInvoicesManager.tsx:90), więc późniejsze „dziś” nie wpływa na wynik.
    expect(frozenChargesAsOf(paid, snapshot, paid.paidOn)).toEqual({
      days: 10,
      interestGrosze: 377,
      compensationGrosze: 17000,
    });
  });

  it("changing settings does not change the result for the same snapshot", () => {
    const snapshot = paymentSnapshot(invoices[0], DEFAULT_CHARGE_SETTINGS);
    const frozen = frozenChargesAsOf(invoices[0], snapshot, "2026-10-11");
    // Po zmianie ustawień bieżące wyliczenie jest inne, a wynik z migawki zostaje taki jak przy wpłacie.
    expect(frozen).toEqual({ days: 40, interestGrosze: 1860, compensationGrosze: 17000 });
    expect(chargesAsOf(invoices[0], "2026-10-11", custom)).toEqual({
      days: 40,
      interestGrosze: 1353,
      compensationGrosze: 10000,
    });
  });
});
