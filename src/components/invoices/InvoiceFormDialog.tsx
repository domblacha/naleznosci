import type React from "react";
import { CalendarDays, CircleAlert, FileText, Save, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useInvoiceForm, type InvoiceFormErrors } from "@/components/hooks/use-invoice-form";
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
        <Select value={clientId} onValueChange={onClientIdChange}>
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
        icon={<CalendarDays className="size-4" />}
      />
      <ServerError message={serverError} />
      <SubmitButton pending={pending} pendingText="Zapisywanie..." icon={<Save className="size-4" />}>
        Zapisz
      </SubmitButton>
    </form>
  );
}

function InvoiceForm({ clients, onSaved }: { clients: Client[]; onSaved: (invoice: Invoice) => void }) {
  const form = useInvoiceForm({ onSaved });
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
      onClientIdChange={form.setClientId}
      onNumberChange={form.setNumber}
      onAmountChange={form.setAmount}
      onDueDateChange={form.setDueDate}
      onSubmit={(e) => void form.submit(e)}
    />
  );
}

interface InvoiceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  onSaved: (invoice: Invoice) => void;
  onCloseAutoFocus?: () => void;
}

export function InvoiceFormDialog({ open, onOpenChange, clients, onSaved, onCloseAutoFocus }: InvoiceFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onCloseAutoFocus?.();
        }}
      >
        <DialogHeader>
          <DialogTitle>Dodaj fakturę</DialogTitle>
          <DialogDescription>Podaj dane nowej faktury.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the form state resets on every opening. */}
        <InvoiceForm clients={clients} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}
