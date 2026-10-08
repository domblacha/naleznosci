import { useState } from "react";
import { invoiceErrorMessage } from "@/lib/invoice-errors";
import type { Invoice } from "@/types";

interface Options {
  onChanged: (invoice: Invoice) => void;
}

interface ErrorBody {
  error?: string;
}

export function useInvoicePause({ onChanged }: Options) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(id: string, method: "PUT" | "DELETE") {
    if (pending) return;
    setError(null);
    setPending(true);

    try {
      const response = await fetch(`/api/invoices/${id}/pause`, { method });
      const body = (await response.json().catch(() => ({}))) as ErrorBody & { invoice?: Invoice };

      if (response.ok && body.invoice) {
        onChanged(body.invoice);
        return;
      }
      setError(invoiceErrorMessage(body.error ?? "unknown"));
    } catch {
      setError(invoiceErrorMessage("unknown"));
    } finally {
      setPending(false);
    }
  }

  return {
    pause: (id: string) => send(id, "PUT"),
    resume: (id: string) => send(id, "DELETE"),
    pending,
    error,
  };
}
