import { describe, expect, it } from "vitest";
import { isValidNip, normalizeNip } from "@/lib/nip";

describe("normalizeNip", () => {
  it("usuwa spacje i myślniki", () => {
    expect(normalizeNip(" 123 456-32 18 ")).toBe("1234563218");
  });

  it("usuwa prefiks PL bez rozróżniania wielkości liter", () => {
    expect(normalizeNip("PL1234563218")).toBe("1234563218");
    expect(normalizeNip("pl1234563218")).toBe("1234563218");
  });

  it("obsługuje kombinacje prefiksu, spacji i myślników", () => {
    expect(normalizeNip("PL 123-456-32-18")).toBe("1234563218");
    expect(normalizeNip("pl-123 456 32-18")).toBe("1234563218");
  });

  it("zwraca pusty string dla samych białych znaków", () => {
    expect(normalizeNip("  - ")).toBe("");
  });
});

describe("isValidNip", () => {
  it("akceptuje poprawny NIP", () => {
    expect(isValidNip("1234563218")).toBe(true);
  });

  it("odrzuca złą sumę kontrolną", () => {
    expect(isValidNip("1234563219")).toBe(false);
  });

  it("odrzuca NIP, którego suma mod 11 daje 10", () => {
    // 123456789 -> suma 340, 340 mod 11 = 10, więc żadna cyfra kontrolna nie jest poprawna.
    for (let d = 0; d <= 9; d++) {
      expect(isValidNip(`123456789${d}`)).toBe(false);
    }
  });

  it("odrzuca 9 i 11 cyfr", () => {
    expect(isValidNip("123456321")).toBe(false);
    expect(isValidNip("12345632180")).toBe(false);
  });

  it("odrzuca litery i znaki nienumeryczne", () => {
    expect(isValidNip("12345632a8")).toBe(false);
    expect(isValidNip("123-456-32-18")).toBe(false);
    expect(isValidNip("")).toBe(false);
  });
});
