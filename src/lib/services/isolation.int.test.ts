import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createClientRoute } from "@/pages/api/clients/index";
import { PUT as editClient } from "@/pages/api/clients/[id]";
import { PUT as deactivateClient, DELETE as restoreClient } from "@/pages/api/clients/[id]/deactivation";
import { POST as createInvoice } from "@/pages/api/invoices/index";
import { PUT as editInvoice } from "@/pages/api/invoices/[id]";
import { PUT as putPayment, DELETE as deletePayment } from "@/pages/api/invoices/[id]/payment";
import { PUT as cancel, DELETE as restore } from "@/pages/api/invoices/[id]/cancellation";
import { PUT as pause, DELETE as resume } from "@/pages/api/invoices/[id]/pause";
import { PUT as saveSettings } from "@/pages/api/settings";
import { PUT as saveSenderProfile } from "@/pages/api/sender-profile";
import { DEFAULT_ESCALATION_SETTINGS } from "@/lib/charges";
import { EMPTY_SENDER_PROFILE } from "@/lib/sender-profile";
import { listActiveClients, listClients } from "@/lib/services/clients";
import { listCancelledInvoices, listOpenInvoices, listPaidInvoices } from "@/lib/services/invoices";
import { getSenderProfile } from "@/lib/services/sender-profile";
import { getSettings } from "@/lib/services/settings";
import {
  callRoute,
  countRows,
  createTestUsers,
  DATES,
  deleteTestUsers,
  insertClient,
  insertInvoice,
  readRow,
  type InvoiceState,
  type Row,
  type TestUser,
} from "@/test/integration/harness";

type Handler = Parameters<typeof callRoute>[0];

// Ustawienia i profil właściciela (A) oraz inne wartości, które wysyła B.
const SETTINGS_A = {
  threshold1: "3",
  threshold2: "7",
  threshold3: "14",
  threshold4: "30",
  annualRate: "10,00",
  compensation1: "111,00",
  compensation2: "222,00",
  compensation3: "333,00",
};
const SETTINGS_B = { ...SETTINGS_A, threshold1: "5", annualRate: "12,00" };
const PROFILE_A = {
  companyName: "Firma A",
  nip: "5260250995",
  address: "ul. Testowa 1",
  bankAccount: "61 1090 1014 0000 0712 1981 2874",
};
const PROFILE_B = { companyName: "Firma B", nip: "", address: "", bankAccount: "" };
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

/** Jedyny wiersz tabeli widoczny dla klienta (tabele „jeden wiersz na użytkownika”); `null`, gdy go brak. */
async function ownRow(client: SupabaseClient, table: string) {
  const result = await client.from(table).select("*").maybeSingle();
  if (result.error) throw new Error(`ownRow(${table}): ${result.error.message}`);
  return result.data as Row | null;
}

describe("user isolation through the API", () => {
  let users: Record<"a" | "b" | "c", TestUser>;
  let a: TestUser;
  let b: TestUser;
  let c: TestUser;
  let clientAId: string;

  beforeAll(async () => {
    users = await createTestUsers(["a", "b", "c"]);
    ({ a, b, c } = users);
    clientAId = String((await insertClient(a.client)).id);
    expect((await callRoute(saveSettings, { as: a, method: "PUT", body: SETTINGS_A })).status).toBe(201);
    expect((await callRoute(saveSenderProfile, { as: a, method: "PUT", body: PROFILE_A })).status).toBe(200);
  });

  afterAll(async () => {
    await deleteTestUsers(users);
  });

  const invoiceOfA = (state: InvoiceState) => insertInvoice(a.client, clientAId, state);

  /** Ciało edycji faktury z fixtures (kwota 1 000,00 zł); `changes` nadpisuje pola. */
  const editBody = (row: Row, changes: Record<string, unknown> = {}) => ({
    clientId: row.client_id,
    number: row.number,
    amount: "1 000,00",
    dueDate: row.due_date,
    ...changes,
  });

  const clientBody = (overrides: Record<string, unknown> = {}) => ({
    name: "Firma wysłana przez B",
    nip: "",
    chargeCompensation: true,
    ...overrides,
  });

  describe("endpoints with an [id]", () => {
    // Zasób A jest w stanie, w którym ta sama akcja wykonana przez A by się udała — 404 wynika więc z własności.
    interface Case {
      title: string;
      handler: Handler;
      method: string;
      table: "invoices" | "clients";
      make: () => Promise<{ row: Row; body?: unknown }>;
    }
    const invoiceCase = (
      title: string,
      handler: Handler,
      method: string,
      state: InvoiceState,
      body?: (row: Row) => unknown,
    ): Case => ({
      title,
      handler,
      method,
      table: "invoices",
      make: async () => {
        const row = await invoiceOfA(state);
        return { row, body: body?.(row) };
      },
    });

    const cases: Case[] = [
      invoiceCase("PUT /api/invoices/:id", editInvoice, "PUT", "open-current", (row) =>
        editBody(row, { number: `${String(row.number)}-B` }),
      ),
      invoiceCase("PUT .../payment", putPayment, "PUT", "open-overdue", () => ({ paidOn: DATES.paidOn })),
      invoiceCase("DELETE .../payment", deletePayment, "DELETE", "paid"),
      invoiceCase("PUT .../cancellation", cancel, "PUT", "open-overdue"),
      invoiceCase("DELETE .../cancellation", restore, "DELETE", "cancelled"),
      invoiceCase("PUT .../pause", pause, "PUT", "open-overdue"),
      invoiceCase("DELETE .../pause", resume, "DELETE", "paused"),
      {
        title: "PUT /api/clients/:id",
        handler: editClient,
        method: "PUT",
        table: "clients",
        make: async () => ({ row: await insertClient(a.client), body: clientBody() }),
      },
      {
        title: "PUT .../deactivation",
        handler: deactivateClient,
        method: "PUT",
        table: "clients",
        make: async () => ({ row: await insertClient(a.client) }),
      },
      {
        title: "DELETE .../deactivation",
        handler: restoreClient,
        method: "DELETE",
        table: "clients",
        make: async () => ({ row: await insertClient(a.client, { deactivated_on: "2024-02-01" }) }),
      },
    ];

    it.each(cases)("$title: user B gets 404 and A's row stays the same", async (testCase) => {
      const { row, body } = await testCase.make();
      const id = String(row.id);
      const before = await readRow(a.client, testCase.table, id);

      const res = await callRoute(testCase.handler, { as: b, method: testCase.method, params: { id }, body });

      expect(res.status).toBe(404);
      expect(res.body?.error).toBe("not_found");
      expect(await readRow(a.client, testCase.table, id)).toEqual(before);
      expect(await readRow(b.client, testCase.table, id)).toBeNull();
    });
  });

  describe("a foreign client", () => {
    it("rejects creating an invoice for A's client with 404 client_not_found", async () => {
      const aBefore = await countRows(a.client, "invoices");
      const bBefore = await countRows(b.client, "invoices");

      const res = await callRoute(createInvoice, {
        as: b,
        method: "POST",
        body: { clientId: clientAId, number: "FV/B/1", amount: "1 000,00", dueDate: DATES.current },
      });

      expect(res.status).toBe(404);
      expect(res.body?.error).toBe("client_not_found");
      expect(await countRows(a.client, "invoices")).toBe(aBefore);
      expect(await countRows(b.client, "invoices")).toBe(bBefore);
    });

    it("rejects moving B's own invoice to A's client with 404 client_not_found", async () => {
      const clientBId = String((await insertClient(b.client)).id);
      // Stan open-current, bo po terminie zmiana klienta dałaby 409 locked.
      const own = await insertInvoice(b.client, clientBId, "open-current");
      const before = await readRow(b.client, "invoices", String(own.id));

      const res = await callRoute(editInvoice, {
        as: b,
        method: "PUT",
        params: { id: String(own.id) },
        body: editBody(own, { clientId: clientAId }),
      });

      expect(res.status).toBe(404);
      expect(res.body?.error).toBe("client_not_found");
      expect(await readRow(b.client, "invoices", String(own.id))).toEqual(before);
    });

    it("answers 404 client_not_found, not 409 client_inactive, for A's deleted client", async () => {
      const deleted = await insertClient(a.client, { deactivated_on: "2024-02-01" });
      const aBefore = await countRows(a.client, "invoices");

      const res = await callRoute(createInvoice, {
        as: b,
        method: "POST",
        body: { clientId: String(deleted.id), number: "FV/B/2", amount: "1 000,00", dueDate: DATES.current },
      });

      expect(res.status).toBe(404);
      expect(res.body?.error).toBe("client_not_found");
      expect(await countRows(a.client, "invoices")).toBe(aBefore);
    });
  });

  describe("writes without an id", () => {
    it("saving B's settings and sender profile does not touch A's rows", async () => {
      const settingsBefore = await ownRow(a.client, "user_settings");
      const profileBefore = await ownRow(a.client, "sender_profiles");
      expect(settingsBefore).not.toBeNull();
      expect(profileBefore).not.toBeNull();

      const settingsRes = await callRoute(saveSettings, { as: b, method: "PUT", body: SETTINGS_B });
      const profileRes = await callRoute(saveSenderProfile, { as: b, method: "PUT", body: PROFILE_B });

      expect(settingsRes.status).toBe(200);
      expect(profileRes.status).toBe(200);
      expect(await ownRow(a.client, "user_settings")).toEqual(settingsBefore);
      expect(await ownRow(a.client, "sender_profiles")).toEqual(profileBefore);
      // B ma własne wiersze z własnymi wartościami.
      expect((await ownRow(b.client, "user_settings"))?.threshold_1).toBe(5);
      expect((await ownRow(b.client, "sender_profiles"))?.company_name).toBe("Firma B");
    });
  });

  describe("reads as a user without data", () => {
    beforeAll(async () => {
      // A ma dane w każdej kategorii, więc pusty wynik C wynika z izolacji.
      await invoiceOfA("open-overdue");
      await invoiceOfA("paused");
      await invoiceOfA("paid");
      await invoiceOfA("cancelled");
      await insertClient(a.client, { deactivated_on: "2024-02-01" });
    });

    it("sees no clients or invoices of A", async () => {
      expect(await listClients(c.client)).toEqual([]);
      expect(await listActiveClients(c.client)).toEqual([]);
      expect(await listOpenInvoices(c.client)).toEqual([]);
      expect(await listPaidInvoices(c.client)).toEqual([]);
      expect(await listCancelledInvoices(c.client)).toEqual([]);
    });

    it("gets the default settings instead of A's", async () => {
      expect(await getSettings(c.client)).toEqual(DEFAULT_ESCALATION_SETTINGS);
      expect(await getSettings(a.client)).not.toEqual(DEFAULT_ESCALATION_SETTINGS);
    });

    it("gets an empty sender profile instead of A's", async () => {
      expect(await getSenderProfile(c.client)).toEqual(EMPTY_SENDER_PROFILE);
      expect((await getSenderProfile(a.client)).companyName).toBe(PROFILE_A.companyName);
    });
  });

  describe("requests without a session", () => {
    it("rejects every mutating route with 401 and leaves A's data untouched", async () => {
      const invoice = await invoiceOfA("paused");
      const client = await insertClient(a.client);
      const invoiceId = String(invoice.id);
      const clientId = String(client.id);
      const snapshot = async () => ({
        invoice: await readRow(a.client, "invoices", invoiceId),
        client: await readRow(a.client, "clients", clientId),
        settings: await ownRow(a.client, "user_settings"),
        profile: await ownRow(a.client, "sender_profiles"),
        invoices: await countRows(a.client, "invoices"),
        clients: await countRows(a.client, "clients"),
      });
      const before = await snapshot();

      const routes: { handler: Handler; method: string; params?: Record<string, string>; body?: unknown }[] = [
        {
          handler: createInvoice,
          method: "POST",
          body: { clientId, number: "FV/401", amount: "1 000,00", dueDate: DATES.current },
        },
        { handler: editInvoice, method: "PUT", params: { id: invoiceId }, body: editBody(invoice) },
        { handler: putPayment, method: "PUT", params: { id: invoiceId }, body: { paidOn: DATES.paidOn } },
        { handler: deletePayment, method: "DELETE", params: { id: invoiceId } },
        { handler: cancel, method: "PUT", params: { id: invoiceId } },
        { handler: restore, method: "DELETE", params: { id: invoiceId } },
        { handler: pause, method: "PUT", params: { id: invoiceId } },
        { handler: resume, method: "DELETE", params: { id: invoiceId } },
        { handler: createClientRoute, method: "POST", body: clientBody() },
        { handler: editClient, method: "PUT", params: { id: clientId }, body: clientBody() },
        { handler: deactivateClient, method: "PUT", params: { id: clientId } },
        { handler: restoreClient, method: "DELETE", params: { id: clientId } },
        { handler: saveSettings, method: "PUT", body: SETTINGS_B },
        { handler: saveSenderProfile, method: "PUT", body: PROFILE_B },
      ];

      for (const { handler, method, params, body } of routes) {
        const res = await callRoute(handler, { method, params: params ?? { id: MISSING_ID }, body });
        expect(res.status, `${method} ${handler.name}`).toBe(401);
        expect(res.body?.error).toBe("unauthorized");
      }
      expect(await snapshot()).toEqual(before);
    });
  });
});
