import type { SupabaseClient } from "@supabase/supabase-js";
import { isInvoiceLocked, lockedFieldsChanged } from "@/lib/invoice-lock";
import type { Invoice, InvoiceInput } from "@/types";

export type InvoiceErrorCode = "duplicate_number" | "client_not_found" | "not_found" | "locked" | "unknown";
export type InvoiceResult = { ok: true; invoice: Invoice } | { ok: false; code: InvoiceErrorCode };

const COLUMNS =
  "id, client_id, number, amount_grosze, due_date, paid_on, cancelled_on, created_at, clients(name, charge_compensation)";
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
  cancelled_on: string | null;
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
    cancelledOn: row.cancelled_on,
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
  const { data, error } = await supabase
    .from("invoices")
    .select(COLUMNS)
    .is("paid_on", null)
    .is("cancelled_on", null)
    .order("due_date");
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

export async function listCancelledInvoices(supabase: SupabaseClient): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select(COLUMNS)
    .not("cancelled_on", "is", null)
    .order("cancelled_on", { ascending: false });
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
    .is("cancelled_on", null)
    .select(COLUMNS)
    .maybeSingle();
  if (error) return { ok: false, code: "unknown" };
  if (!data) return { ok: false, code: "not_found" };
  return { ok: true, invoice: toInvoice(data as unknown as InvoiceRow) };
}

/**
 * Edits an open invoice. The lock is checked on the row read from the database, and the update repeats the
 * conditions (still open, due date not passed when locked fields change), so a concurrent change ends with 0 rows.
 */
export async function updateInvoice(
  supabase: SupabaseClient,
  id: string,
  input: InvoiceInput,
  today: string,
): Promise<InvoiceResult> {
  const { data: current, error: readError } = await supabase
    .from("invoices")
    .select(COLUMNS)
    .eq("id", id)
    .is("paid_on", null)
    .is("cancelled_on", null)
    .maybeSingle();
  if (readError) return { ok: false, code: "unknown" };
  if (!current) return { ok: false, code: "not_found" };

  const row = toInvoice(current as unknown as InvoiceRow);
  const lockedChange = lockedFieldsChanged(row, input);
  if (lockedChange && isInvoiceLocked(row, today)) return { ok: false, code: "locked" };

  let query = supabase.from("invoices").update(toRow(input)).eq("id", id).is("paid_on", null).is("cancelled_on", null);
  if (lockedChange) query = query.gte("due_date", today);

  const { data, error } = await query.select(COLUMNS);
  if (error) return { ok: false, code: toErrorCode(error) };
  if (data.length === 0) return { ok: false, code: "not_found" };
  return { ok: true, invoice: toInvoice(data[0] as unknown as InvoiceRow) };
}

/** Cancels an open invoice (sets `cancelled_on`). RLS hides foreign rows, so "no row returned" means not_found. */
export async function cancelInvoice(supabase: SupabaseClient, id: string, today: string): Promise<InvoiceResult> {
  const { data, error } = await supabase
    .from("invoices")
    .update({ cancelled_on: today })
    .eq("id", id)
    .is("paid_on", null)
    .is("cancelled_on", null)
    .select(COLUMNS);
  if (error) return { ok: false, code: "unknown" };
  if (data.length === 0) return { ok: false, code: "not_found" };
  return { ok: true, invoice: toInvoice(data[0] as unknown as InvoiceRow) };
}

/** Restores a cancelled invoice; the number may have been taken meanwhile (duplicate_number). */
export async function restoreInvoice(supabase: SupabaseClient, id: string): Promise<InvoiceResult> {
  const { data, error } = await supabase
    .from("invoices")
    .update({ cancelled_on: null })
    .eq("id", id)
    .not("cancelled_on", "is", null)
    .select(COLUMNS);
  if (error) return { ok: false, code: toErrorCode(error) };
  if (data.length === 0) return { ok: false, code: "not_found" };
  return { ok: true, invoice: toInvoice(data[0] as unknown as InvoiceRow) };
}
