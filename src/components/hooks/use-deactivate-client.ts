import { useState } from "react";
import { clientErrorMessage } from "@/lib/client-errors";
import type { Client } from "@/types";

interface Options {
  onDeactivated: (client: Client) => void;
}

interface ErrorBody {
  error?: string;
}

export function useDeactivateClient({ onDeactivated }: Options) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deactivate(id: string) {
    if (pending) return;
    setError(null);
    setPending(true);

    try {
      const response = await fetch(`/api/clients/${id}/deactivation`, { method: "PUT" });
      const body = (await response.json().catch(() => ({}))) as ErrorBody & { client?: Client };

      if (response.ok && body.client) {
        onDeactivated(body.client);
        return;
      }
      setError(clientErrorMessage(body.error ?? "unknown"));
    } catch {
      setError(clientErrorMessage("unknown"));
    } finally {
      setPending(false);
    }
  }

  return { deactivate, pending, error };
}
