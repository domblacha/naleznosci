// Kwoty należne od klienta: odsetki za opóźnienie i rekompensata za koszty odzyskiwania.
// Wszystko w groszach, bez liczb zmiennoprzecinkowych. Kwoty, dni i stopy muszą być liczbami
// całkowitymi (walidacja w src/lib/settings-schemas.ts i invoice-schemas.ts); ułamek rzuca wyjątek z BigInt.

import { DEFAULT_THRESHOLDS, daysOverdue } from "@/lib/escalation";
import type { EscalationSettings } from "@/types";

/** Próg z górną granicą w groszach. */
export interface BoundedTier {
  maxAmountGrosze: number;
  // Czy kwota równa granicy należy jeszcze do tego progu.
  inclusive: boolean;
  compensationGrosze: number;
}

/** Ostatni próg: bez górnej granicy. */
export interface OpenTier {
  maxAmountGrosze: null;
  inclusive: false;
  compensationGrosze: number;
}

export type CompensationTiers = readonly [BoundedTier, BoundedTier, OpenTier];

export interface ChargeSettings {
  // Roczna stopa odsetek w punktach bazowych (13,75% = 1375).
  annualRateBp: number;
  compensationTiers: CompensationTiers;
}

// Źródło: odsetki handlowe za II półrocze 2026 oraz art. 10 ustawy o przeciwdziałaniu
// nadmiernym opóźnieniom w transakcjach handlowych (rekompensata 40/70/100 EUR po ok. 4,25 zł).
// Granice progów są ustawowe; użytkownik zmienia tylko stopę i kwoty (chargeSettingsFrom).
// UWAGA: backfill migawki w supabase/migrations/20261010130000_add_invoice_payment_snapshot.sql powiela te
// wartości; w chwili tej migracji muszą się zgadzać.
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

/** Ustawienia użytkownika, który niczego nie zapisał. */
export const DEFAULT_ESCALATION_SETTINGS: EscalationSettings = {
  thresholds: DEFAULT_THRESHOLDS,
  annualRateBp: DEFAULT_CHARGE_SETTINGS.annualRateBp,
  compensationGrosze: [
    DEFAULT_CHARGE_SETTINGS.compensationTiers[0].compensationGrosze,
    DEFAULT_CHARGE_SETTINGS.compensationTiers[1].compensationGrosze,
    DEFAULT_CHARGE_SETTINGS.compensationTiers[2].compensationGrosze,
  ],
};

/** Ustawowe granice progów z DEFAULT_CHARGE_SETTINGS i kwoty użytkownika. */
export function chargeSettingsFrom(settings: EscalationSettings): ChargeSettings {
  const [first, second, last] = DEFAULT_CHARGE_SETTINGS.compensationTiers;
  const [c1, c2, c3] = settings.compensationGrosze;
  return {
    annualRateBp: settings.annualRateBp,
    compensationTiers: [
      { ...first, compensationGrosze: c1 },
      { ...second, compensationGrosze: c2 },
      { ...last, compensationGrosze: c3 },
    ],
  };
}

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
  tiers: CompensationTiers = DEFAULT_CHARGE_SETTINGS.compensationTiers,
): number {
  if (days <= 0 || !chargeCompensation) return 0;
  const [first, second, last] = tiers;
  if (withinTier(amountGrosze, first)) return first.compensationGrosze;
  if (withinTier(amountGrosze, second)) return second.compensationGrosze;
  return last.compensationGrosze;
}

function withinTier(amountGrosze: number, tier: BoundedTier): boolean {
  return amountGrosze < tier.maxAmountGrosze || (tier.inclusive && amountGrosze === tier.maxAmountGrosze);
}

export interface ChargesAsOf {
  days: number;
  interestGrosze: number;
  compensationGrosze: number;
}

/** Dni opóźnienia, odsetki i rekompensata faktury na wskazany dzień (np. dzień wpłaty). */
export function chargesAsOf(
  invoice: { dueDate: string; amountGrosze: number; clientChargesCompensation: boolean },
  asOf: string,
  settings: ChargeSettings = DEFAULT_CHARGE_SETTINGS,
): ChargesAsOf {
  const days = Math.max(0, daysOverdue(invoice.dueDate, asOf));
  return {
    days,
    interestGrosze: interestGrosze(invoice.amountGrosze, days, settings.annualRateBp),
    compensationGrosze: compensationGrosze(
      invoice.amountGrosze,
      days,
      invoice.clientChargesCompensation,
      settings.compensationTiers,
    ),
  };
}

/** Stopa i kwota rekompensaty zamrożone na fakturze przy oznaczeniu jako zapłacona. */
export interface PaymentSnapshot {
  rateBp: number;
  // Kwota progu faktury niezależna od dni (0, gdy klient nie nalicza rekompensaty).
  compensationGrosze: number;
}

/** Migawka z ustawień właściciela w chwili oznaczenia faktury jako zapłaconej. */
export function paymentSnapshot(
  invoice: { amountGrosze: number; clientChargesCompensation: boolean },
  settings: ChargeSettings,
): PaymentSnapshot {
  return {
    rateBp: settings.annualRateBp,
    // Dowolny dodatni dzień daje kwotę progu.
    compensationGrosze: compensationGrosze(
      invoice.amountGrosze,
      1,
      invoice.clientChargesCompensation,
      settings.compensationTiers,
    ),
  };
}

/** Jak chargesAsOf, ale tylko z danych faktury i jej migawki (historia zapłaconych faktur). */
export function frozenChargesAsOf(
  invoice: { dueDate: string; amountGrosze: number },
  snapshot: PaymentSnapshot,
  asOf: string,
): ChargesAsOf {
  const days = Math.max(0, daysOverdue(invoice.dueDate, asOf));
  return {
    days,
    interestGrosze: interestGrosze(invoice.amountGrosze, days, snapshot.rateBp),
    compensationGrosze: days > 0 ? snapshot.compensationGrosze : 0,
  };
}
