import type React from "react";
import { CalendarDays, CircleAlert, FileText, Save, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useInvoiceForm, type InvoiceFormErrors } from "@/components/hooks/use-invoice-form";
import { useInvoicePause } from "@/components/hooks/use-invoice-pause";
import { formatDate } from "@/lib/format";
import { isInvoiceLocked } from "@/lib/invoice-lock";
import type { Client, Invoice } from "@/types";

interface InvoiceFormViewProps {
  idPrefix: string;
  clients: Client[];
  clientId: string;
  number: string;
  amount: string;
  dueDate: string;
  errors: InvoiceFormErrors;
  serverError?: string | null;
  pending: boolean;
  /** Past the due date: client, amount and due date can no longer be changed. */
  locked?: boolean;
  onClientIdChange: (value: string) => void;
  onNumberChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onDueDateChange: (value: string) => void;
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void;
}

export function InvoiceFormView({
  idPrefix,
  clients,
  clientId,
  number,
  amount,
  dueDate,
  errors,
  serverError,
  pending,
  locked,
  onClientIdChange,
  onNumberChange,
  onAmountChange,
  onDueDateChange,
  onSubmit,
}: InvoiceFormViewProps) {
  const sortedClients = [...clients].sort((a, b) => a.name.localeCompare(b.name, "pl"));
  const clientFieldId = `${idPrefix}-client`;

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div>
        <Label htmlFor={clientFieldId} className="mb-1">
          Klient
        </Label>
        <Select value={clientId} onValueChange={onClientIdChange} disabled={locked}>
          <SelectTrigger
            id={clientFieldId}
            className="w-full"
            aria-invalid={!!errors.clientId}
            aria-describedby={errors.clientId ? `${clientFieldId}-error` : undefined}
          >
            <SelectValue placeholder="Wybierz klienta" />
          </SelectTrigger>
          <SelectContent>
            {sortedClients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.clientId ? (
          <p id={`${clientFieldId}-error`} className="text-destructive mt-1 flex items-center gap-1 text-xs">
            <CircleAlert className="size-3" />
            {errors.clientId}
          </p>
        ) : null}
      </div>
      <FormField
        id={`${idPrefix}-number`}
        name="number"
        label="Numer"
        value={number}
        onChange={onNumberChange}
        placeholder="FV/2026/10/001"
        error={errors.number}
        icon={<FileText className="size-4" />}
      />
      <FormField
        id={`${idPrefix}-amount`}
        name="amount"
        label="Kwota"
        value={amount}
        onChange={onAmountChange}
        placeholder="1 234,56"
        hint="W złotych, np. 1 234,56"
        error={errors.amount}
        disabled={locked}
        icon={<Wallet className="size-4" />}
      />
      <FormField
        id={`${idPrefix}-due-date`}
        name="dueDate"
        label="Termin"
        type="date"
        value={dueDate}
        onChange={onDueDateChange}
        error={errors.dueDate}
        disabled={locked}
        icon={<CalendarDays className="size-4" />}
      />
      <ServerError message={serverError} />
      <SubmitButton pending={pending} pendingText="Zapisywanie..." icon={<Save className="size-4" />}>
        Zapisz
      </SubmitButton>
      {locked ? (
        <p className="text-muted-foreground text-xs">
          Faktura jest po terminie — klienta, kwoty i terminu nie można zmienić.
        </p>
      ) : null}
    </form>
  );
}

function InvoiceForm({
  clients,
  invoice,
  locked,
  onSaved,
}: {
  clients: Client[];
  invoice?: Invoice;
  locked: boolean;
  onSaved: (invoice: Invoice) => void;
}) {
  const form = useInvoiceForm({ invoice, onSaved });
  return (
    <InvoiceFormView
      idPrefix="invoice"
      clients={clients}
      clientId={form.clientId}
      number={form.number}
      amount={form.amount}
      dueDate={form.dueDate}
      errors={form.errors}
      serverError={form.serverError}
      pending={form.pending}
      locked={locked}
      onClientIdChange={form.setClientId}
      onNumberChange={form.setNumber}
      onAmountChange={form.setAmount}
      onDueDateChange={form.setDueDate}
      onSubmit={(e) => void form.submit(e)}
    />
  );
}

interface PauseEscalationControlProps {
  paused: boolean;
  pending: boolean;
  error?: string | null;
  onToggle: () => void;
}

export function PauseEscalationControl({ paused, pending, error, onToggle }: PauseEscalationControlProps) {
  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" className="w-full" disabled={pending} onClick={onToggle}>
        {pending ? "Zapisywanie..." : paused ? "Wznów eskalację" : "Wstrzymaj eskalację"}
      </Button>
      <ServerError message={error} />
    </div>
  );
}

interface InvoiceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  /** The invoice being edited; empty means the dialog adds a new one. */
  invoice?: Invoice | null;
  /** YYYY-MM-DD, "today" in Poland, computed on the server. */
  today: string;
  onSaved: (invoice: Invoice) => void;
  onPauseChanged?: (invoice: Invoice) => void;
  onCancelRequest?: () => void;
  onCloseAutoFocus?: () => void;
}

export function InvoiceFormDialog({
  open,
  onOpenChange,
  clients,
  invoice,
  today,
  onSaved,
  onPauseChanged,
  onCancelRequest,
  onCloseAutoFocus,
}: InvoiceFormDialogProps) {
  const editing = invoice ?? undefined;
  const pause = useInvoicePause({
    onChanged: (changed) => {
      onPauseChanged?.(changed);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onCloseAutoFocus?.();
        }}
      >
        <DialogHeader>
          <DialogTitle>{editing ? "Edytuj fakturę" : "Dodaj fakturę"}</DialogTitle>
          <DialogDescription>
            {editing
              ? `Faktura ${editing.number} · ${editing.clientName}${
                  editing.pausedOn ? ` · eskalacja wstrzymana od ${formatDate(editing.pausedOn)}` : ""
                }`
              : "Podaj dane nowej faktury."}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open and keyed by invoice and pause state, so the form resets on every opening and toggle. */}
        <InvoiceForm
          key={`${editing?.id ?? "new"}-${editing?.pausedOn ?? ""}`}
          clients={clients}
          invoice={editing}
          locked={editing ? isInvoiceLocked(editing, today) : false}
          onSaved={onSaved}
        />
        {editing && onPauseChanged ? (
          <PauseEscalationControl
            paused={editing.pausedOn !== null}
            pending={pause.pending}
            error={pause.error}
            onToggle={() => void (editing.pausedOn ? pause.resume(editing.id) : pause.pause(editing.id))}
          />
        ) : null}
        {editing && onCancelRequest ? (
          <Button type="button" variant="destructive" onClick={onCancelRequest}>
            Anuluj fakturę
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
