// Kwoty należne od klienta: odsetki za opóźnienie i rekompensata za koszty odzyskiwania.
// Wszystko w groszach, bez liczb zmiennoprzecinkowych.

export interface CompensationTier {
  // Górna granica progu w groszach; null = brak górnej granicy (ostatni próg).
  maxAmountGrosze: number | null;
  // Czy kwota równa granicy należy jeszcze do tego progu.
  inclusive: boolean;
  compensationGrosze: number;
}

export interface ChargeSettings {
  // Roczna stopa odsetek w punktach bazowych (13,75% = 1375).
  annualRateBp: number;
  compensationTiers: readonly [CompensationTier, CompensationTier, CompensationTier];
}

// Źródło: odsetki handlowe za II półrocze 2026 oraz art. 10 ustawy o przeciwdziałaniu
// nadmiernym opóźnieniom w transakcjach handlowych (rekompensata 40/70/100 EUR po ok. 4,25 zł).
// S-10 przeniesie te wartości do ustawień użytkownika.
export const DEFAULT_CHARGE_SETTINGS: ChargeSettings = {
  annualRateBp: 1375,
  compensationTiers: [
    // kwota <= 5 000 zł -> 170,00 zł
    { maxAmountGrosze: 500_000, inclusive: true, compensationGrosze: 17_000 },
    // kwota > 5 000 zł i < 50 000 zł -> 297,50 zł
    { maxAmountGrosze: 5_000_000, inclusive: false, compensationGrosze: 29_750 },
    // kwota >= 50 000 zł -> 425,00 zł
    { maxAmountGrosze: null, inclusive: false, compensationGrosze: 42_500 },
  ],
};

// 365 dni * 10 000 punktów bazowych na 100%.
const INTEREST_DENOMINATOR = 3_650_000n;

// Iloczyn kwoty, stopy i dni przekracza Number.MAX_SAFE_INTEGER dla największych kwot, więc BigInt.
// Zaokrąglenie połowa w górę: (2n + den) / (2 * den), wartości nieujemne.
export function interestGrosze(
  amountGrosze: number,
  days: number,
  annualRateBp: number = DEFAULT_CHARGE_SETTINGS.annualRateBp,
): number {
  if (days <= 0) return 0;
  const n = BigInt(amountGrosze) * BigInt(annualRateBp) * BigInt(days);
  return Number((2n * n + INTEREST_DENOMINATOR) / (2n * INTEREST_DENOMINATOR));
}

export function compensationGrosze(
  amountGrosze: number,
  days: number,
  chargeCompensation: boolean,
  tiers: ChargeSettings["compensationTiers"] = DEFAULT_CHARGE_SETTINGS.compensationTiers,
): number {
  if (days <= 0 || !chargeCompensation) return 0;
  const tier =
    tiers.find(
      (t) =>
        t.maxAmountGrosze === null ||
        amountGrosze < t.maxAmountGrosze ||
        (t.inclusive && amountGrosze === t.maxAmountGrosze),
    ) ?? tiers[tiers.length - 1];
  return tier.compensationGrosze;
}
