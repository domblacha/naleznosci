import { describe, expect, it } from "vitest";
import { invoiceInputSchema, paymentInputSchema } from "@/lib/invoice-schemas";

const CLIENT_ID = "3f1c2b7e-8d4a-4c3b-9e2f-1a2b3c4d5e6f";
const valid = { clientId: CLIENT_ID, number: "FV/1/2026", amount: "100", dueDate: "2026-10-30" };

function parse(overrides: Record<string, unknown>) {
  return invoiceInputSchema.safeParse({ ...valid, ...overrides });
}

function firstMessage(overrides: Record<string, unknown>) {
  return parse(overrides).error?.issues[0].message;
}

describe("invoiceInputSchema: kwota", () => {
  it.each([
    ["1 234,56", 123456],
    ["1234.5", 123450],
    ["0,29", 29],
    ["100", 10000],
    ["999 999 999,99", 99999999999],
    ["1 234,56", 123456],
  ])("zamienia %j na %i groszy", (amount, grosze) => {
    expect(invoiceInputSchema.parse({ ...valid, amount }).amountGrosze).toBe(grosze);
  });

  it.each(["0", "0,00", "-5", "12,345", "abc", "", "1 000 000 000,00"])("odrzuca %j", (amount) => {
    expect(firstMessage({ amount })).toBe("Podaj kwotę większą od zera, np. 1 234,56");
  });

  it("zgłasza błąd pod polem amount", () => {
    expect(parse({ amount: "0" }).error?.issues[0].path).toEqual(["amount"]);
  });
});

describe("invoiceInputSchema: numer", () => {
  it("przycina numer i zwija spacje", () => {
    expect(invoiceInputSchema.parse({ ...valid, number: "  FV/1/2026  " }).number).toBe("FV/1/2026");
  });

  it("odrzuca pusty numer", () => {
    expect(firstMessage({ number: "   " })).toBe("Podaj numer faktury");
  });

  it("odrzuca numer dłuższy niż 50 znaków", () => {
    expect(firstMessage({ number: "a".repeat(51) })).toBe("Numer może mieć najwyżej 50 znaków");
  });
});

describe("invoiceInputSchema: termin", () => {
  it.each(["2026-02-30", "30.10.2026"])("odrzuca %j", (dueDate) => {
    expect(firstMessage({ dueDate })).toBe("Podaj poprawny termin płatności");
  });

  it("przyjmuje datę z przeszłości", () => {
    expect(invoiceInputSchema.parse({ ...valid, dueDate: "2020-01-15" }).dueDate).toBe("2020-01-15");
  });
});

describe("invoiceInputSchema: klient", () => {
  it("wymaga klienta", () => {
    expect(firstMessage({ clientId: undefined })).toBe("Wybierz klienta");
  });
});

describe("paymentInputSchema", () => {
  const schema = paymentInputSchema("2026-10-07");
  const message = (input: unknown) => schema.safeParse(input).error?.issues[0].message;

  it.each(["2026-10-07", "2026-10-06", "2026-01-01"])("przyjmuje %s", (paidOn) => {
    expect(schema.parse({ paidOn })).toEqual({ paidOn });
  });

  it("odrzuca jutro", () => {
    expect(message({ paidOn: "2026-10-08" })).toBe("Data wpłaty nie może być późniejsza niż dziś");
  });

  it.each(["2026-02-30", "07.10.2026", ""])("odrzuca niepoprawną datę %j", (paidOn) => {
    expect(message({ paidOn })).toBe("Podaj poprawną datę wpłaty");
  });

  it("odrzuca brak pola", () => {
    expect(message({})).toBe("Podaj poprawną datę wpłaty");
  });
});
