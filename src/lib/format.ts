const currencyFormat = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });

export function formatAmount(grosze: number): string {
  return currencyFormat.format(grosze / 100);
}

/** YYYY-MM-DD -> DD.MM.YYYY */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

/** Grosze -> text for the amount input, e.g. 123456 -> "1234,56" (parsed back by `invoiceInputSchema`). */
export function amountInputText(grosze: number): string {
  const whole = Math.floor(grosze / 100);
  const fraction = String(grosze % 100).padStart(2, "0");
  return `${whole},${fraction}`;
}

const HUNDREDTHS_PATTERN = /^(\d+)(?:[.,](\d{1,2}))?$/;

/**
 * Parses a non-negative decimal with at most 2 fractional digits ("1 234,56", "13.75") into hundredths
 * (grosze, basis points) without floating point. Whitespace is ignored. Returns null for any other text.
 */
export function parseHundredths(text: string): number | null {
  const match = HUNDREDTHS_PATTERN.exec(text.replace(/\s/g, ""));
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
