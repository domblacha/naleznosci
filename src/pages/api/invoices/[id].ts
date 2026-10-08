import type { APIRoute } from "astro";
import { z } from "zod";
import { json } from "@/lib/http";
import { todayInPoland } from "@/lib/escalation";
import { updateInvoice } from "@/lib/services/invoices";
import { invoiceResultResponse, withInvoiceInput } from "@/lib/services/invoices-api";

export const prerender = false;

export const PUT: APIRoute = (context) => {
  const id = z.uuid().safeParse(context.params.id);
  if (!id.success) return Promise.resolve(json({ error: "not_found" }, 404));

  return withInvoiceInput(context, async (supabase, input) =>
    invoiceResultResponse(await updateInvoice(supabase, id.data, input, todayInPoland(new Date())), 200),
  );
};
