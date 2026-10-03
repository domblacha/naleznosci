import { z } from "zod";
import { isValidNip, normalizeNip } from "@/lib/nip";
import type { ClientInput } from "@/types";

const nameSchema = z
  .string({ error: "Podaj nazwę klienta" })
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1, "Podaj nazwę klienta").max(200, "Nazwa może mieć najwyżej 200 znaków"));

const nipSchema = z
  .string()
  .nullish()
  .transform((value) => {
    const normalized = normalizeNip(value ?? "");
    return normalized === "" ? null : normalized;
  })
  .refine((value) => value === null || isValidNip(value), "Podaj poprawny NIP (10 cyfr)");

export const clientInputSchema: z.ZodType<ClientInput> = z.object({
  name: nameSchema,
  nip: nipSchema,
  chargeCompensation: z.boolean().default(true),
});
