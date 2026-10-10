import type React from "react";
import { Building2, CircleAlert, CircleCheck, Landmark, Receipt, Save } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import {
  useSenderProfileForm,
  type SenderProfileField,
  type SenderProfileFormErrors,
} from "@/components/hooks/use-sender-profile-form";
import type { SenderProfile, SenderProfileInput } from "@/types";

interface SenderProfileFormViewProps {
  idPrefix: string;
  values: SenderProfileInput;
  errors: SenderProfileFormErrors;
  serverError?: string | null;
  pending: boolean;
  saved: boolean;
  onFieldChange: (field: SenderProfileField, value: string) => void;
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void;
}

export function SenderProfileFormView({
  idPrefix,
  values,
  errors,
  serverError,
  pending,
  saved,
  onFieldChange,
  onSubmit,
}: SenderProfileFormViewProps) {
  const addressId = `${idPrefix}-address`;

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Dane nadawcy</CardTitle>
          <CardDescription>
            Ponaglenie wstawia je pod podpisem, a numer konta — w zdaniu o terminie zapłaty. Wszystkie pola są
            opcjonalne.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            id={`${idPrefix}-companyName`}
            name="companyName"
            label="Nazwa firmy"
            value={values.companyName}
            onChange={(value) => {
              onFieldChange("companyName", value);
            }}
            error={errors.companyName}
            icon={<Building2 className="size-4" />}
          />
          <FormField
            id={`${idPrefix}-nip`}
            name="nip"
            label="NIP"
            value={values.nip}
            onChange={(value) => {
              onFieldChange("nip", value);
            }}
            error={errors.nip}
            icon={<Receipt className="size-4" />}
          />
          <div>
            <Label htmlFor={addressId} className="mb-1">
              Adres
            </Label>
            <Textarea
              id={addressId}
              name="address"
              rows={3}
              value={values.address}
              onChange={(e) => {
                onFieldChange("address", e.target.value);
              }}
              aria-invalid={!!errors.address}
              aria-describedby={errors.address ? `${addressId}-error` : undefined}
            />
            {errors.address ? (
              <p id={`${addressId}-error`} className="text-destructive mt-1 flex items-center gap-1 text-xs">
                <CircleAlert className="size-3" />
                {errors.address}
              </p>
            ) : null}
          </div>
          <FormField
            id={`${idPrefix}-bankAccount`}
            name="bankAccount"
            label="Numer konta"
            value={values.bankAccount}
            onChange={(value) => {
              onFieldChange("bankAccount", value);
            }}
            error={errors.bankAccount}
            icon={<Landmark className="size-4" />}
          />
        </CardContent>
      </Card>
      <div className="mt-4 space-y-4">
        <ServerError message={serverError} />
        {saved ? (
          <Alert role="status">
            <CircleCheck />
            <AlertDescription>Zapisano dane nadawcy</AlertDescription>
          </Alert>
        ) : null}
        <SubmitButton pending={pending} pendingText="Zapisywanie..." icon={<Save className="size-4" />}>
          Zapisz
        </SubmitButton>
      </div>
    </form>
  );
}

export function SenderProfileForm({ initialProfile }: { initialProfile: SenderProfile }) {
  const form = useSenderProfileForm({ initialProfile });
  return (
    <SenderProfileFormView
      idPrefix="sender-profile"
      values={form.values}
      errors={form.errors}
      serverError={form.serverError}
      pending={form.pending}
      saved={form.saved}
      onFieldChange={form.setField}
      onSubmit={(e) => void form.submit(e)}
    />
  );
}
