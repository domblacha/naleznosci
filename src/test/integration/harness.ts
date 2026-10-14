import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { APIContext } from "astro";
import { inject } from "vitest";
import { setCurrentClient } from "./current-client";

/** Wiersz tabeli bez typowania kolumn; testy asertują pojedyncze pola. */
export type Row = Record<string, unknown>;

/** Ciało odpowiedzi API: kody błędów, błędy pól i zwrócone zasoby. */
export interface ResponseBody {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  client?: Row & { id: string };
  invoice?: Row & { id: string };
  [key: string]: unknown;
}

export interface TestUser {
  user: User;
  client: SupabaseClient;
}

const AUTH_OPTIONS = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const PASSWORD = "Test-pass-1234";
// Wspólny prefiks przebiegu; musi pasować do wzorca sprzątania w global-setup.ts.
const RUN_ID = String(Date.now());

let sequence = 0;
/** Unikalny sufiks dla numerów, nazw i NIP-ów w obrębie przebiegu. */
function nextSequence() {
  sequence += 1;
  return sequence;
}

function adminClient() {
  const { apiUrl, serviceRoleKey } = inject("supabaseEnv");
  return createClient(apiUrl, serviceRoleKey, AUTH_OPTIONS);
}

/** Rola to same małe litery (`a`, `b`), bo e-mail musi pasować do `^int-\d+-[a-z]+@example\.com$`. */
export async function createTestUsers<R extends string>(roles: readonly R[]): Promise<Record<R, TestUser>> {
  const { apiUrl, anonKey } = inject("supabaseEnv");
  const admin = adminClient();
  const result = {} as Record<R, TestUser>;
  for (const role of roles) {
    const email = `int-${RUN_ID}-${role}@example.com`;
    const { error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw new Error(`createUser(${email}): ${error.message}`);
    const client = createClient(apiUrl, anonKey, AUTH_OPTIONS);
    const { data, error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (signInError) throw new Error(`signIn(${email}): ${signInError.message}`);
    result[role] = { user: data.user, client };
  }
  return result;
}

/** Usuwa konta (kaskadowo także ich dane); do `afterAll`. */
export async function deleteTestUsers(users: Record<string, TestUser>) {
  const admin = adminClient();
  for (const { user, client } of Object.values(users)) {
    await client.auth.signOut({ scope: "local" });
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new Error(`deleteUser(${user.email}): ${error.message}`);
  }
}

type Handler = (context: APIContext) => Response | Promise<Response>;

export interface CallOptions {
  /** Użytkownik wywołujący; brak = żądanie bez sesji (401). */
  as?: TestUser;
  method?: string;
  params?: Record<string, string>;
  /** Ciało serializowane do JSON-a. */
  body?: unknown;
  /** Surowe ciało (np. nie-JSON); ma pierwszeństwo przed `body`. */
  rawBody?: string;
}

/** Wywołuje handler trasy jak Astro: z `locals.user`, `params` i `Request`, a klientem bazy jest klient `as`. */
export async function callRoute(handler: Handler, options: CallOptions = {}) {
  const { as, method = "GET", params = {}, body, rawBody } = options;
  setCurrentClient(as?.client ?? null);
  const payload = rawBody ?? (body === undefined ? undefined : JSON.stringify(body));
  const request = new Request("http://localhost/api/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload,
  });
  const context = { request, params, locals: { user: as?.user ?? null }, cookies: {} } as unknown as APIContext;
  const response = await handler(context);
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as ResponseBody | null };
}

/** Pełny wiersz albo `null`, gdy go nie ma (lub RLS go ukrywa). */
export async function readRow(client: SupabaseClient, table: string, id: string) {
  const result = await client.from(table).select("*").eq("id", id).maybeSingle();
  if (result.error) throw new Error(`readRow(${table}): ${result.error.message}`);
  return result.data as Row | null;
}

export async function countRows(client: SupabaseClient, table: string) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`countRows(${table}): ${error.message}`);
  return count ?? 0;
}

/** Daty fixtures daleko od „dziś”, żeby nie mockować czasu. */
export const DATES = {
  overdue: "2024-01-15",
  current: "2099-12-31",
  paidOn: "2025-01-10",
} as const;

/** Poprawny co do formatu (10 cyfr) i unikalny NIP; fixtures wstawiają wiersze wprost, bez walidacji sumy kontrolnej. */
function uniqueNip() {
  return String(1_000_000_000 + ((Number(RUN_ID.slice(-6)) * 1000 + nextSequence()) % 9_000_000_000)).padStart(10, "0");
}

export async function insertClient(client: SupabaseClient, overrides: Record<string, unknown> = {}) {
  const n = nextSequence();
  const result = await client
    .from("clients")
    .insert({
      name: `Klient ${RUN_ID}-${n}-${randomUUID().slice(0, 8)}`,
      nip: uniqueNip(),
      charge_compensation: true,
      ...overrides,
    })
    .select("*")
    .single();
  if (result.error) throw new Error(`insertClient: ${result.error.message}`);
  return result.data as Row;
}

export type InvoiceState = "open-current" | "open-overdue" | "paused" | "paid" | "cancelled";

/** Kolumny zależne od stanu; zapłacona wymaga paid_on oraz obu kolumn migawki, wstrzymana tylko otwartej. */
const STATE_COLUMNS: Record<InvoiceState, Record<string, unknown>> = {
  "open-current": { due_date: DATES.current },
  "open-overdue": { due_date: DATES.overdue },
  paused: { due_date: DATES.overdue, paused_on: "2024-02-01" },
  paid: { due_date: DATES.overdue, paid_on: DATES.paidOn, paid_rate_bp: 1000, paid_compensation_grosze: 4000 },
  cancelled: { due_date: DATES.overdue, cancelled_on: "2024-02-01" },
};

export async function insertInvoice(
  client: SupabaseClient,
  clientId: string,
  state: InvoiceState,
  overrides: Record<string, unknown> = {},
) {
  const n = nextSequence();
  const result = await client
    .from("invoices")
    .insert({
      client_id: clientId,
      number: `FV/${RUN_ID}/${n}`,
      amount_grosze: 100_000,
      ...STATE_COLUMNS[state],
      ...overrides,
    })
    .select("*")
    .single();
  if (result.error) throw new Error(`insertInvoice(${state}): ${result.error.message}`);
  return result.data as Row;
}
