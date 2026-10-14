import type { SupabaseClient } from "@supabase/supabase-js";

// Klient zwracany przez zamockowane `createClient` z `@/lib/supabase`; ustawia go `callRoute`.
let current: SupabaseClient | null = null;

export function setCurrentClient(client: SupabaseClient | null) {
  current = client;
}

export function currentClient(): SupabaseClient | null {
  return current;
}
