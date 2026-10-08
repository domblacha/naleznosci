import type { APIContext } from "astro";
import { z } from "zod";
import { createClient as createSupabase } from "@/lib/supabase";
import { json } from "@/lib/http";
import { invoiceInputSchema, paymentInputSchema } from "@/lib/invoice-schemas";
import { todayInPoland } from "@/lib/escalation";
import type { InvoiceResult } from "@/lib/services/invoices";
import type { InvoiceInput, PaymentInput } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const STATUS_BY_CODE = {
  duplicate_number: 409,
  locked: 409,
  client_not_found: 404,
  not_found: 404,
  unknown: 500,
} as const;

export function invoiceResultResponse(result: InvoiceResult, successStatus: number) {
  if (result.ok) return json({ invoice: result.invoice }, successStatus);
  return json({ error: result.code }, STATUS_BY_CODE[result.code]);
}

/** Auth and config part shared by every invoices endpoint. */
async function withInvoiceSession(
  context: APIContext,
  handler: (supabase: SupabaseClient) => Promise<Response>,
): Promise<Response> {
  if (!context.locals.user) return json({ error: "unauthorized" }, 401);

  const supabase = createSupabase(context.request.headers, context.cookies);
  if (!supabase) return json({ error: "config_missing" }, 500);

  return handler(supabase);
}

/** Auth, config, JSON body and schema validation for endpoints that take a body. */
async function withValidatedBody<T>(
  context: APIContext,
  schema: z.ZodType<T>,
  handler: (supabase: SupabaseClient, input: T) => Promise<Response>,
): Promise<Response> {
  return withInvoiceSession(context, async (supabase) => {
    let body: unknown;
    try {
      body = await context.request.json();
    } catch {
      return json({ error: "invalid_input", fieldErrors: {} }, 400);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return json({ error: "invalid_input", fieldErrors: z.flattenError(parsed.error).fieldErrors }, 400);
    }

    return handler(supabase, parsed.data);
  });
}

/** Shared guard for the invoices endpoints: auth, config, JSON body and schema validation. */
export function withInvoiceInput(
  context: APIContext,
  handler: (supabase: SupabaseClient, input: InvoiceInput) => Promise<Response>,
): Promise<Response> {
  return withValidatedBody(context, invoiceInputSchema, handler);
}

/** Guard for setting the payment date: the date may not be later than today (Polish time). */
export function withPaymentInput(
  context: APIContext,
  handler: (supabase: SupabaseClient, input: PaymentInput) => Promise<Response>,
): Promise<Response> {
  return withValidatedBody(context, paymentInputSchema(todayInPoland(new Date())), handler);
}

/** Guard for endpoints without a body (auth and config only). */
export const withInvoiceAuth = withInvoiceSession;
