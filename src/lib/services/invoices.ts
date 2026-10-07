import type { SupabaseClient } from "@supabase/supabase-js";
import type { Invoice, InvoiceInput } from "@/types";

export type InvoiceErrorCode = "duplicate_number" | "client_not_found" | "not_found" | "unknown";
export type InvoiceResult = { ok: true; invoice: Invoice } | { ok: false; code: InvoiceErrorCode };

const COLUMNS =
  "id, client_id, number, amount_grosze, due_date, paid_on, created_at, clients(name, charge_compensation)";
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
// Constraint names must match supabase/migrations/*_create_invoices.sql.
const NUMBER_INDEX = "invoices_user_number_key";
const CLIENT_OWNER_FKEY = "invoices_client_owner_fkey";

interface InvoiceRow {
  id: string;
  client_id: string;
  number: string;
  amount_grosze: number;
  due_date: string;
  paid_on: string | null;
  created_at: string;
  clients: { name: string; charge_compensation: boolean } | null;
}

function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.clients?.name ?? "",
    clientChargesCompensation: row.clients?.charge_compensation ?? false,
    number: row.number,
    amountGrosze: row.amount_grosze,
    dueDate: row.due_date,
    paidOn: row.paid_on,
    createdAt: row.created_at,
  };
}

function toRow(input: InvoiceInput) {
  return {
    client_id: input.clientId,
    number: input.number,
    amount_grosze: input.amountGrosze,
    due_date: input.dueDate,
  };
}

function toErrorCode(error: { code?: string; message?: string; details?: string }): InvoiceErrorCode {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  if (error.code === UNIQUE_VIOLATION && text.includes(NUMBER_INDEX)) return "duplicate_number";
  if (error.code === FOREIGN_KEY_VIOLATION && text.includes(CLIENT_OWNER_FKEY)) return "client_not_found";
  return "unknown";
}

export async function listOpenInvoices(supabase: SupabaseClient): Promise<Invoice[]> {
  const { data, error } = await supabase.from("invoices").select(COLUMNS).is("paid_on", null).order("due_date");
  if (error) throw new Error(error.message);
  return (data as unknown as InvoiceRow[]).map(toInvoice);
}

export async function listPaidInvoices(supabase: SupabaseClient): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select(COLUMNS)
    .not("paid_on", "is", null)
    .order("paid_on", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as InvoiceRow[]).map(toInvoice);
}

export async function createInvoice(supabase: SupabaseClient, input: InvoiceInput): Promise<InvoiceResult> {
  const { data, error } = await supabase.from("invoices").insert(toRow(input)).select(COLUMNS).single();
  if (error) return { ok: false, code: toErrorCode(error) };
  return { ok: true, invoice: toInvoice(data as unknown as InvoiceRow) };
}

/** Sets or clears (null) the payment date. RLS hides foreign rows, so "no row returned" means not_found. */
export async function setInvoicePayment(
  supabase: SupabaseClient,
  id: string,
  paidOn: string | null,
): Promise<InvoiceResult> {
  const { data, error } = await supabase
    .from("invoices")
    .update({ paid_on: paidOn })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) return { ok: false, code: "unknown" };
  if (!data) return { ok: false, code: "not_found" };
  return { ok: true, invoice: toInvoice(data as unknown as InvoiceRow) };
}
