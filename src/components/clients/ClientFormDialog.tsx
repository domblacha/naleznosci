import type React from "react";
import { Building2, Hash, Save } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useClientForm, type ClientFormErrors } from "@/components/hooks/use-client-form";
import type { Client } from "@/types";

interface ClientFormViewProps {
  idPrefix: string;
  name: string;
  nip: string;
  chargeCompensation: boolean;
  errors: ClientFormErrors;
  serverError?: string | null;
  pending: boolean;
  onNameChange: (value: string) => void;
  onNipChange: (value: string) => void;
  onChargeCompensationChange: (value: boolean) => void;
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void;
}

export function ClientFormView({
  idPrefix,
  name,
  nip,
  chargeCompensation,
  errors,
  serverError,
  pending,
  onNameChange,
  onNipChange,
  onChargeCompensationChange,
  onSubmit,
}: ClientFormViewProps) {
  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <FormField
        id={`${idPrefix}-name`}
        name="name"
        label="Nazwa"
        value={name}
        onChange={onNameChange}
        placeholder="Nazwa klienta"
        error={errors.name}
        icon={<Building2 className="size-4" />}
      />
      <FormField
        id={`${idPrefix}-nip`}
        name="nip"
        label="NIP"
        value={nip}
        onChange={onNipChange}
        placeholder="123-456-32-18"
        hint="Opcjonalnie, np. 123-456-32-18"
        error={errors.nip}
        icon={<Hash className="size-4" />}
      />
      <div className="flex items-center gap-2">
        <Switch
          id={`${idPrefix}-compensation`}
          checked={chargeCompensation}
          onCheckedChange={onChargeCompensationChange}
        />
        <Label htmlFor={`${idPrefix}-compensation`}>Naliczaj rekompensatę</Label>
      </div>
      <ServerError message={serverError} />
      <SubmitButton pending={pending} pendingText="Zapisywanie..." icon={<Save className="size-4" />}>
        Zapisz
      </SubmitButton>
    </form>
  );
}

function ClientForm({ client, onSaved }: { client: Client | null; onSaved: (client: Client) => void }) {
  const form = useClientForm({ client, onSaved });
  return (
    <ClientFormView
      idPrefix="client"
      name={form.name}
      nip={form.nip}
      chargeCompensation={form.chargeCompensation}
      errors={form.errors}
      serverError={form.serverError}
      pending={form.pending}
      onNameChange={form.setName}
      onNipChange={form.setNip}
      onChargeCompensationChange={form.setChargeCompensation}
      onSubmit={(e) => void form.submit(e)}
    />
  );
}

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
  onSaved: (client: Client) => void;
  onCloseAutoFocus?: () => void;
}

export function ClientFormDialog({ open, onOpenChange, client, onSaved, onCloseAutoFocus }: ClientFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onCloseAutoFocus?.();
        }}
      >
        <DialogHeader>
          <DialogTitle>{client ? "Edytuj klienta" : "Dodaj klienta"}</DialogTitle>
          <DialogDescription>{client ? "Zmień dane klienta." : "Podaj dane nowego klienta."}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the form state resets on every opening. */}
        <ClientForm client={client} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}
