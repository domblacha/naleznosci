const currencyFormat = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });

export function formatAmount(grosze: number): string {
  return currencyFormat.format(grosze / 100);
}

/** YYYY-MM-DD -> DD.MM.YYYY */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}
