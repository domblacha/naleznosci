import type { APIContext } from "astro";
import { z } from "zod";
import { createClient as createSupabase } from "@/lib/supabase";
import { json } from "@/lib/http";
import { invoiceInputSchema } from "@/lib/invoice-schemas";
import type { InvoiceResult } from "@/lib/services/invoices";
import type { InvoiceInput } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const STATUS_BY_CODE = { duplicate_number: 409, client_not_found: 404, unknown: 500 } as const;

export function invoiceResultResponse(result: InvoiceResult, successStatus: number) {
  if (result.ok) return json({ invoice: result.invoice }, successStatus);
  return json({ error: result.code }, STATUS_BY_CODE[result.code]);
}

/** Shared guard for the invoices endpoints: auth, config, JSON body and schema validation. */
export async function withInvoiceInput(
  context: APIContext,
  handler: (supabase: SupabaseClient, input: InvoiceInput) => Promise<Response>,
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

  const parsed = invoiceInputSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "invalid_input", fieldErrors: z.flattenError(parsed.error).fieldErrors }, 400);
  }

  return handler(supabase, parsed.data);
}
