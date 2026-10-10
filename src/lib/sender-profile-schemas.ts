import { z } from "zod";
import { isValidBankAccount, normalizeBankAccount } from "@/lib/iban";
import { isValidNip, normalizeNip } from "@/lib/nip";
import type { SenderProfile, SenderProfileInput } from "@/types";

// Limits must match the checks in supabase/migrations/*_create_sender_profiles.sql.
const MAX_COMPANY_NAME_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 300;

/** Optional text field: trimmed, empty becomes null; a missing key counts as empty. */
function optionalText(normalize: (value: string) => string) {
  return z
    .string()
    .nullish()
    .transform((value) => {
      const normalized = normalize(value ?? "");
      return normalized === "" ? null : normalized;
    });
}

const companyNameSchema = optionalText((value) => value.trim()).refine(
  (value) => value === null || value.length <= MAX_COMPANY_NAME_LENGTH,
  `Nazwa firmy może mieć najwyżej ${MAX_COMPANY_NAME_LENGTH} znaków`,
);

const nipSchema = optionalText(normalizeNip).refine(
  (value) => value === null || isValidNip(value),
  "Podaj poprawny NIP (10 cyfr)",
);

// Newlines are kept: the address is a multi-line field.
const addressSchema = optionalText((value) => value.trim()).refine(
  (value) => value === null || value.length <= MAX_ADDRESS_LENGTH,
  `Adres może mieć najwyżej ${MAX_ADDRESS_LENGTH} znaków`,
);

const bankAccountSchema = optionalText(normalizeBankAccount).refine(
  (value) => value === null || isValidBankAccount(value),
  "Podaj poprawny numer konta (26 cyfr, np. 61 1090 1014 0000 0712 1981 2874)",
);

/** Form/API input (`SenderProfileInput`, typed text) -> `SenderProfile` (normalized values, null for empty). */
export const senderProfileInputSchema: z.ZodType<SenderProfile> = z.object({
  companyName: companyNameSchema,
  nip: nipSchema,
  address: addressSchema,
  bankAccount: bankAccountSchema,
} satisfies Record<keyof SenderProfileInput, z.ZodType>);
