import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { TestProject } from "vitest/node";

export interface SupabaseEnv {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    supabaseEnv: SupabaseEnv;
  }
}

// Konta zostawione przez przerwany przebieg; harness tworzy e-maile w tym samym formacie.
const TEST_EMAIL = /^int-\d+-[a-z]+@example\.com$/;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const START_HINT = "Uruchom `npx supabase start` i spróbuj ponownie.";

/** Parsuje wyjście `supabase status -o env`: pomija linie CLI, bierze tylko `KEY="value"`. */
function parseStatusEnv(output: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const match = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim());
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function readEnv(): SupabaseEnv {
  let { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = process.env;
  if (!API_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    let output: string;
    try {
      output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      throw new Error(`Lokalny Supabase nie działa. ${START_HINT}`);
    }
    const parsed = parseStatusEnv(output);
    API_URL = API_URL ?? parsed.API_URL;
    ANON_KEY = ANON_KEY ?? parsed.ANON_KEY;
    SERVICE_ROLE_KEY = SERVICE_ROLE_KEY ?? parsed.SERVICE_ROLE_KEY;
  }
  if (!API_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    throw new Error(`Nie udało się ustalić API_URL / ANON_KEY / SERVICE_ROLE_KEY lokalnego Supabase. ${START_HINT}`);
  }
  return { apiUrl: API_URL, anonKey: ANON_KEY, serviceRoleKey: SERVICE_ROLE_KEY };
}

/** Straż celu: klucz service_role i deleteUser nigdy nie mogą trafić w zdalny projekt. */
function assertLocal(apiUrl: string) {
  let host: string;
  try {
    host = new URL(apiUrl).hostname;
  } catch {
    throw new Error(`Niepoprawny API_URL: ${apiUrl}`);
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Testy integracyjne działają tylko na lokalnym Supabase (127.0.0.1 / localhost), a API_URL wskazuje ${host}.`,
    );
  }
}

async function deleteLeftoverUsers(env: SupabaseEnv) {
  const admin = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const perPage = 50;
  // Usuwanie przesuwa strony, więc najpierw zbieramy wszystkie konta testowe, a kasujemy po przejściu listy.
  const leftovers: { id: string; email: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Nie udało się wylistować użytkowników: ${error.message}. ${START_HINT}`);
    for (const user of data.users) {
      if (user.email && TEST_EMAIL.test(user.email)) leftovers.push({ id: user.id, email: user.email });
    }
    if (data.users.length < perPage) break;
  }
  for (const { id, email } of leftovers) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(`Nie udało się usunąć ${email}: ${error.message}`);
  }
}

export default async function setup(project: TestProject) {
  const env = readEnv();
  assertLocal(env.apiUrl);
  await deleteLeftoverUsers(env);
  project.provide("supabaseEnv", env);
}
