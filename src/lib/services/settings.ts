import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_ESCALATION_SETTINGS } from "@/lib/charges";
import type { EscalationSettings } from "@/types";

const COLUMNS =
  "threshold_1, threshold_2, threshold_3, threshold_4, annual_rate_bp, compensation_1_grosze, compensation_2_grosze, compensation_3_grosze";

interface SettingsRow {
  threshold_1: number;
  threshold_2: number;
  threshold_3: number;
  threshold_4: number;
  annual_rate_bp: number;
  compensation_1_grosze: number;
  compensation_2_grosze: number;
  compensation_3_grosze: number;
}

function toSettings(row: SettingsRow): EscalationSettings {
  return {
    thresholds: [row.threshold_1, row.threshold_2, row.threshold_3, row.threshold_4],
    annualRateBp: row.annual_rate_bp,
    compensationGrosze: [row.compensation_1_grosze, row.compensation_2_grosze, row.compensation_3_grosze],
  };
}

function toRow(settings: EscalationSettings): SettingsRow {
  const [t1, t2, t3, t4] = settings.thresholds;
  const [c1, c2, c3] = settings.compensationGrosze;
  return {
    threshold_1: t1,
    threshold_2: t2,
    threshold_3: t3,
    threshold_4: t4,
    annual_rate_bp: settings.annualRateBp,
    compensation_1_grosze: c1,
    compensation_2_grosze: c2,
    compensation_3_grosze: c3,
  };
}

/** The signed-in user's settings; defaults from code when nothing has been saved yet. */
export async function getSettings(supabase: SupabaseClient): Promise<EscalationSettings> {
  const { data, error } = await supabase.from("user_settings").select(COLUMNS).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toSettings(data) : DEFAULT_ESCALATION_SETTINGS;
}

/** Saves the signed-in user's settings (one row per user; `user_id` defaults to `auth.uid()`). */
export async function saveSettings(
  supabase: SupabaseClient,
  settings: EscalationSettings,
): Promise<EscalationSettings> {
  const { data, error } = await supabase
    .from("user_settings")
    .upsert({ ...toRow(settings), updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return toSettings(data);
}
