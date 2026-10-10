const BANK_ACCOUNT_PATTERN = /^[0-9]{26}$/;
// "PL" as IBAN digits (P = 25, L = 21) followed by the "00" check placeholder moved to the end.
const COUNTRY_DIGITS = "2521";

export function normalizeBankAccount(raw: string): string {
  return raw.replace(/[\s-]/g, "").replace(/^pl/i, "");
}

/** 26 digits (without `PL`) that pass the IBAN mod-97 check. */
export function isValidBankAccount(digits: string): boolean {
  if (!BANK_ACCOUNT_PATTERN.test(digits)) return false;
  const checkDigits = digits.slice(0, 2);
  const bban = digits.slice(2);
  return BigInt(bban + COUNTRY_DIGITS + checkDigits) % 97n === 1n;
}

/** "61 1090 1014 0000 0712 1981 2874": 2 digits followed by 6 groups of 4. */
export function formatBankAccount(digits: string): string {
  return `${digits.slice(0, 2)} ${
    digits
      .slice(2)
      .match(/.{1,4}/g)
      ?.join(" ") ?? ""
  }`.trim();
}
