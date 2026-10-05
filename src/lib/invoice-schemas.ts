import { z } from "zod";
import type { InvoiceInput } from "@/types";

const AMOUNT_MESSAGE = "Podaj kwotę większą od zera, np. 1 234,56";
const DUE_DATE_MESSAGE = "Podaj poprawny termin płatności";
// Must match the amount_grosze check in supabase/migrations/*_create_invoices.sql.
const MAX_AMOUNT_GROSZE = 99_999_999_999;
const AMOUNT_PATTERN = /^(\d+)(?:[.,](\d{1,2}))?$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const numberSchema = z
  .string({ error: "Podaj numer faktury" })
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1, "Podaj numer faktury").max(50, "Numer może mieć najwyżej 50 znaków"));

/** Parses "1 234,56" into grosze without floating point. Returns null when the text is not a valid amount. */
function parseAmountGrosze(text: string): number | null {
  const match = AMOUNT_PATTERN.exec(text.replace(/\s/g, ""));
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  const grosze = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return grosze > 0 && grosze <= MAX_AMOUNT_GROSZE ? grosze : null;
}

const amountSchema = z.string({ error: AMOUNT_MESSAGE }).transform((value, ctx) => {
  const grosze = parseAmountGrosze(value);
  if (grosze === null) {
    ctx.addIssue({ code: "custom", message: AMOUNT_MESSAGE });
    return z.NEVER;
  }
  return grosze;
});

function isValidDueDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 2000 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const dueDateSchema = z.string({ error: DUE_DATE_MESSAGE }).refine(isValidDueDate, DUE_DATE_MESSAGE);

/** Form/API input (`amount` as typed text) -> `InvoiceInput` (`amountGrosze`). Field errors keep the input keys. */
export const invoiceInputSchema: z.ZodType<InvoiceInput> = z
  .object({
    clientId: z.uuid({ error: "Wybierz klienta" }),
    number: numberSchema,
    amount: amountSchema,
    dueDate: dueDateSchema,
  })
  .transform(({ clientId, number, amount, dueDate }) => ({ clientId, number, amountGrosze: amount, dueDate }));
