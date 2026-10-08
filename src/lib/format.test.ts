import { describe, expect, it } from "vitest";
import { amountInputText, formatAmount, formatDate } from "@/lib/format";
import { invoiceInputSchema } from "@/lib/invoice-schemas";

describe("formatAmount", () => {
  it("formatuje grosze jako PLN z twardą spacją przed zł", () => {
    expect(formatAmount(123456)).toBe("1234,56 zł");
    expect(formatAmount(0)).toBe("0,00 zł");
  });

  it("dodaje separator tysięcy od 5 cyfr części całkowitej", () => {
    expect(formatAmount(1234567)).toBe("12 345,67 zł");
  });
});

describe("formatDate", () => {
  it("zamienia YYYY-MM-DD na DD.MM.YYYY", () => {
    expect(formatDate("2026-08-20")).toBe("20.08.2026");
  });
});

describe("amountInputText", () => {
  it("zamienia grosze na tekst z przecinkiem", () => {
    expect(amountInputText(123456)).toBe("1234,56");
    expect(amountInputText(100)).toBe("1,00");
    expect(amountInputText(1)).toBe("0,01");
  });

  it("wraca przez invoiceInputSchema do tych samych groszy", () => {
    for (const grosze of [1, 100, 123456, 99_999_999_999]) {
      const parsed = invoiceInputSchema.parse({
        clientId: "11111111-1111-4111-8111-111111111111",
        number: "FV/1",
        amount: amountInputText(grosze),
        dueDate: "2026-10-07",
      });
      expect(parsed.amountGrosze).toBe(grosze);
    }
  });
});
