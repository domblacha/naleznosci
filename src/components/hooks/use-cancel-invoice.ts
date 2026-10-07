import { useState } from "react";
import { invoiceErrorMessage } from "@/lib/invoice-errors";
import type { Invoice } from "@/types";

interface Options {
  onCancelled: (invoice: Invoice) => void;
}

interface ErrorBody {
  error?: string;
}

export function useCancelInvoice({ onCancelled }: Options) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel(id: string) {
    if (pending) return;
    setError(null);
    setPending(true);

    try {
      const response = await fetch(`/api/invoices/${id}/cancellation`, { method: "PUT" });
      const body = (await response.json().catch(() => ({}))) as ErrorBody & { invoice?: Invoice };

      if (response.ok && body.invoice) {
        onCancelled(body.invoice);
        return;
      }
      setError(invoiceErrorMessage(body.error ?? "unknown"));
    } catch {
      setError(invoiceErrorMessage("unknown"));
    } finally {
      setPending(false);
    }
  }

  return { cancel, pending, error };
}
