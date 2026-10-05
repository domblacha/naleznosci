import { Lock, LogIn, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ClientFormView } from "@/components/clients/ClientFormDialog";
import { ClientsManager } from "@/components/clients/ClientsManager";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";

const noop = () => undefined;

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
      <Section title="PasswordToggle">
        <div className="relative h-9 w-40">
          <PasswordToggle visible={false} onToggle={noop} />
        </div>
      </Section>
    </div>
  );
}
