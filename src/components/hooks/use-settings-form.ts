import { useState } from "react";
import type React from "react";
import { z } from "zod";
import { DEFAULT_ESCALATION_SETTINGS } from "@/lib/charges";
import { amountInputText } from "@/lib/format";
import { settingsInputSchema } from "@/lib/settings-schemas";
import type { EscalationSettings, EscalationSettingsInput } from "@/types";

export type SettingsField = keyof EscalationSettingsInput;
export type SettingsFormErrors = Partial<Record<SettingsField, string>>;

interface ErrorBody {
  error?: string;
  fieldErrors?: Partial<Record<SettingsField, string[]>>;
}

const DEFAULT_MESSAGE = "Coś poszło nie tak. Spróbuj ponownie.";
const MESSAGES: Record<string, string> = {
  unauthorized: "Zaloguj się, aby zmienić ustawienia.",
  config_missing: "Zapis ustawień jest niedostępny: brak konfiguracji serwera.",
};

function settingsErrorMessage(code: string): string {
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : DEFAULT_MESSAGE;
}

/** Settings (days, basis points, grosze) -> form text, e.g. 1375 -> "13,75", 29750 -> "297,50". */
export function settingsInputText(settings: EscalationSettings): EscalationSettingsInput {
  const [t1, t2, t3, t4] = settings.thresholds;
  const [c1, c2, c3] = settings.compensationGrosze;
  return {
    threshold1: String(t1),
    threshold2: String(t2),
    threshold3: String(t3),
    threshold4: String(t4),
    annualRate: amountInputText(settings.annualRateBp),
    compensation1: amountInputText(c1),
    compensation2: amountInputText(c2),
    compensation3: amountInputText(c3),
  };
}

function firstErrors(fieldErrors: Partial<Record<string, string[]>> | undefined): SettingsFormErrors {
  const errors: SettingsFormErrors = {};
  for (const [key, messages] of Object.entries(fieldErrors ?? {})) {
    if (messages?.[0]) errors[key as SettingsField] = messages[0];
  }
  return errors;
}

export function useSettingsForm({ initialSettings }: { initialSettings: EscalationSettings }) {
  const [values, setValues] = useState<EscalationSettingsInput>(() => settingsInputText(initialSettings));
  const [errors, setErrors] = useState<SettingsFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  function setField(field: SettingsField, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setSaved(false);
  }

  /** Fills the fields with the defaults without saving. */
  function resetToDefaults() {
    setValues(settingsInputText(DEFAULT_ESCALATION_SETTINGS));
    setErrors({});
    setServerError(null);
    setSaved(false);
  }

  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setServerError(null);
    setSaved(false);

    const parsed = settingsInputSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(firstErrors(z.flattenError(parsed.error).fieldErrors));
      return;
    }
    setErrors({});
    setPending(true);

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = (await response.json().catch(() => ({}))) as ErrorBody & { settings?: EscalationSettings };

      if (response.ok && body.settings) {
        setValues(settingsInputText(body.settings));
        setSaved(true);
        return;
      }
      const fieldErrors = response.status === 400 ? firstErrors(body.fieldErrors) : {};
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        return;
      }
      setServerError(settingsErrorMessage(body.error ?? "unknown"));
    } catch {
      setServerError(settingsErrorMessage("unknown"));
    } finally {
      setPending(false);
    }
  }

  return { values, setField, errors, serverError, pending, saved, resetToDefaults, submit };
}
