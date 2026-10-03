import { useState } from "react";
import type React from "react";
import { z } from "zod";
import { clientInputSchema } from "@/lib/client-schemas";
import { clientErrorMessage } from "@/lib/client-errors";
import type { Client } from "@/types";

export interface ClientFormErrors {
  name?: string;
  nip?: string;
}

interface Options {
  client: Client | null;
  onSaved: (client: Client) => void;
}

interface ErrorBody {
  error?: string;
  fieldErrors?: { name?: string[]; nip?: string[] };
}

export function useClientForm({ client, onSaved }: Options) {
  const [name, setNameState] = useState(client?.name ?? "");
  const [nip, setNipState] = useState(client?.nip ?? "");
  const [chargeCompensation, setChargeCompensation] = useState(client?.chargeCompensation ?? true);
  const [errors, setErrors] = useState<ClientFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setName(value: string) {
    setNameState(value);
    setErrors((prev) => ({ ...prev, name: undefined }));
  }

  function setNip(value: string) {
    setNipState(value);
    setErrors((prev) => ({ ...prev, nip: undefined }));
  }

  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setServerError(null);

    const parsed = clientInputSchema.safeParse({ name, nip, chargeCompensation });
    if (!parsed.success) {
      const fieldErrors = z.flattenError(parsed.error).fieldErrors as { name?: string[]; nip?: string[] };
      setErrors({ name: fieldErrors.name?.[0], nip: fieldErrors.nip?.[0] });
      return;
    }
    setErrors({});
    setPending(true);

    try {
      const response = await fetch(client ? `/api/clients/${client.id}` : "/api/clients", {
        method: client ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json().catch(() => ({}))) as ErrorBody & { client?: Client };

      if (response.ok && body.client) {
        onSaved(body.client);
        return;
      }
      if (response.status === 400) {
        setErrors({ name: body.fieldErrors?.name?.[0], nip: body.fieldErrors?.nip?.[0] });
        return;
      }
      if (response.status === 409 && body.error === "duplicate_nip") {
        setErrors({ nip: clientErrorMessage(body.error) ?? undefined });
        return;
      }
      if (response.status === 409 && body.error === "duplicate_name") {
        setErrors({ name: clientErrorMessage(body.error) ?? undefined });
        return;
      }
      setServerError(clientErrorMessage(body.error ?? "unknown"));
    } catch {
      setServerError(clientErrorMessage("unknown"));
    } finally {
      setPending(false);
    }
  }

  return {
    name,
    setName,
    nip,
    setNip,
    chargeCompensation,
    setChargeCompensation,
    errors,
    serverError,
    pending,
    submit,
  };
}
