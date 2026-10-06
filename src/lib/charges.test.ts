import { describe, expect, it } from "vitest";
import { compensationGrosze, interestGrosze } from "@/lib/charges";

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
