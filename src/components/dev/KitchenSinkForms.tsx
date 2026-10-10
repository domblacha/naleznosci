import { Lock, LogIn, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ClientFormView } from "@/components/clients/ClientFormDialog";
import { ClientsManager } from "@/components/clients/ClientsManager";
import {
  DeactivateClientView,
  DEACTIVATE_DESCRIPTION,
  deactivateTitle,
} from "@/components/clients/DeactivateClientDialog";
import { clientErrorMessage } from "@/lib/client-errors";
import { CancelInvoiceView, CANCEL_DESCRIPTION, cancelTitle } from "@/components/invoices/CancelInvoiceDialog";
import { InvoiceFormView, PauseEscalationControl } from "@/components/invoices/InvoiceFormDialog";
import { InvoicesManager } from "@/components/invoices/InvoicesManager";
import { PaymentFormView } from "@/components/invoices/PaymentDialog";
import { ReminderDialogView } from "@/components/invoices/ReminderDialog";
import { settingsInputText } from "@/components/hooks/use-settings-form";
import { SettingsFormView } from "@/components/settings/SettingsForm";
import { amountInputText } from "@/lib/format";
import { chargesAsOf, chargeSettingsFrom, DEFAULT_ESCALATION_SETTINGS } from "@/lib/charges";
import { isInvoiceLocked } from "@/lib/invoice-lock";
import { buildClientReminders, renderReminder } from "@/lib/reminder";
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
    deactivatedOn: null,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Żabka Handel",
    nip: null,
    chargeCompensation: false,
    deactivatedOn: null,
    createdAt: "2026-01-02T00:00:00Z",
  },
];

const sampleClientsWithDeactivated: Client[] = [
  ...sampleClients,
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Stara Hurtownia",
    nip: "5260001246",
    chargeCompensation: true,
    deactivatedOn: "2026-09-20",
    createdAt: "2026-01-03T00:00:00Z",
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
    clientChargesCompensation: sampleClients[clientIndex].chargeCompensation,
    number,
    amountGrosze,
    dueDate,
    paidOn: null,
    paidRateBp: null,
    paidCompensationGrosze: null,
    cancelledOn: null,
    pausedOn: null,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

const sampleInvoices: Invoice[] = [
  sampleInvoice(1, 0, "FV/2026/08/001", 123456, "2026-08-20"),
  sampleInvoice(7, 0, "FV/2026/08/002", 650000, "2026-08-25"),
  sampleInvoice(2, 1, "FV/2026/09/004", 50000, "2026-09-15"),
  sampleInvoice(3, 0, "FV/2026/09/007", 99900, "2026-09-26"),
  sampleInvoice(4, 1, "FV/2026/09/010", 250050, "2026-10-01"),
  sampleInvoice(5, 0, "FV/2026/10/002", 10000, "2026-10-04"),
  sampleInvoice(6, 1, "FV/2026/10/005", 75000, "2026-10-20"),
];

const defaultSettingsText = settingsInputText(DEFAULT_ESCALATION_SETTINGS);
const customSettingsText = settingsInputText({
  thresholds: [5, 10, 21, 45],
  annualRateBp: 1150,
  compensationGrosze: [17000, 30000, 43000],
});

const sampleReminder = buildClientReminders(
  sampleInvoices,
  SAMPLE_TODAY,
  DEFAULT_ESCALATION_SETTINGS.thresholds,
  chargeSettingsFrom(DEFAULT_ESCALATION_SETTINGS),
).find((r) => r.clientId === sampleClients[0].id);
const sampleReminderText = sampleReminder ? renderReminder(sampleReminder, SAMPLE_TODAY) : "";

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
      <Section title="Formularz klienta: duplikat usuniętego klienta">
        <ClientFormView
          idPrefix="ks-client-duplicate-inactive"
          name="Stara Hurtownia"
          nip="5260001246"
          chargeCompensation
          errors={{}}
          serverError={clientErrorMessage("duplicate_nip_inactive")}
          pending={false}
          onNameChange={noop}
          onNipChange={noop}
          onChargeCompensationChange={noop}
          onSubmit={noop}
        />
      </Section>
      <Section title="Lista klientów: pusta">
        <ClientsManager initialClients={[]} />
      </Section>
      <Section title="Lista klientów: z usuniętym klientem">
        <ClientsManager initialClients={sampleClientsWithDeactivated} />
      </Section>
      <Section title="Usuwanie klienta: zwykłe">
        <div className="bg-popover text-popover-foreground ring-foreground/10 grid max-w-sm gap-4 p-4 ring-1">
          <DeactivateClientView
            standalone
            title={<p className="text-sm font-medium">{deactivateTitle(sampleClients[0].name)}</p>}
            description={<p className="text-muted-foreground text-xs/relaxed">{DEACTIVATE_DESCRIPTION}</p>}
            pending={false}
            onConfirm={noop}
          />
        </div>
      </Section>
      <Section title="Usuwanie klienta: w trakcie">
        <div className="bg-popover text-popover-foreground ring-foreground/10 grid max-w-sm gap-4 p-4 ring-1">
          <DeactivateClientView
            standalone
            title={<p className="text-sm font-medium">{deactivateTitle(sampleClients[0].name)}</p>}
            description={<p className="text-muted-foreground text-xs/relaxed">{DEACTIVATE_DESCRIPTION}</p>}
            pending
            onConfirm={noop}
          />
        </div>
      </Section>
      <Section title="Usuwanie klienta: z błędem (otwarte faktury)">
        <div className="bg-popover text-popover-foreground ring-foreground/10 grid max-w-sm gap-4 p-4 ring-1">
          <DeactivateClientView
            standalone
            title={<p className="text-sm font-medium">{deactivateTitle(sampleClients[0].name)}</p>}
            description={<p className="text-muted-foreground text-xs/relaxed">{DEACTIVATE_DESCRIPTION}</p>}
            pending={false}
            error={clientErrorMessage("has_open_invoices")}
            onConfirm={noop}
          />
        </div>
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
      <Section title="InvoiceFormView: edycja (niezablokowana)">
        <InvoiceFormView
          idPrefix="ks-invoice-edit"
          clients={sampleClients}
          clientId={sampleInvoices[5].clientId}
          number={sampleInvoices[5].number}
          amount={amountInputText(sampleInvoices[5].amountGrosze)}
          dueDate={sampleInvoices[5].dueDate}
          errors={{}}
          pending={false}
          onClientIdChange={noop}
          onNumberChange={noop}
          onAmountChange={noop}
          onDueDateChange={noop}
          onSubmit={noop}
        />
      </Section>
      <Section title="InvoiceFormView: edycja (zablokowana po terminie)">
        <InvoiceFormView
          idPrefix="ks-invoice-locked"
          clients={sampleClients}
          clientId={sampleInvoices[0].clientId}
          number={sampleInvoices[0].number}
          amount={amountInputText(sampleInvoices[0].amountGrosze)}
          dueDate={sampleInvoices[0].dueDate}
          errors={{}}
          pending={false}
          locked
          onClientIdChange={noop}
          onNumberChange={noop}
          onAmountChange={noop}
          onDueDateChange={noop}
          onSubmit={noop}
        />
      </Section>
      <Section title="InvoiceFormView: błąd locked z serwera">
        <InvoiceFormView
          idPrefix="ks-invoice-locked-error"
          clients={sampleClients}
          clientId={sampleInvoices[5].clientId}
          number={sampleInvoices[5].number}
          amount={amountInputText(sampleInvoices[5].amountGrosze)}
          dueDate={sampleInvoices[5].dueDate}
          errors={{}}
          serverError="Faktura jest po terminie: klienta, kwoty ani terminu nie można już zmienić. Odśwież stronę."
          pending={false}
          onClientIdChange={noop}
          onNumberChange={noop}
          onAmountChange={noop}
          onDueDateChange={noop}
          onSubmit={noop}
        />
      </Section>
      <Section title="InvoiceFormView: wstrzymana po terminie (pola aktywne)">
        <InvoiceFormView
          idPrefix="ks-invoice-paused"
          clients={sampleClients}
          clientId={sampleInvoices[0].clientId}
          number={sampleInvoices[0].number}
          amount={amountInputText(sampleInvoices[0].amountGrosze)}
          dueDate={sampleInvoices[0].dueDate}
          errors={{}}
          pending={false}
          locked={isInvoiceLocked({ dueDate: sampleInvoices[0].dueDate, pausedOn: "2026-10-01" }, SAMPLE_TODAY)}
          onClientIdChange={noop}
          onNumberChange={noop}
          onAmountChange={noop}
          onDueDateChange={noop}
          onSubmit={noop}
        />
      </Section>
      <Section title="PauseEscalationControl: niewstrzymana">
        <PauseEscalationControl paused={false} pending={false} onToggle={noop} />
      </Section>
      <Section title="PauseEscalationControl: wstrzymana">
        <PauseEscalationControl paused pending={false} onToggle={noop} />
      </Section>
      <Section title="PauseEscalationControl: w trakcie">
        <PauseEscalationControl paused={false} pending onToggle={noop} />
      </Section>
      <Section title="PauseEscalationControl: z błędem">
        <PauseEscalationControl
          paused={false}
          pending={false}
          error="Nie znaleziono faktury. Odśwież stronę."
          onToggle={noop}
        />
      </Section>
      <Section title="Anulowanie faktury: zwykłe">
        <div className="bg-popover text-popover-foreground ring-foreground/10 grid max-w-sm gap-4 p-4 ring-1">
          <CancelInvoiceView
            standalone
            title={<p className="text-sm font-medium">{cancelTitle(sampleInvoices[0].number)}</p>}
            description={<p className="text-muted-foreground text-xs/relaxed">{CANCEL_DESCRIPTION}</p>}
            pending={false}
            onConfirm={noop}
          />
        </div>
      </Section>
      <Section title="Anulowanie faktury: w trakcie">
        <div className="bg-popover text-popover-foreground ring-foreground/10 grid max-w-sm gap-4 p-4 ring-1">
          <CancelInvoiceView
            standalone
            title={<p className="text-sm font-medium">{cancelTitle(sampleInvoices[0].number)}</p>}
            description={<p className="text-muted-foreground text-xs/relaxed">{CANCEL_DESCRIPTION}</p>}
            pending={true}
            onConfirm={noop}
          />
        </div>
      </Section>
      <Section title="Anulowanie faktury: z błędem">
        <div className="bg-popover text-popover-foreground ring-foreground/10 grid max-w-sm gap-4 p-4 ring-1">
          <CancelInvoiceView
            standalone
            title={<p className="text-sm font-medium">{cancelTitle(sampleInvoices[0].number)}</p>}
            description={<p className="text-muted-foreground text-xs/relaxed">{CANCEL_DESCRIPTION}</p>}
            pending={false}
            error="Nie znaleziono faktury. Odśwież stronę."
            onConfirm={noop}
          />
        </div>
      </Section>
      <Section title="Data wpłaty: default">
        <PaymentFormView
          idPrefix="ks-payment-default"
          paidOn={SAMPLE_TODAY}
          today={SAMPLE_TODAY}
          pending={false}
          preview={chargesAsOf(sampleInvoices[0], SAMPLE_TODAY, chargeSettingsFrom(DEFAULT_ESCALATION_SETTINGS))}
          onPaidOnChange={noop}
          onSubmit={noop}
        />
      </Section>
      <Section title="Data wpłaty: błąd (przyszła data)">
        <PaymentFormView
          idPrefix="ks-payment-error"
          paidOn="2026-10-20"
          today={SAMPLE_TODAY}
          error="Data wpłaty nie może być późniejsza niż dziś"
          pending={false}
          preview={null}
          onPaidOnChange={noop}
          onSubmit={noop}
        />
      </Section>
      <Section title="Podgląd kwot wpłaty">
        <PaymentFormView
          idPrefix="ks-payment-preview"
          paidOn="2026-08-10"
          today={SAMPLE_TODAY}
          serverError="Nie znaleziono faktury. Odśwież stronę."
          pending
          preview={chargesAsOf(sampleInvoices[0], "2026-08-10", chargeSettingsFrom(DEFAULT_ESCALATION_SETTINGS))}
          onPaidOnChange={noop}
          onSubmit={noop}
        />
      </Section>
      <Section title="Ustawienia: domyślne">
        <SettingsFormView
          idPrefix="ks-settings-default"
          values={defaultSettingsText}
          errors={{}}
          pending={false}
          saved={false}
          onFieldChange={noop}
          onReset={noop}
          onSubmit={noop}
        />
      </Section>
      <Section title="Ustawienia: błędy pól (nierosnące progi, zła stopa)">
        <SettingsFormView
          idPrefix="ks-settings-errors"
          values={{ ...defaultSettingsText, threshold2: "3", threshold4: "14", annualRate: "13,755" }}
          errors={{
            threshold2: "Próg musi być większy niż próg poprzedniego etapu",
            threshold4: "Próg musi być większy niż próg poprzedniego etapu",
            annualRate: "Podaj stopę od 0 do 100 z najwyżej 2 miejscami po przecinku, np. 13,75",
          }}
          pending={false}
          saved={false}
          onFieldChange={noop}
          onReset={noop}
          onSubmit={noop}
        />
      </Section>
      <Section title="Ustawienia: błąd serwera">
        <SettingsFormView
          idPrefix="ks-settings-server-error"
          values={customSettingsText}
          errors={{}}
          serverError="Coś poszło nie tak. Spróbuj ponownie."
          pending={false}
          saved={false}
          onFieldChange={noop}
          onReset={noop}
          onSubmit={noop}
        />
      </Section>
      <Section title="Ustawienia: pending">
        <SettingsFormView
          idPrefix="ks-settings-pending"
          values={customSettingsText}
          errors={{}}
          pending
          saved={false}
          onFieldChange={noop}
          onReset={noop}
          onSubmit={noop}
        />
      </Section>
      <Section title="Ustawienia: po zapisie">
        <SettingsFormView
          idPrefix="ks-settings-saved"
          values={customSettingsText}
          errors={{}}
          pending={false}
          saved
          onFieldChange={noop}
          onReset={noop}
          onSubmit={noop}
        />
      </Section>
      {sampleReminder ? (
        <>
          <Section title="ReminderDialogView: default">
            <ReminderDialogView
              idPrefix="ks-reminder-default"
              text={sampleReminderText}
              status="idle"
              onTextChange={noop}
              onCopy={noop}
            />
          </Section>
          <Section title="ReminderDialogView: copied">
            <ReminderDialogView
              idPrefix="ks-reminder-copied"
              text={sampleReminderText}
              status="copied"
              onTextChange={noop}
              onCopy={noop}
            />
          </Section>
          <Section title="ReminderDialogView: copy error">
            <ReminderDialogView
              idPrefix="ks-reminder-error"
              text={sampleReminderText}
              status="error"
              onTextChange={noop}
              onCopy={noop}
            />
          </Section>
        </>
      ) : null}
      <Section title="Lista faktur: grupy">
        <InvoicesManager
          initialInvoices={sampleInvoices}
          clients={sampleClients}
          today={SAMPLE_TODAY}
          settings={DEFAULT_ESCALATION_SETTINGS}
        />
      </Section>
      <Section title="Ponaglenia: pusty stan">
        <InvoicesManager
          initialInvoices={[sampleInvoice(6, 1, "FV/2026/10/005", 75000, "2026-10-20")]}
          clients={sampleClients}
          today={SAMPLE_TODAY}
          settings={DEFAULT_ESCALATION_SETTINGS}
        />
      </Section>
      <Section title="Lista faktur: brak faktur">
        <InvoicesManager
          initialInvoices={[]}
          clients={sampleClients}
          today={SAMPLE_TODAY}
          settings={DEFAULT_ESCALATION_SETTINGS}
        />
      </Section>
      <Section title="Lista faktur: brak klientów">
        <InvoicesManager
          initialInvoices={[]}
          clients={[]}
          today={SAMPLE_TODAY}
          settings={DEFAULT_ESCALATION_SETTINGS}
        />
      </Section>
      <Section title="PasswordToggle">
        <div className="relative h-9 w-40">
          <PasswordToggle visible={false} onToggle={noop} />
        </div>
      </Section>
    </div>
  );
}
