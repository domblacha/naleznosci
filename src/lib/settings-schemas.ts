import { z } from "zod";
import { parseHundredths } from "@/lib/format";
import type { EscalationSettings, EscalationSettingsInput } from "@/types";

// Ranges must match the checks in supabase/migrations/*_create_user_settings.sql.
const MAX_THRESHOLD_DAYS = 365;
const MAX_RATE_BP = 10_000;
const MAX_COMPENSATION_GROSZE = 10_000_000;

const THRESHOLD_MESSAGE = `Podaj liczbę dni od 1 do ${MAX_THRESHOLD_DAYS}`;
const THRESHOLD_ORDER_MESSAGE = "Próg musi być większy niż próg poprzedniego etapu";
const RATE_MESSAGE = "Podaj stopę od 0 do 100 z najwyżej 2 miejscami po przecinku, np. 13,75";
const COMPENSATION_MESSAGE = "Podaj kwotę od 0 do 100 000 zł, np. 297,50";
const DAYS_PATTERN = /^\d{1,3}$/;

/** Text field parsed by `parse`; null means invalid and is reported with `message` under the field. */
function parsedField(message: string, parse: (text: string) => number | null) {
  return z.string({ error: message }).transform((value, ctx) => {
    const parsed = parse(value);
    if (parsed === null) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return parsed;
  });
}

function inRange(value: number | null, max: number): number | null {
  return value !== null && value <= max ? value : null;
}

const thresholdSchema = parsedField(THRESHOLD_MESSAGE, (text) => {
  const trimmed = text.trim();
  if (!DAYS_PATTERN.test(trimmed)) return null;
  const days = Number(trimmed);
  return days >= 1 && days <= MAX_THRESHOLD_DAYS ? days : null;
});

const rateSchema = parsedField(RATE_MESSAGE, (text) => inRange(parseHundredths(text), MAX_RATE_BP));

const compensationSchema = parsedField(COMPENSATION_MESSAGE, (text) =>
  inRange(parseHundredths(text), MAX_COMPENSATION_GROSZE),
);

const THRESHOLD_KEYS = ["threshold1", "threshold2", "threshold3", "threshold4"] as const;

/**
 * Form/API input (`EscalationSettingsInput`, typed text) -> `EscalationSettings` (days, basis points, grosze).
 * Thresholds must strictly increase; the error goes under the second field of the pair. Field errors keep the input keys.
 */
export const settingsInputSchema: z.ZodType<EscalationSettings> = z
  .object({
    threshold1: thresholdSchema,
    threshold2: thresholdSchema,
    threshold3: thresholdSchema,
    threshold4: thresholdSchema,
    annualRate: rateSchema,
    compensation1: compensationSchema,
    compensation2: compensationSchema,
    compensation3: compensationSchema,
  } satisfies Record<keyof EscalationSettingsInput, z.ZodType>)
  .superRefine((value, ctx) => {
    for (let i = 1; i < THRESHOLD_KEYS.length; i++) {
      if (value[THRESHOLD_KEYS[i]] <= value[THRESHOLD_KEYS[i - 1]]) {
        ctx.addIssue({ code: "custom", message: THRESHOLD_ORDER_MESSAGE, path: [THRESHOLD_KEYS[i]] });
      }
    }
  })
  .transform((value) => ({
    thresholds: [value.threshold1, value.threshold2, value.threshold3, value.threshold4] as const,
    annualRateBp: value.annualRate,
    compensationGrosze: [value.compensation1, value.compensation2, value.compensation3] as const,
  }));
