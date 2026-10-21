import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestUsers,
  DATES,
  deleteTestUsers,
  insertClient,
  insertInvoice,
  type Row,
  type TestUser,
} from "@/test/integration/harness";

// Reguły egzekwowane przez bazę (trigger invoices_guard_locked_fields), więc nie da się ich obejść zapisem
// wprost przez PostgREST. Odrzucenia asertują dokładny error.message: to kontrakt z src/lib/services/invoices.ts.
// Kontrole dowodzą, że legalne ścieżki aplikacji dalej przechodzą. Fixture'y powstają w beforeAll,
// każdy test działa na własnym wierszu.
describe("rules enforced by the database", () => {
  let users: Record<"a", TestUser>;
  let a: TestUser;
  let clientId: string;
  let otherClientId: string;
  let paid: Row;
  let paidForDueDate: Row;
  let paidForClient: Row;
  let paidForDateChange: Row;
  let paidForReopen: Row;
  let cancelled: Row;
  let overdue: Row;
  let overdueForClient: Row;
  let overdueForAmount: Row;
  let overdueForNumber: Row;
  let pausedForAmount: Row;
  let openForPaidOn: Row;
  let openCurrent: Row;
  let openCurrentForDueDate: Row;
  let openForPaidOnControl: Row;

  beforeAll(async () => {
    users = await createTestUsers(["a"]);
    a = users.a;
    clientId = String((await insertClient(a.client)).id);
    otherClientId = String((await insertClient(a.client)).id);
    paid = await insertInvoice(a.client, clientId, "paid");
    paidForDueDate = await insertInvoice(a.client, clientId, "paid");
    paidForClient = await insertInvoice(a.client, clientId, "paid");
    paidForDateChange = await insertInvoice(a.client, clientId, "paid");
    paidForReopen = await insertInvoice(a.client, clientId, "paid");
    cancelled = await insertInvoice(a.client, clientId, "cancelled");
    overdue = await insertInvoice(a.client, clientId, "open-overdue");
    overdueForClient = await insertInvoice(a.client, clientId, "open-overdue");
    overdueForAmount = await insertInvoice(a.client, clientId, "open-overdue");
    overdueForNumber = await insertInvoice(a.client, clientId, "open-overdue");
    pausedForAmount = await insertInvoice(a.client, clientId, "paused");
    openForPaidOn = await insertInvoice(a.client, clientId, "open-overdue");
    openCurrent = await insertInvoice(a.client, clientId, "open-current");
    openCurrentForDueDate = await insertInvoice(a.client, clientId, "open-current");
    openForPaidOnControl = await insertInvoice(a.client, clientId, "open-overdue");
  });

  afterAll(async () => {
    await deleteTestUsers(users);
  });

  const updateInvoice = (row: Row, changes: Record<string, unknown>) =>
    a.client.from("invoices").update(changes).eq("id", String(row.id));

  it("control: changing the amount of an open invoice succeeds", async () => {
    const { error } = await updateInvoice(openCurrent, { amount_grosze: 123_400 });
    expect(error).toBeNull();
  });

  it("rejects changing the amount of a paid invoice", async () => {
    const { error } = await updateInvoice(paid, { amount_grosze: 123_400 });
    expect(error?.message).toBe("invoice_closed");
  });

  it("rejects changing the due date of a paid invoice", async () => {
    const { error } = await updateInvoice(paidForDueDate, { due_date: "2024-03-01" });
    expect(error?.message).toBe("invoice_closed");
  });

  it("rejects changing the client of a paid invoice", async () => {
    const { error } = await updateInvoice(paidForClient, { client_id: otherClientId });
    expect(error?.message).toBe("invoice_closed");
  });

  it("rejects changing the amount of a cancelled invoice", async () => {
    const { error } = await updateInvoice(cancelled, { amount_grosze: 123_400 });
    expect(error?.message).toBe("invoice_closed");
  });

  it("control: changing the due date of a not yet overdue invoice succeeds", async () => {
    const { error } = await updateInvoice(openCurrentForDueDate, { due_date: "2099-12-30" });
    expect(error).toBeNull();
  });

  it("rejects changing the due date of an overdue, not paused invoice", async () => {
    const { error } = await updateInvoice(overdue, { due_date: "2099-01-01" });
    expect(error?.message).toBe("invoice_locked");
  });

  it("rejects changing the client of an overdue, not paused invoice", async () => {
    const { error } = await updateInvoice(overdueForClient, { client_id: otherClientId });
    expect(error?.message).toBe("invoice_locked");
  });

  it("rejects changing the amount of an overdue, not paused invoice", async () => {
    const { error } = await updateInvoice(overdueForAmount, { amount_grosze: 123_400 });
    expect(error?.message).toBe("invoice_locked");
  });

  it("control: changing the amount of a paused overdue invoice succeeds", async () => {
    const { error } = await updateInvoice(pausedForAmount, { amount_grosze: 123_400 });
    expect(error).toBeNull();
  });

  it("control: changing only the number of an overdue invoice succeeds with unchanged locked fields sent", async () => {
    const { error } = await updateInvoice(overdueForNumber, {
      client_id: overdueForNumber.client_id,
      number: `FV/renamed/${randomUUID()}`,
      amount_grosze: overdueForNumber.amount_grosze,
      due_date: overdueForNumber.due_date,
    });
    expect(error).toBeNull();
  });

  it("control: setting a past paid_on with a full snapshot succeeds", async () => {
    const { error } = await updateInvoice(openForPaidOnControl, {
      paid_on: DATES.paidOn,
      paid_rate_bp: 1000,
      paid_compensation_grosze: 4000,
    });
    expect(error).toBeNull();
  });

  it("rejects setting paid_on in the future", async () => {
    const { error } = await updateInvoice(openForPaidOn, {
      paid_on: "2099-01-01",
      paid_rate_bp: 1000,
      paid_compensation_grosze: 4000,
    });
    expect(error?.message).toBe("paid_on_in_future");
  });

  it("rejects inserting an invoice with paid_on in the future", async () => {
    const { error } = await a.client.from("invoices").insert({
      client_id: clientId,
      number: `FV/future/${randomUUID()}`,
      amount_grosze: 100_000,
      due_date: DATES.overdue,
      paid_on: "2099-01-01",
      paid_rate_bp: 1000,
      paid_compensation_grosze: 4000,
    });
    expect(error?.message).toBe("paid_on_in_future");
  });

  it("control: changing the paid_on of a paid invoice to another past date succeeds", async () => {
    const { error } = await updateInvoice(paidForDateChange, { paid_on: "2025-02-20" });
    expect(error).toBeNull();
  });

  it("control: reopening a paid invoice succeeds", async () => {
    const { error } = await updateInvoice(paidForReopen, {
      paid_on: null,
      paid_rate_bp: null,
      paid_compensation_grosze: null,
    });
    expect(error).toBeNull();
  });
});
