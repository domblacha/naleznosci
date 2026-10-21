import type { SupabaseClient } from "@supabase/supabase-js";
import { chargeSettingsFrom, paymentSnapshot } from "@/lib/charges";
import { isInvoiceLocked, lockedFieldsChanged } from "@/lib/invoice-lock";
import { getSettings } from "@/lib/services/settings";
import type { Invoice, InvoiceInput } from "@/types";

export type InvoiceErrorCode =
  "duplicate_number" | "client_not_found" | "client_inactive" | "not_found" | "locked" | "unknown";
export type InvoiceResult = { ok: true; invoice: Invoice } | { ok: false; code: InvoiceErrorCode };

const COLUMNS =
  "id, client_id, number, amount_grosze, due_date, paid_on, paid_rate_bp, paid_compensation_grosze, cancelled_on, paused_on, created_at, clients(name, charge_compensation)";
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const RAISE_EXCEPTION = "P0001";
// Constraint names must match supabase/migrations/*_create_invoices.sql.
const NUMBER_INDEX = "invoices_user_number_key";
const CLIENT_OWNER_FKEY = "invoices_client_owner_fkey";
// Exception text must match supabase/migrations/*_add_client_deactivated_on.sql (invoices_guard_client_active).
const CLIENT_INACTIVE_MESSAGE = "client_inactive";
// Exception texts must match supabase/migrations/*_guard_invoice_locked_fields.sql (invoices_guard_locked_fields).
const INVOICE_LOCKED_MESSAGE = "invoice_locked";
const INVOICE_CLOSED_MESSAGE = "invoice_closed";

interface InvoiceRow {
  id: string;
  client_id: string;
  number: string;
  amount_grosze: number;
  due_date: string;
  paid_on: string | null;
  paid_rate_bp: number | null;
  paid_compensation_grosze: number | null;
  cancelled_on: string | null;
  paused_on: string | null;
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
    paidRateBp: row.paid_rate_bp,
    paidCompensationGrosze: row.paid_compensation_grosze,
    cancelledOn: row.cancelled_on,
    pausedOn: row.paused_on,
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
  if (error.code === RAISE_EXCEPTION && error.message === CLIENT_INACTIVE_MESSAGE) return "client_inactive";
  if (error.code === RAISE_EXCEPTION && error.message === INVOICE_LOCKED_MESSAGE) return "locked";
  if (error.code === RAISE_EXCEPTION && error.message === INVOICE_CLOSED_MESSAGE) return "not_found";
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

/**
 * Marks an open invoice paid, changes the payment date of a paid one, or reopens it (null).
 * Marking freezes the owner's current rate and the invoice's compensation tier amount on the invoice;
 * changing the date keeps that snapshot, reopening clears it. A paid invoice is never paused, so marking
 * clears the pause. RLS hides foreign rows, and the update repeats the open/paid condition read before,
 * so "no row" (also after a concurrent change) means not_found.
 */
export async function setInvoicePayment(
  supabase: SupabaseClient,
  id: string,
  paidOn: string | null,
): Promise<InvoiceResult> {
  // Reopening applies only to a paid invoice, so it never silently resumes an open, paused one.
  if (paidOn === null) {
    return updateResult(
      await supabase
        .from("invoices")
        .update({ paid_on: null, paid_rate_bp: null, paid_compensation_grosze: null, paused_on: null })
        .eq("id", id)
        .is("cancelled_on", null)
        .not("paid_on", "is", null)
        .select(COLUMNS),
    );
  }

  const { data: current, error: readError } = await supabase
    .from("invoices")
    .select(COLUMNS)
    .eq("id", id)
    .is("cancelled_on", null)
    .maybeSingle();
  if (readError) return { ok: false, code: "unknown" };
  if (!current) return { ok: false, code: "not_found" };

  const invoice = toInvoice(current as unknown as InvoiceRow);
  if (invoice.paidOn !== null) {
    return updateResult(
      await supabase
        .from("invoices")
        .update({ paid_on: paidOn })
        .eq("id", id)
        .is("cancelled_on", null)
        .not("paid_on", "is", null)
        .select(COLUMNS),
    );
  }

  const settings = await getSettings(supabase).catch(() => null);
  if (!settings) return { ok: false, code: "unknown" };
  const snapshot = paymentSnapshot(invoice, chargeSettingsFrom(settings));
  return updateResult(
    await supabase
      .from("invoices")
      .update({
        paid_on: paidOn,
        paid_rate_bp: snapshot.rateBp,
        paid_compensation_grosze: snapshot.compensationGrosze,
        paused_on: null,
      })
      .eq("id", id)
      .is("cancelled_on", null)
      .is("paid_on", null)
      .select(COLUMNS),
  );
}

/** Result of an update that returns 0 or 1 invoice rows. */
function updateResult(result: {
  data: unknown[] | null;
  error: { code?: string; message?: string; details?: string } | null;
}): InvoiceResult {
  if (result.error) return { ok: false, code: toErrorCode(result.error) };
  if (!result.data || result.data.length === 0) return { ok: false, code: "not_found" };
  return { ok: true, invoice: toInvoice(result.data[0] as InvoiceRow) };
}

/**
 * Edits an open invoice. The lock is checked on the row read from the database, and the update repeats the
 * conditions (still open; due date not passed or escalation paused when locked fields change), so a concurrent
 * change (e.g. a resume) ends with 0 rows.
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
  if (lockedChange) query = query.or(`due_date.gte.${today},paused_on.not.is.null`);

  const { data, error } = await query.select(COLUMNS);
  if (error) return { ok: false, code: toErrorCode(error) };
  if (data.length === 0) return { ok: false, code: "not_found" };
  return { ok: true, invoice: toInvoice(data[0] as unknown as InvoiceRow) };
}

/**
 * Cancels an open invoice (sets `cancelled_on` and clears the pause). RLS hides foreign rows,
 * so "no row returned" means not_found.
 */
export async function cancelInvoice(supabase: SupabaseClient, id: string, today: string): Promise<InvoiceResult> {
  const { data, error } = await supabase
    .from("invoices")
    .update({ cancelled_on: today, paused_on: null })
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

/** Pauses the escalation of an open, not yet paused invoice. RLS hides foreign rows, so "no row" means not_found. */
export async function pauseInvoice(supabase: SupabaseClient, id: string, today: string): Promise<InvoiceResult> {
  const { data, error } = await supabase
    .from("invoices")
    .update({ paused_on: today })
    .eq("id", id)
    .is("paid_on", null)
    .is("cancelled_on", null)
    .is("paused_on", null)
    .select(COLUMNS);
  if (error) return { ok: false, code: "unknown" };
  if (data.length === 0) return { ok: false, code: "not_found" };
  return { ok: true, invoice: toInvoice(data[0] as unknown as InvoiceRow) };
}

/** Resumes the escalation of an open, paused invoice. RLS hides foreign rows, so "no row" means not_found. */
export async function resumeInvoice(supabase: SupabaseClient, id: string): Promise<InvoiceResult> {
  const { data, error } = await supabase
    .from("invoices")
    .update({ paused_on: null })
    .eq("id", id)
    .is("paid_on", null)
    .is("cancelled_on", null)
    .not("paused_on", "is", null)
    .select(COLUMNS);
  if (error) return { ok: false, code: "unknown" };
  if (data.length === 0) return { ok: false, code: "not_found" };
  return { ok: true, invoice: toInvoice(data[0] as unknown as InvoiceRow) };
}
