import type { APIRoute } from "astro";
import { z } from "zod";
import { json } from "@/lib/http";
import { todayInPoland } from "@/lib/escalation";
import { pauseInvoice, resumeInvoice } from "@/lib/services/invoices";
import { invoiceResultResponse, withInvoiceAuth } from "@/lib/services/invoices-api";

export const prerender = false;

const notFound = () => Promise.resolve(json({ error: "not_found" }, 404));

export const PUT: APIRoute = (context) => {
  const id = z.uuid().safeParse(context.params.id);
  if (!id.success) return notFound();

  return withInvoiceAuth(context, async (supabase) =>
    invoiceResultResponse(await pauseInvoice(supabase, id.data, todayInPoland(new Date())), 200),
  );
};

export const DELETE: APIRoute = (context) => {
  const id = z.uuid().safeParse(context.params.id);
  if (!id.success) return notFound();

  return withInvoiceAuth(context, async (supabase) =>
    invoiceResultResponse(await resumeInvoice(supabase, id.data), 200),
  );
};
