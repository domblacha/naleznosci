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
