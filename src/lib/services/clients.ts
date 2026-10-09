import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client, ClientInput } from "@/types";

export type ClientErrorCode =
  | "duplicate_nip"
  | "duplicate_name"
  | "duplicate_nip_inactive"
  | "duplicate_name_inactive"
  | "has_open_invoices"
  | "not_found"
  | "unknown";
export type ClientResult = { ok: true; client: Client } | { ok: false; code: ClientErrorCode };

const COLUMNS = "id, name, nip, charge_compensation, deactivated_on, created_at";
const UNIQUE_VIOLATION = "23505";
// Index names must match supabase/migrations/*_create_clients.sql.
const NIP_INDEX = "clients_user_nip_key";
const NAME_INDEX = "clients_user_name_key";
const RAISE_EXCEPTION = "P0001";
// Exception text must match supabase/migrations/*_add_client_deactivated_on.sql (clients_guard_deactivation).
const HAS_OPEN_INVOICES_MESSAGE = "client_has_open_invoices";

interface ClientRow {
  id: string;
  name: string;
  nip: string | null;
  charge_compensation: boolean;
  deactivated_on: string | null;
  created_at: string;
}

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    nip: row.nip,
    chargeCompensation: row.charge_compensation,
    deactivatedOn: row.deactivated_on,
    createdAt: row.created_at,
  };
}

function toRow(input: ClientInput) {
  return { name: input.name, nip: input.nip, charge_compensation: input.chargeCompensation };
}

function toErrorCode(error: { code?: string; message?: string; details?: string }): ClientErrorCode {
  if (error.code === UNIQUE_VIOLATION) {
    const text = `${error.message ?? ""} ${error.details ?? ""}`;
    if (text.includes(NIP_INDEX)) return "duplicate_nip";
    if (text.includes(NAME_INDEX)) return "duplicate_name";
  }
  return "unknown";
}

/** Maps a unique violation to duplicate_*; the colliding row is read to tell active from deactivated clients. */
async function toDuplicateCode(
  supabase: SupabaseClient,
  error: { code?: string; message?: string; details?: string },
  input: ClientInput,
  excludeId?: string,
): Promise<ClientErrorCode> {
  const code = toErrorCode(error);
  if (code !== "duplicate_nip" && code !== "duplicate_name") return code;

  let query = supabase.from("clients").select("name, deactivated_on");
  if (code === "duplicate_nip") {
    query = query.eq("nip", input.nip);
  } else {
    // ilike only narrows the rows (PostgREST also treats `*` as a wildcard);
    // the exact case-insensitive match below mirrors the lower(name) index.
    query = query.is("nip", null).ilike("name", input.name.replace(/[\\%_]/g, "\\$&"));
  }
  if (excludeId) query = query.neq("id", excludeId);

  const { data, error: readError } = await query;
  if (readError) return code;
  const rows = data as { name: string; deactivated_on: string | null }[];
  const name = input.name.toLowerCase();
  const row = code === "duplicate_nip" ? rows[0] : rows.find((r) => r.name.toLowerCase() === name);
  if (!row) return code;
  return row.deactivated_on ? (`${code}_inactive` as ClientErrorCode) : code;
}

/** All clients, active and deactivated (`deactivatedOn` tells them apart). */
export async function listClients(supabase: SupabaseClient): Promise<Client[]> {
  const { data, error } = await supabase.from("clients").select(COLUMNS).order("name");
  if (error) throw new Error(error.message);
  return (data as ClientRow[]).map(toClient);
}

export async function listActiveClients(supabase: SupabaseClient): Promise<Client[]> {
  const { data, error } = await supabase.from("clients").select(COLUMNS).is("deactivated_on", null).order("name");
  if (error) throw new Error(error.message);
  return (data as ClientRow[]).map(toClient);
}

export async function createClient(supabase: SupabaseClient, input: ClientInput): Promise<ClientResult> {
  const { data, error } = await supabase.from("clients").insert(toRow(input)).select(COLUMNS).single();
  if (error) return { ok: false, code: await toDuplicateCode(supabase, error, input) };
  return { ok: true, client: toClient(data) };
}

export async function updateClient(supabase: SupabaseClient, id: string, input: ClientInput): Promise<ClientResult> {
  // A deactivated client cannot be edited: no row matches, so the result is not_found.
  const { data, error } = await supabase
    .from("clients")
    .update(toRow(input))
    .eq("id", id)
    .is("deactivated_on", null)
    .select(COLUMNS);
  if (error) return { ok: false, code: await toDuplicateCode(supabase, error, input, id) };
  if (data.length === 0) return { ok: false, code: "not_found" };
  return { ok: true, client: toClient(data[0]) };
}

/**
 * Deactivates an active client. The database trigger rejects it while the client has an open (also paused) invoice.
 * RLS hides foreign rows, so "no row returned" means not_found.
 */
export async function deactivateClient(supabase: SupabaseClient, id: string, today: string): Promise<ClientResult> {
  const { data, error } = await supabase
    .from("clients")
    .update({ deactivated_on: today })
    .eq("id", id)
    .is("deactivated_on", null)
    .select(COLUMNS);
  if (error) {
    const hasOpenInvoices = error.code === RAISE_EXCEPTION && error.message === HAS_OPEN_INVOICES_MESSAGE;
    return { ok: false, code: hasOpenInvoices ? "has_open_invoices" : "unknown" };
  }
  if (data.length === 0) return { ok: false, code: "not_found" };
  return { ok: true, client: toClient(data[0]) };
}

/** Restores a deactivated client. RLS hides foreign rows, so "no row returned" means not_found. */
export async function restoreClient(supabase: SupabaseClient, id: string): Promise<ClientResult> {
  const { data, error } = await supabase
    .from("clients")
    .update({ deactivated_on: null })
    .eq("id", id)
    .not("deactivated_on", "is", null)
    .select(COLUMNS);
  if (error) return { ok: false, code: "unknown" };
  if (data.length === 0) return { ok: false, code: "not_found" };
  return { ok: true, client: toClient(data[0]) };
}
