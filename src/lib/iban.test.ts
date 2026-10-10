import { describe, expect, it } from "vitest";
import { formatBankAccount, isValidBankAccount, normalizeBankAccount } from "@/lib/iban";

const VALID = "61109010140000071219812874";

describe("normalizeBankAccount", () => {
  it("usuwa spacje i myślniki", () => {
    expect(normalizeBankAccount(" 61 1090 1014-0000 0712-1981 2874 ")).toBe(VALID);
  });

  it("usuwa prefiks PL bez rozróżniania wielkości liter", () => {
    expect(normalizeBankAccount(`PL${VALID}`)).toBe(VALID);
    expect(normalizeBankAccount(`pl${VALID}`)).toBe(VALID);
  });

  it("obsługuje kombinacje prefiksu, spacji i myślników", () => {
    expect(normalizeBankAccount("PL61 1090-1014 0000 0712 1981 2874")).toBe(VALID);
  });

  it("zwraca pusty string dla samych białych znaków", () => {
    expect(normalizeBankAccount("  - ")).toBe("");
  });
});

describe("isValidBankAccount", () => {
  it("przyjmuje poprawny numer", () => {
    expect(isValidBankAccount(VALID)).toBe(true);
  });

  it("przyjmuje numer po normalizacji z prefiksem, spacjami i myślnikami", () => {
    expect(isValidBankAccount(normalizeBankAccount(`PL${VALID}`))).toBe(true);
    expect(isValidBankAccount(normalizeBankAccount("61 1090 1014 0000 0712 1981 2874"))).toBe(true);
    expect(isValidBankAccount(normalizeBankAccount("pl61-1090-1014-0000-0712-1981-2874"))).toBe(true);
  });

  it("odrzuca numer ze zmienioną jedną cyfrą", () => {
    expect(isValidBankAccount("61109010140000071219812875")).toBe(false);
    expect(isValidBankAccount("62109010140000071219812874")).toBe(false);
  });

  it("odrzuca 25 i 27 cyfr", () => {
    expect(isValidBankAccount(VALID.slice(0, 25))).toBe(false);
    expect(isValidBankAccount(`${VALID}4`)).toBe(false);
  });

  it("odrzuca litery w środku", () => {
    expect(isValidBankAccount("6110901014000007121981287A")).toBe(false);
    expect(isValidBankAccount("611090101400X0071219812874")).toBe(false);
  });

  it("odrzuca pusty tekst", () => {
    expect(isValidBankAccount("")).toBe(false);
  });
});

describe("formatBankAccount", () => {
  it("grupuje 2 cyfry i 6 grup po 4", () => {
    expect(formatBankAccount(VALID)).toBe("61 1090 1014 0000 0712 1981 2874");
  });
});
