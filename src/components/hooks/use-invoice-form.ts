import { useState } from "react";
import type React from "react";
import { z } from "zod";
import { invoiceInputSchema } from "@/lib/invoice-schemas";
import { invoiceErrorMessage } from "@/lib/invoice-errors";
import { amountInputText } from "@/lib/format";
import type { Invoice } from "@/types";

export interface InvoiceFormErrors {
  clientId?: string;
  number?: string;
  amount?: string;
  dueDate?: string;
}

interface Options {
  /** When set, the form edits this invoice (PUT) instead of adding a new one (POST). */
  invoice?: Invoice;
  onSaved: (invoice: Invoice) => void;
}

interface ErrorBody {
  error?: string;
  fieldErrors?: { [K in keyof InvoiceFormErrors]?: string[] };
}

function firstErrors(fieldErrors: ErrorBody["fieldErrors"]): InvoiceFormErrors {
  return {
    clientId: fieldErrors?.clientId?.[0],
    number: fieldErrors?.number?.[0],
    amount: fieldErrors?.amount?.[0],
    dueDate: fieldErrors?.dueDate?.[0],
  };
}

export function useInvoiceForm({ invoice, onSaved }: Options) {
  const [clientId, setClientIdState] = useState(invoice?.clientId ?? "");
  const [number, setNumberState] = useState(invoice?.number ?? "");
  const [amount, setAmountState] = useState(invoice ? amountInputText(invoice.amountGrosze) : "");
  const [dueDate, setDueDateState] = useState(invoice?.dueDate ?? "");
  const [errors, setErrors] = useState<InvoiceFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setClientId(value: string) {
    setClientIdState(value);
    setErrors((prev) => ({ ...prev, clientId: undefined }));
  }

  function setNumber(value: string) {
    setNumberState(value);
    setErrors((prev) => ({ ...prev, number: undefined }));
  }

  function setAmount(value: string) {
    setAmountState(value);
    setErrors((prev) => ({ ...prev, amount: undefined }));
  }

  function setDueDate(value: string) {
    setDueDateState(value);
    setErrors((prev) => ({ ...prev, dueDate: undefined }));
  }

  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setServerError(null);

    const raw = { clientId, number, amount, dueDate };
    const parsed = invoiceInputSchema.safeParse(raw);
    if (!parsed.success) {
      setErrors(firstErrors(z.flattenError(parsed.error).fieldErrors));
      return;
    }
    setErrors({});
    setPending(true);

    try {
      const response = await fetch(invoice ? `/api/invoices/${invoice.id}` : "/api/invoices", {
        method: invoice ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(raw),
      });
      const body = (await response.json().catch(() => ({}))) as ErrorBody & { invoice?: Invoice };

      if (response.ok && body.invoice) {
        onSaved(body.invoice);
        return;
      }
      if (response.status === 400) {
        setErrors(firstErrors(body.fieldErrors));
        return;
      }
      if (response.status === 409 && body.error === "duplicate_number") {
        setErrors({ number: invoiceErrorMessage(body.error) ?? undefined });
        return;
      }
      if (response.status === 404 && body.error === "client_not_found") {
        setErrors({ clientId: invoiceErrorMessage(body.error) ?? undefined });
        return;
      }
      setServerError(invoiceErrorMessage(body.error ?? "unknown"));
    } catch {
      setServerError(invoiceErrorMessage("unknown"));
    } finally {
      setPending(false);
    }
  }

  return {
    clientId,
    setClientId,
    number,
    setNumber,
    amount,
    setAmount,
    dueDate,
    setDueDate,
    errors,
    serverError,
    pending,
    submit,
  };
}
