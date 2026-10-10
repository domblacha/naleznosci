import { describe, expect, it } from "vitest";
import {
  chargeSettingsFrom,
  chargesAsOf,
  compensationGrosze,
  DEFAULT_CHARGE_SETTINGS,
  DEFAULT_ESCALATION_SETTINGS,
  interestGrosze,
} from "@/lib/charges";

describe("interestGrosze", () => {
  it("liczy odsetki według domyślnej stopy", () => {
    const cases: [number, number, number][] = [
      [123456, 40, 1860],
      [100000, 1, 38],
      [100000, 365, 13750],
    ];
    for (const [amount, days, expected] of cases) {
      expect(interestGrosze(amount, days), `${amount} gr, ${days} dni`).toBe(expected);
    }
  });

  it("zwraca 0 dla zera lub ujemnej liczby dni", () => {
    expect(interestGrosze(100000, 0)).toBe(0);
    expect(interestGrosze(100000, -3)).toBe(0);
  });

  it("zaokrągla połowę w górę", () => {
    expect(interestGrosze(1825, 1, 1000)).toBe(1);
    expect(interestGrosze(1824, 1, 1000)).toBe(0);
  });

  it("nie traci precyzji dla największej kwoty", () => {
    expect(interestGrosze(99999999999, 3650)).toBe(137499999999);
  });

  it("rzuca wyjątek dla argumentu, który nie jest liczbą całkowitą", () => {
    expect(() => interestGrosze(100.5, 1)).toThrow();
  });
});

describe("compensationGrosze", () => {
  it("dobiera próg według kwoty (granice zgodnie z ustawą)", () => {
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

  it("zwraca 0, gdy przełącznik jest wyłączony", () => {
    expect(compensationGrosze(100000, 1, false)).toBe(0);
  });

  it("zwraca 0, gdy termin nie minął", () => {
    expect(compensationGrosze(100000, 0, true)).toBe(0);
  });
});

describe("chargesAsOf", () => {
  const invoice = { dueDate: "2026-09-01", amountGrosze: 123456, clientChargesCompensation: true };

  it("zwraca zera przy wpłacie przed terminem i w dniu terminu", () => {
    const zero = { days: 0, interestGrosze: 0, compensationGrosze: 0 };
    expect(chargesAsOf(invoice, "2026-08-20")).toEqual(zero);
    expect(chargesAsOf(invoice, "2026-09-01")).toEqual(zero);
  });

  it("liczy 1 dzień przy wpłacie dzień po terminie", () => {
    expect(chargesAsOf(invoice, "2026-09-02")).toEqual({ days: 1, interestGrosze: 47, compensationGrosze: 17000 });
  });

  it("zgadza się z funkcjami bazowymi dla 40 dni", () => {
    expect(chargesAsOf(invoice, "2026-10-11")).toEqual({
      days: 40,
      interestGrosze: interestGrosze(123456, 40),
      compensationGrosze: compensationGrosze(123456, 40, true),
    });
    expect(interestGrosze(123456, 40)).toBe(1860);
  });

  it("pomija rekompensatę dla klienta, który jej nie nalicza", () => {
    expect(chargesAsOf({ ...invoice, clientChargesCompensation: false }, "2026-10-11").compensationGrosze).toBe(0);
  });

  it("zależy tylko od dnia wskazanego, nie od dzisiejszej daty", () => {
    expect(chargesAsOf(invoice, "2026-09-11")).toEqual(chargesAsOf(invoice, "2026-09-11"));
    expect(chargesAsOf(invoice, "2026-09-11").days).toBe(10);
  });
});

describe("chargeSettingsFrom", () => {
  it("dla ustawień domyślnych daje DEFAULT_CHARGE_SETTINGS", () => {
    expect(chargeSettingsFrom(DEFAULT_ESCALATION_SETTINGS)).toEqual(DEFAULT_CHARGE_SETTINGS);
  });

  it("zachowuje ustawowe granice progów i bierze stopę oraz kwoty użytkownika", () => {
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
