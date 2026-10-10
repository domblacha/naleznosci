import type React from "react";
import { CalendarDays, Save } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { usePaymentForm } from "@/components/hooks/use-payment-form";
import { chargesAsOf, chargeSettingsFrom, frozenChargesAsOf, type ChargesAsOf } from "@/lib/charges";
import { formatAmount } from "@/lib/format";
import { paymentInputSchema } from "@/lib/invoice-schemas";
import type { EscalationSettings, Invoice } from "@/types";

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
        <dl className="bg-muted text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg p-3 text-sm">
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

export type PaymentDialogMode = "mark" | "edit";

/** Marking uses the user's current settings (the same values the server snapshots); editing uses the snapshot. */
type PaymentModeProps = { mode: "mark"; settings: EscalationSettings } | { mode: "edit" };

type PaymentFormProps = {
  invoice: Invoice;
  today: string;
  onSaved: (invoice: Invoice) => void;
} & PaymentModeProps;

function PaymentForm(props: PaymentFormProps) {
  const { invoice, today, onSaved } = props;
  const form = usePaymentForm({
    invoiceId: invoice.id,
    initialPaidOn: props.mode === "edit" ? (invoice.paidOn ?? today) : today,
    today,
    onSaved,
  });
  const valid = paymentInputSchema(today).safeParse({ paidOn: form.paidOn }).success;
  // Changing the date keeps the snapshot frozen when the invoice was marked paid.
  const preview = (paidOn: string) =>
    props.mode === "edit"
      ? frozenChargesAsOf(
          invoice,
          { rateBp: invoice.paidRateBp ?? 0, compensationGrosze: invoice.paidCompensationGrosze ?? 0 },
          paidOn,
        )
      : chargesAsOf(invoice, paidOn, chargeSettingsFrom(props.settings));
  return (
    <PaymentFormView
      idPrefix="payment"
      paidOn={form.paidOn}
      today={today}
      error={form.error}
      serverError={form.serverError}
      pending={form.pending}
      preview={valid ? preview(form.paidOn) : null}
      onPaidOnChange={form.setPaidOn}
      onSubmit={(e) => void form.submit(e)}
    />
  );
}

type PaymentDialogProps = {
  invoice: Invoice | null;
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (invoice: Invoice) => void;
  onCloseAutoFocus?: () => void;
} & PaymentModeProps;

export function PaymentDialog(props: PaymentDialogProps) {
  const { invoice, today, open, mode, onOpenChange, onSaved, onCloseAutoFocus } = props;
  const modeProps: PaymentModeProps =
    props.mode === "mark" ? { mode: "mark", settings: props.settings } : { mode: "edit" };
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
          <PaymentForm key={invoice.id} invoice={invoice} today={today} onSaved={onSaved} {...modeProps} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
