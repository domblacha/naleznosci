import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_SENDER_PROFILE } from "@/lib/sender-profile";
import type { SenderProfile } from "@/types";

const COLUMNS = "company_name, nip, address, bank_account";

interface SenderProfileRow {
  company_name: string | null;
  nip: string | null;
  address: string | null;
  bank_account: string | null;
}

function toProfile(row: SenderProfileRow): SenderProfile {
  return {
    companyName: row.company_name,
    nip: row.nip,
    address: row.address,
    bankAccount: row.bank_account,
  };
}

function toRow(profile: SenderProfile): SenderProfileRow {
  return {
    company_name: profile.companyName,
    nip: profile.nip,
    address: profile.address,
    bank_account: profile.bankAccount,
  };
}

/** The signed-in user's sender profile; an empty profile when nothing has been saved yet. */
export async function getSenderProfile(supabase: SupabaseClient): Promise<SenderProfile> {
  const { data, error } = await supabase.from("sender_profiles").select(COLUMNS).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toProfile(data) : EMPTY_SENDER_PROFILE;
}

/** Saves the signed-in user's sender profile (one row per user; `user_id` defaults to `auth.uid()`). */
export async function saveSenderProfile(supabase: SupabaseClient, profile: SenderProfile): Promise<SenderProfile> {
  const { data, error } = await supabase
    .from("sender_profiles")
    .upsert({ ...toRow(profile), updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return toProfile(data);
}
