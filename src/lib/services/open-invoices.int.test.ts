import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listCancelledInvoices, listOpenInvoices, listPaidInvoices } from "@/lib/services/invoices";
import {
  createTestUsers,
  deleteTestUsers,
  insertClient,
  insertInvoice,
  type TestUser,
} from "@/test/integration/harness";

describe("invoice lists", () => {
  let users: Record<"a", TestUser>;
  let ids: { open: string; paused: string; paid: string; cancelled: string };

  beforeAll(async () => {
    users = await createTestUsers(["a"]);
    const { client } = users.a;
    const clientId = String((await insertClient(client)).id);
    ids = {
      open: String((await insertInvoice(client, clientId, "open-overdue")).id),
      paused: String((await insertInvoice(client, clientId, "paused")).id),
      paid: String((await insertInvoice(client, clientId, "paid")).id),
      cancelled: String((await insertInvoice(client, clientId, "cancelled")).id),
    };
  });

  afterAll(async () => {
    await deleteTestUsers(users);
  });

  const idsOf = (invoices: { id: string }[]) => invoices.map((invoice) => invoice.id).sort();

  it("lists only the open and the paused invoice as open", async () => {
    const result = await listOpenInvoices(users.a.client);

    expect(idsOf(result)).toEqual([ids.open, ids.paused].sort());
  });

  it("lists only the paid invoice as paid", async () => {
    const result = await listPaidInvoices(users.a.client);

    expect(idsOf(result)).toEqual([ids.paid]);
  });

  it("lists only the cancelled invoice as cancelled", async () => {
    const result = await listCancelledInvoices(users.a.client);

    expect(idsOf(result)).toEqual([ids.cancelled]);
  });
});
