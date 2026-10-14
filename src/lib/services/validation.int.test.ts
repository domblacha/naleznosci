import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createClientRoute } from "@/pages/api/clients/index";
import { PUT as editClient } from "@/pages/api/clients/[id]";
import { POST as createInvoice } from "@/pages/api/invoices/index";
import { PUT as editInvoice } from "@/pages/api/invoices/[id]";
import { PUT as putPayment } from "@/pages/api/invoices/[id]/payment";
import { PUT as saveSettings } from "@/pages/api/settings";
import { PUT as saveSenderProfile } from "@/pages/api/sender-profile";
import {
  callRoute,
  countRows,
  createTestUsers,
  DATES,
  deleteTestUsers,
  insertClient,
  insertInvoice,
  readRow,
  type Row,
  type TestUser,
} from "@/test/integration/harness";

const VALID_SETTINGS = {
  threshold1: "3",
  threshold2: "7",
  threshold3: "14",
  threshold4: "30",
  annualRate: "10,00",
  compensation1: "111,00",
  compensation2: "222,00",
  compensation3: "333,00",
};
const VALID_PROFILE = {
  companyName: "Firma A",
  nip: "5260250995",
  address: "ul. Testowa 1",
  bankAccount: "61 1090 1014 0000 0712 1981 2874",
};

/** Jedyny wiersz tabeli widoczny dla klienta (tabele „jeden wiersz na użytkownika”); `null`, gdy go brak. */
async function ownRow(client: SupabaseClient, table: string) {
  const result = await client.from(table).select("*").maybeSingle();
  if (result.error) throw new Error(`ownRow(${table}): ${result.error.message}`);
  return result.data as Row | null;
}

describe("server-side validation through the API", () => {
  let users: Record<"a", TestUser>;
  let a: TestUser;
  let clientId: string;

  beforeAll(async () => {
    users = await createTestUsers(["a"]);
    a = users.a;
    clientId = String((await insertClient(a.client)).id);
    // Własne ustawienia i profil, żeby „stan bez zmian” dotyczył istniejących wierszy.
    expect((await callRoute(saveSettings, { as: a, method: "PUT", body: VALID_SETTINGS })).status).toBe(200);
    expect((await callRoute(saveSenderProfile, { as: a, method: "PUT", body: VALID_PROFILE })).status).toBe(200);
  });

  afterAll(async () => {
    await deleteTestUsers(users);
  });

  it("POST /api/clients: NIP with a bad checksum -> 400 and no new client", async () => {
    const before = await countRows(a.client, "clients");

    const res = await callRoute(createClientRoute, {
      as: a,
      method: "POST",
      body: { name: "Firma z błędnym NIP", nip: "1234563219", chargeCompensation: true },
    });

    expect(res.status).toBe(400);
    expect(res.body?.error).toBe("invalid_input");
    expect(res.body?.fieldErrors).toHaveProperty("nip");
    expect(await countRows(a.client, "clients")).toBe(before);
  });

  it("PUT /api/clients/:id: empty name -> 400 and the row stays the same", async () => {
    const row = await insertClient(a.client);
    const id = String(row.id);
    const before = await readRow(a.client, "clients", id);

    const res = await callRoute(editClient, {
      as: a,
      method: "PUT",
      params: { id },
      body: { name: "", nip: "", chargeCompensation: true },
    });

    expect(res.status).toBe(400);
    expect(res.body?.error).toBe("invalid_input");
    expect(res.body?.fieldErrors).toHaveProperty("name");
    expect(await readRow(a.client, "clients", id)).toEqual(before);
  });

  it("POST /api/invoices: amount 0,00 -> 400 and no new invoice", async () => {
    const before = await countRows(a.client, "invoices");

    const res = await callRoute(createInvoice, {
      as: a,
      method: "POST",
      body: { clientId, number: "FV/VAL/1", amount: "0,00", dueDate: DATES.current },
    });

    expect(res.status).toBe(400);
    expect(res.body?.error).toBe("invalid_input");
    expect(res.body?.fieldErrors).toHaveProperty("amount");
    expect(await countRows(a.client, "invoices")).toBe(before);
  });

  it("PUT /api/invoices/:id: negative amount -> 400 and the row stays the same", async () => {
    const row = await insertInvoice(a.client, clientId, "open-current");
    const id = String(row.id);
    const before = await readRow(a.client, "invoices", id);

    const res = await callRoute(editInvoice, {
      as: a,
      method: "PUT",
      params: { id },
      body: { clientId, number: row.number, amount: "-5,00", dueDate: row.due_date },
    });

    expect(res.status).toBe(400);
    expect(res.body?.error).toBe("invalid_input");
    expect(res.body?.fieldErrors).toHaveProperty("amount");
    expect(await readRow(a.client, "invoices", id)).toEqual(before);
  });

  it("PUT /api/invoices/:id/payment: paidOn in the future -> 400 and the row stays the same", async () => {
    const row = await insertInvoice(a.client, clientId, "open-overdue");
    const id = String(row.id);
    const before = await readRow(a.client, "invoices", id);

    const res = await callRoute(putPayment, { as: a, method: "PUT", params: { id }, body: { paidOn: "2099-01-01" } });

    expect(res.status).toBe(400);
    expect(res.body?.error).toBe("invalid_input");
    expect(res.body?.fieldErrors).toHaveProperty("paidOn");
    expect(await readRow(a.client, "invoices", id)).toEqual(before);
  });

  describe("PUT /api/settings", () => {
    it("rejects non-monotonic thresholds with 400 and keeps the saved row", async () => {
      const before = await ownRow(a.client, "user_settings");
      expect(before).not.toBeNull();

      const res = await callRoute(saveSettings, {
        as: a,
        method: "PUT",
        body: { ...VALID_SETTINGS, threshold1: "10", threshold2: "5" },
      });

      expect(res.status).toBe(400);
      expect(res.body?.error).toBe("invalid_input");
      expect(res.body?.fieldErrors).toHaveProperty("threshold2");
      expect(await ownRow(a.client, "user_settings")).toEqual(before);
    });

    it("rejects the rate sent as a JSON number instead of text with 400 and keeps the saved row", async () => {
      const before = await ownRow(a.client, "user_settings");

      const res = await callRoute(saveSettings, { as: a, method: "PUT", body: { ...VALID_SETTINGS, annualRate: 10 } });

      expect(res.status).toBe(400);
      expect(res.body?.error).toBe("invalid_input");
      expect(res.body?.fieldErrors).toHaveProperty("annualRate");
      expect(await ownRow(a.client, "user_settings")).toEqual(before);
    });
  });

  it("PUT /api/sender-profile: IBAN with a bad checksum -> 400 and the row stays the same", async () => {
    const before = await ownRow(a.client, "sender_profiles");
    expect(before).not.toBeNull();

    const res = await callRoute(saveSenderProfile, {
      as: a,
      method: "PUT",
      body: { ...VALID_PROFILE, bankAccount: "61 1090 1014 0000 0712 1981 2875" },
    });

    expect(res.status).toBe(400);
    expect(res.body?.error).toBe("invalid_input");
    expect(res.body?.fieldErrors).toHaveProperty("bankAccount");
    expect(await ownRow(a.client, "sender_profiles")).toEqual(before);
  });

  it("a non-JSON body -> 400 invalid_input with empty fieldErrors", async () => {
    const before = await countRows(a.client, "clients");

    const res = await callRoute(createClientRoute, { as: a, method: "POST", rawBody: "to nie jest JSON" });

    expect(res.status).toBe(400);
    expect(res.body?.error).toBe("invalid_input");
    expect(res.body?.fieldErrors).toEqual({});
    expect(await countRows(a.client, "clients")).toBe(before);
  });
});
