import { describe, expect, it } from "vitest";
import { formatAmount, formatDate } from "@/lib/format";

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
