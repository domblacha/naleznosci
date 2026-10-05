import type { APIContext } from "astro";
import { z } from "zod";
import { createClient as createSupabase } from "@/lib/supabase";
import { clientInputSchema } from "@/lib/client-schemas";
import type { ClientResult } from "@/lib/services/clients";
import type { ClientInput } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { json } from "@/lib/http";

const STATUS_BY_CODE = { duplicate_nip: 409, duplicate_name: 409, not_found: 404, unknown: 500 } as const;

export function resultResponse(result: ClientResult, successStatus: number) {
  if (result.ok) return json({ client: result.client }, successStatus);
  return json({ error: result.code }, STATUS_BY_CODE[result.code]);
}

/** Shared guard for the clients endpoints: auth, config, JSON body and schema validation. */
export async function withClientInput(
  context: APIContext,
  handler: (supabase: SupabaseClient, input: ClientInput) => Promise<Response>,
): Promise<Response> {
  if (!context.locals.user) return json({ error: "unauthorized" }, 401);

  const supabase = createSupabase(context.request.headers, context.cookies);
  if (!supabase) return json({ error: "config_missing" }, 500);

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "invalid_input", fieldErrors: {} }, 400);
  }

  const parsed = clientInputSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "invalid_input", fieldErrors: z.flattenError(parsed.error).fieldErrors }, 400);
  }

  return handler(supabase, parsed.data);
}

export { json };
