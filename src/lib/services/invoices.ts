import type { SupabaseClient } from "@supabase/supabase-js";
import type { Invoice, InvoiceInput } from "@/types";

export type InvoiceErrorCode = "duplicate_number" | "client_not_found" | "unknown";
export type InvoiceResult = { ok: true; invoice: Invoice } | { ok: false; code: InvoiceErrorCode };

const COLUMNS = "id, client_id, number, amount_grosze, due_date, created_at, clients(name)";
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
  created_at: string;
  clients: { name: string } | null;
}

function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.clients?.name ?? "",
    number: row.number,
    amountGrosze: row.amount_grosze,
    dueDate: row.due_date,
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

export async function listInvoices(supabase: SupabaseClient): Promise<Invoice[]> {
  const { data, error } = await supabase.from("invoices").select(COLUMNS).order("due_date");
  if (error) throw new Error(error.message);
  return (data as unknown as InvoiceRow[]).map(toInvoice);
}

export async function createInvoice(supabase: SupabaseClient, input: InvoiceInput): Promise<InvoiceResult> {
  const { data, error } = await supabase.from("invoices").insert(toRow(input)).select(COLUMNS).single();
  if (error) return { ok: false, code: toErrorCode(error) };
  return { ok: true, invoice: toInvoice(data as unknown as InvoiceRow) };
}
