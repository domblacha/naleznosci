import type { APIRoute } from "astro";
import { createInvoice } from "@/lib/services/invoices";
import { invoiceResultResponse, withInvoiceInput } from "@/lib/services/invoices-api";

export const prerender = false;

export const POST: APIRoute = (context) =>
  withInvoiceInput(context, async (supabase, input) =>
    invoiceResultResponse(await createInvoice(supabase, input), 201),
  );
