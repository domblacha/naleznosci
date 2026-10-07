import type { APIRoute } from "astro";
import { z } from "zod";
import { json } from "@/lib/http";
import { setInvoicePayment } from "@/lib/services/invoices";
import { invoiceResultResponse, withInvoiceAuth, withPaymentInput } from "@/lib/services/invoices-api";

export const prerender = false;

const notFound = () => Promise.resolve(json({ error: "not_found" }, 404));

export const PUT: APIRoute = (context) => {
  const id = z.uuid().safeParse(context.params.id);
  if (!id.success) return notFound();

  return withPaymentInput(context, async (supabase, input) =>
    invoiceResultResponse(await setInvoicePayment(supabase, id.data, input.paidOn), 200),
  );
};

export const DELETE: APIRoute = (context) => {
  const id = z.uuid().safeParse(context.params.id);
  if (!id.success) return notFound();

  return withInvoiceAuth(context, async (supabase) =>
    invoiceResultResponse(await setInvoicePayment(supabase, id.data, null), 200),
  );
};
