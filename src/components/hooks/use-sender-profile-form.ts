import { useState } from "react";
import type React from "react";
import { z } from "zod";
import { formatBankAccount } from "@/lib/iban";
import { senderProfileInputSchema } from "@/lib/sender-profile-schemas";
import type { SenderProfile, SenderProfileInput } from "@/types";

export type SenderProfileField = keyof SenderProfileInput;
export type SenderProfileFormErrors = Partial<Record<SenderProfileField, string>>;

interface ErrorBody {
  error?: string;
  fieldErrors?: Partial<Record<SenderProfileField, string[]>>;
}

const DEFAULT_MESSAGE = "Coś poszło nie tak. Spróbuj ponownie.";
const MESSAGES: Record<string, string> = {
  unauthorized: "Zaloguj się, aby zmienić dane nadawcy.",
  config_missing: "Zapis ustawień jest niedostępny: brak konfiguracji serwera.",
};

function senderProfileErrorMessage(code: string): string {
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : DEFAULT_MESSAGE;
}

/** Profile (null = missing, account as 26 digits) -> form text; the account is shown grouped. */
export function senderProfileInputText(profile: SenderProfile): SenderProfileInput {
  return {
    companyName: profile.companyName ?? "",
    nip: profile.nip ?? "",
    address: profile.address ?? "",
    bankAccount: profile.bankAccount === null ? "" : formatBankAccount(profile.bankAccount),
  };
}

function firstErrors(fieldErrors: Partial<Record<string, string[]>> | undefined): SenderProfileFormErrors {
  const errors: SenderProfileFormErrors = {};
  for (const [key, messages] of Object.entries(fieldErrors ?? {})) {
    if (messages?.[0]) errors[key as SenderProfileField] = messages[0];
  }
  return errors;
}

export function useSenderProfileForm({ initialProfile }: { initialProfile: SenderProfile }) {
  const [values, setValues] = useState<SenderProfileInput>(() => senderProfileInputText(initialProfile));
  const [errors, setErrors] = useState<SenderProfileFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  function setField(field: SenderProfileField, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setSaved(false);
  }

  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setServerError(null);
    setSaved(false);

    const parsed = senderProfileInputSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(firstErrors(z.flattenError(parsed.error).fieldErrors));
      return;
    }
    setErrors({});
    setPending(true);

    try {
      const response = await fetch("/api/sender-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = (await response.json().catch(() => ({}))) as ErrorBody & { profile?: SenderProfile };

      if (response.ok && body.profile) {
        setValues(senderProfileInputText(body.profile));
        setSaved(true);
        return;
      }
      const fieldErrors = response.status === 400 ? firstErrors(body.fieldErrors) : {};
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        return;
      }
      setServerError(senderProfileErrorMessage(body.error ?? "unknown"));
    } catch {
      setServerError(senderProfileErrorMessage("unknown"));
    } finally {
      setPending(false);
    }
  }

  return { values, setField, errors, serverError, pending, saved, submit };
}
