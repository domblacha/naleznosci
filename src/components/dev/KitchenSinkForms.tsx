import { Lock, LogIn, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <Section title="PasswordToggle">
        <div className="relative h-9 w-40">
          <PasswordToggle visible={false} onToggle={noop} />
        </div>
      </Section>
    </div>
  );
}
