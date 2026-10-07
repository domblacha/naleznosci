import type React from "react";
import { CalendarDays, Save } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { usePaymentForm } from "@/components/hooks/use-payment-form";
import { chargesAsOf, type ChargesAsOf } from "@/lib/charges";
import { formatAmount } from "@/lib/format";
import { paymentInputSchema } from "@/lib/invoice-schemas";
import type { Invoice } from "@/types";

interface PaymentFormViewProps {
  idPrefix: string;
  paidOn: string;
  today: string;
  error?: string;
  serverError?: string | null;
  pending: boolean;
  /** Charges as of the chosen date; null while the date is not valid. */
  preview: ChargesAsOf | null;
  onPaidOnChange: (value: string) => void;
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void;
}

export function PaymentFormView({
  idPrefix,
  paidOn,
  today,
  error,
  serverError,
  pending,
  preview,
  onPaidOnChange,
  onSubmit,
}: PaymentFormViewProps) {
  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <FormField
        id={`${idPrefix}-paid-on`}
        name="paidOn"
        label="Data wpłaty"
        type="date"
        value={paidOn}
        onChange={onPaidOnChange}
        max={today}
        error={error}
        icon={<CalendarDays className="size-4" />}
      />
      {preview ? (
        <dl className="bg-muted text-muted-foreground grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg p-3 text-sm">
          <dt>Dni opóźnienia</dt>
          <dd className="text-foreground text-right">{preview.days}</dd>
          <dt>Odsetki</dt>
          <dd className="text-foreground text-right">{formatAmount(preview.interestGrosze)}</dd>
          <dt>Rekompensata</dt>
          <dd className="text-foreground text-right">{formatAmount(preview.compensationGrosze)}</dd>
        </dl>
      ) : null}
      <ServerError message={serverError} />
      <SubmitButton pending={pending} pendingText="Zapisywanie..." icon={<Save className="size-4" />}>
        Zapisz
      </SubmitButton>
    </form>
  );
}

function PaymentForm({
  invoice,
  today,
  mode,
  onSaved,
}: {
  invoice: Invoice;
  today: string;
  mode: PaymentDialogMode;
  onSaved: (invoice: Invoice) => void;
}) {
  const form = usePaymentForm({
    invoiceId: invoice.id,
    initialPaidOn: mode === "edit" ? (invoice.paidOn ?? today) : today,
    today,
    onSaved,
  });
  const valid = paymentInputSchema(today).safeParse({ paidOn: form.paidOn }).success;
  return (
    <PaymentFormView
      idPrefix="payment"
      paidOn={form.paidOn}
      today={today}
      error={form.error}
      serverError={form.serverError}
      pending={form.pending}
      preview={valid ? chargesAsOf(invoice, form.paidOn) : null}
      onPaidOnChange={form.setPaidOn}
      onSubmit={(e) => void form.submit(e)}
    />
  );
}

export type PaymentDialogMode = "mark" | "edit";

interface PaymentDialogProps {
  invoice: Invoice | null;
  today: string;
  open: boolean;
  mode: PaymentDialogMode;
  onOpenChange: (open: boolean) => void;
  onSaved: (invoice: Invoice) => void;
  onCloseAutoFocus?: () => void;
}

export function PaymentDialog({
  invoice,
  today,
  open,
  mode,
  onOpenChange,
  onSaved,
  onCloseAutoFocus,
}: PaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onCloseAutoFocus?.();
        }}
      >
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Zmień datę wpłaty" : "Oznacz jako zapłaconą"}</DialogTitle>
          <DialogDescription>
            {invoice ? `Faktura ${invoice.number} · ${invoice.clientName}` : "Podaj datę wpłaty."}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open and keyed by invoice, so the form state resets on every opening. */}
        {invoice ? (
          <PaymentForm key={invoice.id} invoice={invoice} today={today} mode={mode} onSaved={onSaved} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
