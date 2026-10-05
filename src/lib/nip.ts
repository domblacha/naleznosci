const WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

export function normalizeNip(raw: string): string {
  return raw.replace(/[\s-]/g, "").replace(/^pl/i, "");
}

export function isValidNip(nip: string): boolean {
  if (!/^[0-9]{10}$/.test(nip)) return false;
  const digits = Array.from(nip, Number);
  const sum = WEIGHTS.reduce((acc, weight, i) => acc + weight * digits[i], 0);
  const check = sum % 11;
  return check !== 10 && check === digits[9];
}
