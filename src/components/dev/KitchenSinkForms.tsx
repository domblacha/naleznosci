import { Lock, LogIn, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ClientFormView } from "@/components/clients/ClientFormDialog";
import { ClientsManager } from "@/components/clients/ClientsManager";
import { InvoiceFormView } from "@/components/invoices/InvoiceFormDialog";
import { InvoicesManager } from "@/components/invoices/InvoicesManager";
import type { Client, Invoice } from "@/types";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";

const noop = () => undefined;

const sampleClients: Client[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Acme Sp. z o.o.",
    nip: "1234563218",
    chargeCompensation: true,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Żabka Handel",
    nip: null,
    chargeCompensation: false,
    createdAt: "2026-01-02T00:00:00Z",
  },
];

const SAMPLE_TODAY = "2026-10-05";

function sampleInvoice(
  id: number,
  clientIndex: number,
  number: string,
  amountGrosze: number,
  dueDate: string,
): Invoice {
  return {
    id: `00000000-0000-4000-9000-00000000000${id}`,
    clientId: sampleClients[clientIndex].id,
    clientName: sampleClients[clientIndex].name,
    number,
    amountGrosze,
    dueDate,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

const sampleInvoices: Invoice[] = [
  sampleInvoice(1, 0, "FV/2026/08/001", 123456, "2026-08-20"),
  sampleInvoice(2, 1, "FV/2026/09/004", 50000, "2026-09-15"),
  sampleInvoice(3, 0, "FV/2026/09/007", 99900, "2026-09-26"),
  sampleInvoice(4, 1, "FV/2026/09/010", 250050, "2026-10-01"),
  sampleInvoice(5, 0, "FV/2026/10/002", 10000, "2026-10-04"),
  sampleInvoice(6, 1, "FV/2026/10/005", 75000, "2026-10-20"),
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-muted-foreground text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function KitchenSinkForms() {
  return (
    <div className="space-y-8">
      <Section title="FormField: default">
        <FormField
          id="ks-default"
          label="E-mail"
          value=""
          onChange={noop}
          placeholder="jan@example.com"
          icon={<Mail className="size-4" />}
        />
      </Section>
      <Section title="FormField: error">
        <FormField
          id="ks-error"
          label="E-mail"
          value="jan@"
          onChange={noop}
          error="Podaj poprawny adres e-mail"
          icon={<Mail className="size-4" />}
        />
      </Section>
      <Section title="FormField: z podpowiedzią">
        <FormField
          id="ks-hint"
          label="Hasło"
          type="password"
          value="abc"
          onChange={noop}
          hint="Jeszcze 5 znaków"
          icon={<Lock className="size-4" />}
        />
      </Section>
      <Section title="SubmitButton: default">
        <SubmitButton pending={false} pendingText="Logowanie..." icon={<LogIn className="size-4" />}>
          Zaloguj się
        </SubmitButton>
      </Section>
      <Section title="SubmitButton: pending">
        <SubmitButton pending={true} pendingText="Logowanie..." icon={<LogIn className="size-4" />}>
          Zaloguj się
        </SubmitButton>
      </Section>
      <Section title="Button: disabled">
        <Button disabled>Nieaktywny</Button>
      </Section>
      <Section title="ServerError">
        <ServerError message="Nieprawidłowy e-mail lub hasło" />
      </Section>
      <Section title="Switch: włączony / wyłączony">
        <div className="flex items-center gap-2">
          <Switch id="ks-switch-on" checked onCheckedChange={noop} />
          <Label htmlFor="ks-switch-on">Włączony</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="ks-switch-off" checked={false} onCheckedChange={noop} />
          <Label htmlFor="ks-switch-off">Wyłączony</Label>
        </div>
      </Section>
      <Section title="Formularz klienta: domyślny">
        <ClientFormView
          idPrefix="ks-client-default"
          name=""
          nip=""
          chargeCompensation
          errors={{}}
          pending={false}
          onNameChange={noop}
          onNipChange={noop}
          onChargeCompensationChange={noop}
          onSubmit={noop}
        />
      </Section>
      <Section title="Formularz klienta: błąd duplikatu NIP">
        <ClientFormView
          idPrefix="ks-client-duplicate"
          name="Acme Sp. z o.o."
          nip="1234563218"
          chargeCompensation
          errors={{ nip: "Klient z tym NIP-em już istnieje." }}
          pending={false}
          onNameChange={noop}
          onNipChange={noop}
          onChargeCompensationChange={noop}
          onSubmit={noop}
        />
      </Section>
      <Section title="Formularz klienta: pending">
        <ClientFormView
          idPrefix="ks-client-pending"
          name="Acme Sp. z o.o."
          nip="1234563218"
          chargeCompensation={false}
          errors={{}}
          pending
          onNameChange={noop}
          onNipChange={noop}
          onChargeCompensationChange={noop}
          onSubmit={noop}
        />
      </Section>
      <Section title="Lista klientów: pusta">
        <ClientsManager initialClients={[]} />
      </Section>
      <Section title="InvoiceFormView: default">
        <InvoiceFormView
          idPrefix="ks-invoice-default"
          clients={sampleClients}
          clientId=""
          number=""
          amount=""
          dueDate=""
          errors={{}}
          pending={false}
          onClientIdChange={noop}
          onNumberChange={noop}
          onAmountChange={noop}
          onDueDateChange={noop}
          onSubmit={noop}
        />
      </Section>
      <Section title="InvoiceFormView: errors">
        <InvoiceFormView
          idPrefix="ks-invoice-errors"
          clients={sampleClients}
          clientId=""
          number="FV/2026/10/002"
          amount="abc"
          dueDate=""
          errors={{
            clientId: "Wybierz klienta",
            number: "Faktura o tym numerze już istnieje.",
            amount: "Podaj kwotę większą od zera, np. 1 234,56",
            dueDate: "Podaj poprawny termin płatności",
          }}
          pending={false}
          onClientIdChange={noop}
          onNumberChange={noop}
          onAmountChange={noop}
          onDueDateChange={noop}
          onSubmit={noop}
        />
      </Section>
      <Section title="InvoiceFormView: pending + server error">
        <InvoiceFormView
          idPrefix="ks-invoice-pending"
          clients={sampleClients}
          clientId={sampleClients[0].id}
          number="FV/2026/10/003"
          amount="1 234,56"
          dueDate="2026-10-31"
          errors={{}}
          serverError="Coś poszło nie tak. Spróbuj ponownie."
          pending
          onClientIdChange={noop}
          onNumberChange={noop}
          onAmountChange={noop}
          onDueDateChange={noop}
          onSubmit={noop}
        />
      </Section>
      <Section title="Lista faktur: grupy">
        <InvoicesManager initialInvoices={sampleInvoices} clients={sampleClients} today={SAMPLE_TODAY} />
      </Section>
      <Section title="Lista faktur: brak faktur">
        <InvoicesManager initialInvoices={[]} clients={sampleClients} today={SAMPLE_TODAY} />
      </Section>
      <Section title="Lista faktur: brak klientów">
        <InvoicesManager initialInvoices={[]} clients={[]} today={SAMPLE_TODAY} />
      </Section>
      <Section title="PasswordToggle">
        <div className="relative h-9 w-40">
          <PasswordToggle visible={false} onToggle={noop} />
        </div>
      </Section>
    </div>
  );
}
