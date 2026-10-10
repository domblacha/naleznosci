import type React from "react";
import { Banknote, CalendarClock, CircleCheck, Percent, RotateCcw, Save } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useSettingsForm, type SettingsField, type SettingsFormErrors } from "@/components/hooks/use-settings-form";
import type { EscalationSettings, EscalationSettingsInput } from "@/types";

const THRESHOLD_FIELDS: { field: SettingsField; label: string }[] = [
  { field: "threshold1", label: "Etap 1" },
  { field: "threshold2", label: "Etap 2" },
  { field: "threshold3", label: "Etap 3" },
  { field: "threshold4", label: "Etap 4" },
];

const COMPENSATION_FIELDS: { field: SettingsField; label: string }[] = [
  { field: "compensation1", label: "Faktura do 5 000 zł" },
  { field: "compensation2", label: "Faktura powyżej 5 000 zł i poniżej 50 000 zł" },
  { field: "compensation3", label: "Faktura od 50 000 zł" },
];

interface SettingsFormViewProps {
  idPrefix: string;
  values: EscalationSettingsInput;
  errors: SettingsFormErrors;
  serverError?: string | null;
  pending: boolean;
  saved: boolean;
  onFieldChange: (field: SettingsField, value: string) => void;
  onReset: () => void;
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void;
}

export function SettingsFormView({
  idPrefix,
  values,
  errors,
  serverError,
  pending,
  saved,
  onFieldChange,
  onReset,
  onSubmit,
}: SettingsFormViewProps) {
  const field = (name: SettingsField, label: string, icon: React.ReactNode, hint?: string) => (
    <FormField
      key={name}
      id={`${idPrefix}-${name}`}
      name={name}
      label={label}
      value={values[name]}
      onChange={(value) => {
        onFieldChange(name, value);
      }}
      error={errors[name]}
      hint={hint}
      icon={icon}
    />
  );

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Progi eskalacji (dni po terminie)</CardTitle>
          <CardDescription>Każdy etap musi zaczynać się później niż poprzedni.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {THRESHOLD_FIELDS.map(({ field: name, label }) => field(name, label, <CalendarClock className="size-4" />))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Odsetki</CardTitle>
        </CardHeader>
        <CardContent>
          {field("annualRate", "Roczna stopa (%)", <Percent className="size-4" />, "Np. 13,75")}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Rekompensata</CardTitle>
          <CardDescription>Kwota w zł zależna od kwoty faktury.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {COMPENSATION_FIELDS.map(({ field: name, label }) => field(name, label, <Banknote className="size-4" />))}
        </CardContent>
      </Card>
      <ServerError message={serverError} />
      {saved ? (
        <Alert role="status">
          <CircleCheck />
          <AlertDescription>Zapisano ustawienia</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onReset}>
          <RotateCcw className="size-4" />
          Przywróć domyślne
        </Button>
        <SubmitButton pending={pending} pendingText="Zapisywanie..." icon={<Save className="size-4" />}>
          Zapisz
        </SubmitButton>
      </div>
    </form>
  );
}

export function SettingsForm({ initialSettings }: { initialSettings: EscalationSettings }) {
  const form = useSettingsForm({ initialSettings });
  return (
    <SettingsFormView
      idPrefix="settings"
      values={form.values}
      errors={form.errors}
      serverError={form.serverError}
      pending={form.pending}
      saved={form.saved}
      onFieldChange={form.setField}
      onReset={form.resetToDefaults}
      onSubmit={(e) => void form.submit(e)}
    />
  );
}
