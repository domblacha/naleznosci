import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createInvoice } from "@/pages/api/invoices/index";
import { PUT as editInvoice } from "@/pages/api/invoices/[id]";
import { PUT as putPayment, DELETE as deletePayment } from "@/pages/api/invoices/[id]/payment";
import { PUT as cancel, DELETE as restore } from "@/pages/api/invoices/[id]/cancellation";
import { PUT as pause, DELETE as resume } from "@/pages/api/invoices/[id]/pause";
import { PUT as saveSettings } from "@/pages/api/settings";
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

// Ustawienia testu: stopa 10,00% i kwoty rekompensat 111/222/333 zł (wartości wpisane tekstem, jak w formularzu).
const SETTINGS_BODY = {
  threshold1: "3",
  threshold2: "7",
  threshold3: "14",
  threshold4: "30",
  annualRate: "10,00",
  compensation1: "111,00",
  compensation2: "222,00",
  compensation3: "333,00",
};
const SNAPSHOT_RATE_BP = 1000;
// Faktura fixtures ma 1 000,00 zł, czyli mieści się w pierwszym progu.
const SNAPSHOT_COMPENSATION_GROSZE = 11_100;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

describe("invoice state transitions through the API", () => {
  let users: Record<"a", TestUser>;
  let a: TestUser;
  let clientId: string;
  let otherClientId: string;
  let noCompensationClientId: string;

  beforeAll(async () => {
    users = await createTestUsers(["a"]);
    a = users.a;
    clientId = String((await insertClient(a.client)).id);
    otherClientId = String((await insertClient(a.client)).id);
    noCompensationClientId = String((await insertClient(a.client, { charge_compensation: false })).id);
    const res = await callRoute(saveSettings, { as: a, method: "PUT", body: SETTINGS_BODY });
    expect(res.status).toBe(200);
  });

  afterAll(async () => {
    await deleteTestUsers(users);
  });

  const invoiceIn = (state: InvoiceState, overrides: Record<string, unknown> = {}) =>
    insertInvoice(a.client, clientId, state, overrides);

  /** Wywołuje trasę na fakturze `id` jako użytkownik `a`. */
  const call = (handler: Handler, method: string, id: string, body?: unknown) =>
    callRoute(handler, { as: a, method, params: { id }, body });

  /** Ciało edycji: 1 000,00 zł to kwota fixtures; `changes` nadpisuje pola formularza. */
  const editBody = (row: Row, changes: Record<string, unknown> = {}) => ({
    clientId: row.client_id,
    number: row.number,
    amount: "1 000,00",
    dueDate: row.due_date,
    ...changes,
  });

  describe("disallowed transitions leave the row untouched", () => {
    interface Case {
      title: string;
      state: InvoiceState;
      handler: Handler;
      method: string;
      body?: (row: Row) => unknown;
      status: number;
      error: string;
    }
    const notFound = { status: 404, error: "not_found" };

    const cases: Case[] = [
      // edycja: zapłacona i anulowana nie są edytowalne
      ...(["paid", "cancelled"] as const).flatMap((state) => [
        {
          title: `edit amount of a ${state} invoice`,
          state,
          handler: editInvoice,
          method: "PUT",
          body: (row: Row) => editBody(row, { amount: "1 500,00" }),
          ...notFound,
        },
        {
          title: `edit due date of a ${state} invoice`,
          state,
          handler: editInvoice,
          method: "PUT",
          body: (row: Row) => editBody(row, { dueDate: "2099-01-01" }),
          ...notFound,
        },
        {
          title: `edit client of a ${state} invoice`,
          state,
          handler: editInvoice,
          method: "PUT",
          body: (row: Row) => editBody(row, { clientId: otherClientId }),
          ...notFound,
        },
        {
          title: `edit only the number of a ${state} invoice`,
          state,
          handler: editInvoice,
          method: "PUT",
          body: (row: Row) => editBody(row, { number: `${String(row.number)}-X` }),
          ...notFound,
        },
      ]),
      ...(["amount", "dueDate"] as const).map((field) => ({
        title: `edit ${field} of an overdue, not paused invoice`,
        state: "open-overdue" as const,
        handler: editInvoice,
        method: "PUT",
        body: (row: Row) => editBody(row, { [field]: field === "amount" ? "1 500,00" : "2099-01-01" }),
        status: 409,
        error: "locked",
      })),
      // zapłata
      {
        title: "pay a cancelled invoice",
        state: "cancelled",
        handler: putPayment,
        method: "PUT",
        body: () => ({ paidOn: DATES.paidOn }),
        ...notFound,
      },
      // cofnięcie wpłaty: tylko zapłacona
      ...(["open-current", "open-overdue", "paused", "cancelled"] as const).map((state) => ({
        title: `reopen payment of a ${state} invoice`,
        state,
        handler: deletePayment,
        method: "DELETE",
        ...notFound,
      })),
      // anulowanie: tylko otwarta
      ...(["paid", "cancelled"] as const).map((state) => ({
        title: `cancel a ${state} invoice`,
        state,
        handler: cancel,
        method: "PUT",
        ...notFound,
      })),
      // przywrócenie: tylko anulowana
      ...(["open-current", "paused", "paid"] as const).map((state) => ({
        title: `restore a ${state} invoice`,
        state,
        handler: restore,
        method: "DELETE",
        ...notFound,
      })),
      // wstrzymanie: tylko otwarta niewstrzymana
      ...(["paused", "paid", "cancelled"] as const).map((state) => ({
        title: `pause a ${state} invoice`,
        state,
        handler: pause,
        method: "PUT",
        ...notFound,
      })),
      // wznowienie: tylko wstrzymana
      ...(["open-current", "paid", "cancelled"] as const).map((state) => ({
        title: `resume a ${state} invoice`,
        state,
        handler: resume,
        method: "DELETE",
        ...notFound,
      })),
    ];

    it.each(cases)("$title -> $status $error", async ({ state, handler, method, body, status, error }) => {
      const before = await invoiceIn(state);
      const res = await call(handler, method, String(before.id), body?.(before));

      expect(res.status).toBe(status);
      expect(res.body?.error).toBe(error);
      expect(await readRow(a.client, "invoices", String(before.id))).toEqual(before);
    });
  });

  describe("allowed transitions", () => {
    it("edits only the number of an overdue invoice", async () => {
      const before = await invoiceIn("open-overdue");
      const res = await call(editInvoice, "PUT", String(before.id), editBody(before, { number: "FV/ZMIENIONY/1" }));

      expect(res.status).toBe(200);
      expect(await readRow(a.client, "invoices", String(before.id))).toEqual({ ...before, number: "FV/ZMIENIONY/1" });
    });

    it("edits the amount of a paused overdue invoice", async () => {
      const before = await invoiceIn("paused");
      const res = await call(editInvoice, "PUT", String(before.id), editBody(before, { amount: "1 500,00" }));

      expect(res.status).toBe(200);
      expect(await readRow(a.client, "invoices", String(before.id))).toEqual({ ...before, amount_grosze: 150_000 });
    });

    it("edits client, amount and due date of a current invoice", async () => {
      const before = await invoiceIn("open-current");
      const res = await call(
        editInvoice,
        "PUT",
        String(before.id),
        editBody(before, { clientId: otherClientId, amount: "2 000,50", dueDate: "2098-06-30" }),
      );

      expect(res.status).toBe(200);
      expect(await readRow(a.client, "invoices", String(before.id))).toEqual({
        ...before,
        client_id: otherClientId,
        amount_grosze: 200_050,
        due_date: "2098-06-30",
      });
    });

    it.each<InvoiceState>(["open-current", "open-overdue", "paused"])(
      "pays a %s invoice and freezes the settings of that day",
      async (state) => {
        const before = await invoiceIn(state);
        const res = await call(putPayment, "PUT", String(before.id), { paidOn: DATES.paidOn });

        expect(res.status).toBe(200);
        expect(await readRow(a.client, "invoices", String(before.id))).toEqual({
          ...before,
          paid_on: DATES.paidOn,
          paid_rate_bp: SNAPSHOT_RATE_BP,
          paid_compensation_grosze: SNAPSHOT_COMPENSATION_GROSZE,
          paused_on: null,
        });
      },
    );

    it("freezes zero compensation for a client that charges none", async () => {
      const before = await insertInvoice(a.client, noCompensationClientId, "open-overdue");
      const res = await call(putPayment, "PUT", String(before.id), { paidOn: DATES.paidOn });

      expect(res.status).toBe(200);
      const row = await readRow(a.client, "invoices", String(before.id));
      expect(row?.paid_rate_bp).toBe(SNAPSHOT_RATE_BP);
      expect(row?.paid_compensation_grosze).toBe(0);
    });

    it("changes the payment date of a paid invoice after the settings changed and keeps the snapshot", async () => {
      const before = await invoiceIn("open-overdue");
      expect((await call(putPayment, "PUT", String(before.id), { paidOn: DATES.paidOn })).status).toBe(200);

      const changed = await callRoute(saveSettings, {
        as: a,
        method: "PUT",
        body: { ...SETTINGS_BODY, annualRate: "20,00", compensation1: "999,00" },
      });
      expect(changed.status).toBe(200);
      try {
        const res = await call(putPayment, "PUT", String(before.id), { paidOn: "2025-02-20" });

        expect(res.status).toBe(200);
        expect(await readRow(a.client, "invoices", String(before.id))).toEqual({
          ...before,
          paid_on: "2025-02-20",
          paid_rate_bp: SNAPSHOT_RATE_BP,
          paid_compensation_grosze: SNAPSHOT_COMPENSATION_GROSZE,
        });
      } finally {
        const restored = await callRoute(saveSettings, { as: a, method: "PUT", body: SETTINGS_BODY });
        expect(restored.status).toBe(200);
      }
    });

    it("reopens a paid invoice and clears the payment and its snapshot", async () => {
      const before = await invoiceIn("paid");
      const res = await call(deletePayment, "DELETE", String(before.id));

      expect(res.status).toBe(200);
      expect(await readRow(a.client, "invoices", String(before.id))).toEqual({
        ...before,
        paid_on: null,
        paid_rate_bp: null,
        paid_compensation_grosze: null,
        paused_on: null,
      });
    });

    it.each<InvoiceState>(["open-current", "open-overdue", "paused"])("cancels a %s invoice", async (state) => {
      const before = await invoiceIn(state);
      const res = await call(cancel, "PUT", String(before.id));

      expect(res.status).toBe(200);
      const row = await readRow(a.client, "invoices", String(before.id));
      expect(row?.cancelled_on).toMatch(DATE_PATTERN);
      expect(row).toEqual({ ...before, cancelled_on: row?.cancelled_on, paused_on: null });
    });

    it("restores a cancelled invoice", async () => {
      const before = await invoiceIn("cancelled");
      const res = await call(restore, "DELETE", String(before.id));

      expect(res.status).toBe(200);
      expect(await readRow(a.client, "invoices", String(before.id))).toEqual({ ...before, cancelled_on: null });
    });

    it("pauses an open invoice and resumes it", async () => {
      const before = await invoiceIn("open-overdue");

      const paused = await call(pause, "PUT", String(before.id));
      expect(paused.status).toBe(200);
      const pausedRow = await readRow(a.client, "invoices", String(before.id));
      expect(pausedRow?.paused_on).toMatch(DATE_PATTERN);
      expect(pausedRow).toEqual({ ...before, paused_on: pausedRow?.paused_on });

      const resumed = await call(resume, "DELETE", String(before.id));
      expect(resumed.status).toBe(200);
      expect(await readRow(a.client, "invoices", String(before.id))).toEqual(before);
    });
  });

  describe("rules enforced by the database", () => {
    const createBody = (number: string) => ({ clientId, number, amount: "1 000,00", dueDate: DATES.current });

    it("rejects creating an invoice with a taken number in other letter case", async () => {
      const existing = await invoiceIn("open-current");
      const before = await countRows(a.client, "invoices");

      const res = await callRoute(createInvoice, {
        as: a,
        method: "POST",
        body: createBody(String(existing.number).toLowerCase()),
      });

      expect(res.status).toBe(409);
      expect(res.body?.error).toBe("duplicate_number");
      expect(await countRows(a.client, "invoices")).toBe(before);
    });

    it("allows reusing the number of a cancelled invoice", async () => {
      const cancelled = await invoiceIn("cancelled");
      const res = await callRoute(createInvoice, {
        as: a,
        method: "POST",
        body: createBody(String(cancelled.number)),
      });

      expect(res.status).toBe(201);
      expect(res.body?.invoice?.number).toBe(cancelled.number);
    });

    it("rejects restoring a cancelled invoice whose number a new invoice took", async () => {
      const cancelled = await invoiceIn("cancelled");
      const created = await callRoute(createInvoice, {
        as: a,
        method: "POST",
        body: createBody(String(cancelled.number)),
      });
      expect(created.status).toBe(201);

      const res = await call(restore, "DELETE", String(cancelled.id));

      expect(res.status).toBe(409);
      expect(res.body?.error).toBe("duplicate_number");
      expect(await readRow(a.client, "invoices", String(cancelled.id))).toEqual(cancelled);
    });

    it("rejects creating an invoice for a deleted client", async () => {
      const deleted = await insertClient(a.client, { deactivated_on: "2024-02-01" });
      const before = await countRows(a.client, "invoices");

      const res = await callRoute(createInvoice, {
        as: a,
        method: "POST",
        body: { ...createBody("FV/DLA-USUNIETEGO"), clientId: deleted.id },
      });

      expect(res.status).toBe(409);
      expect(res.body?.error).toBe("client_inactive");
      expect(await countRows(a.client, "invoices")).toBe(before);
    });

    it.each([
      { title: "reopening a payment", state: "paid", handler: deletePayment, method: "DELETE" },
      { title: "restoring a cancelled invoice", state: "cancelled", handler: restore, method: "DELETE" },
    ] as const)("rejects $title when the client is already deleted", async ({ state, handler, method }) => {
      const client = await insertClient(a.client);
      const before = await insertInvoice(a.client, String(client.id), state);
      // Zapłacone i anulowane faktury nie blokują usunięcia klienta.
      const deleted = await a.client.from("clients").update({ deactivated_on: "2024-03-01" }).eq("id", client.id);
      expect(deleted.error).toBeNull();

      const res = await call(handler, method, String(before.id));

      expect(res.status).toBe(409);
      expect(res.body?.error).toBe("client_inactive");
      expect(await readRow(a.client, "invoices", String(before.id))).toEqual(before);
    });
  });

  describe("invalid id in the path", () => {
    it.each([
      { title: "PUT /invoices/:id", handler: editInvoice, method: "PUT" },
      { title: "PUT /invoices/:id/payment", handler: putPayment, method: "PUT" },
      { title: "DELETE /invoices/:id/payment", handler: deletePayment, method: "DELETE" },
      { title: "PUT /invoices/:id/cancellation", handler: cancel, method: "PUT" },
      { title: "DELETE /invoices/:id/cancellation", handler: restore, method: "DELETE" },
      { title: "PUT /invoices/:id/pause", handler: pause, method: "PUT" },
      { title: "DELETE /invoices/:id/pause", handler: resume, method: "DELETE" },
    ] as const)("$title returns 404 for an id that is not a UUID", async ({ handler, method }) => {
      const res = await call(handler, method, "nie-uuid");

      expect(res.status).toBe(404);
      expect(res.body?.error).toBe("not_found");
    });
  });
});
