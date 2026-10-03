import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client, ClientInput } from "@/types";

export type ClientErrorCode = "duplicate_nip" | "duplicate_name" | "not_found" | "unknown";
export type ClientResult = { ok: true; client: Client } | { ok: false; code: ClientErrorCode };

const COLUMNS = "id, name, nip, charge_compensation, created_at";
const UNIQUE_VIOLATION = "23505";
// Index names must match supabase/migrations/*_create_clients.sql.
const NIP_INDEX = "clients_user_nip_key";
const NAME_INDEX = "clients_user_name_key";

interface ClientRow {
  id: string;
  name: string;
  nip: string | null;
  charge_compensation: boolean;
  created_at: string;
}

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    nip: row.nip,
    chargeCompensation: row.charge_compensation,
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

export async function listClients(supabase: SupabaseClient): Promise<Client[]> {
  const { data, error } = await supabase.from("clients").select(COLUMNS).order("name");
  if (error) throw new Error(error.message);
  return (data as ClientRow[]).map(toClient);
}

export async function createClient(supabase: SupabaseClient, input: ClientInput): Promise<ClientResult> {
  const { data, error } = await supabase.from("clients").insert(toRow(input)).select(COLUMNS).single();
  if (error) return { ok: false, code: toErrorCode(error) };
  return { ok: true, client: toClient(data) };
}

export async function updateClient(supabase: SupabaseClient, id: string, input: ClientInput): Promise<ClientResult> {
  const { data, error } = await supabase.from("clients").update(toRow(input)).eq("id", id).select(COLUMNS);
  if (error) return { ok: false, code: toErrorCode(error) };
  if (data.length === 0) return { ok: false, code: "not_found" };
  return { ok: true, client: toClient(data[0]) };
}
