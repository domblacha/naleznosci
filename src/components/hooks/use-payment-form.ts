import { useState } from "react";
import type React from "react";
import { z } from "zod";
import { paymentInputSchema } from "@/lib/invoice-schemas";
import { invoiceErrorMessage } from "@/lib/invoice-errors";
import type { Invoice } from "@/types";

interface Options {
  invoiceId: string;
  initialPaidOn: string;
  /** YYYY-MM-DD, "today" in Poland, computed on the server. */
  today: string;
  onSaved: (invoice: Invoice) => void;
}

interface ErrorBody {
  error?: string;
  fieldErrors?: { paidOn?: string[] };
}

/** The dialog mounts this hook only while open, so the state resets on every opening. */
export function usePaymentForm({ invoiceId, initialPaidOn, today, onSaved }: Options) {
  const [paidOn, setPaidOnState] = useState(initialPaidOn);
  const [error, setError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setPaidOn(value: string) {
    setPaidOnState(value);
    setError(undefined);
  }

  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setServerError(null);

    const parsed = paymentInputSchema(today).safeParse({ paidOn });
    if (!parsed.success) {
      setError(z.flattenError(parsed.error).fieldErrors.paidOn?.[0]);
      return;
    }
    setError(undefined);
    setPending(true);

    try {
      const response = await fetch(`/api/invoices/${invoiceId}/payment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json().catch(() => ({}))) as ErrorBody & { invoice?: Invoice };

      if (response.ok && body.invoice) {
        onSaved(body.invoice);
        return;
      }
      if (response.status === 400) {
        setError(body.fieldErrors?.paidOn?.[0]);
        return;
      }
      setServerError(invoiceErrorMessage(body.error ?? "unknown"));
    } catch {
      setServerError(invoiceErrorMessage("unknown"));
    } finally {
      setPending(false);
    }
  }

  return { paidOn, setPaidOn, error, serverError, pending, submit };
}
