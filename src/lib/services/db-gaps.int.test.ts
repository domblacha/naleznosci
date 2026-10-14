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

// Reguły egzekwowane tylko w serwisie są obchodzone przez PostgREST. `it.fails` asertuje pożądane zachowanie
// (baza odrzuca zmianę), więc gdy luka zostanie załatana, test zaczerwieni się — wtedy zdejmij `.fails`.
// Fixture'y powstają poza ciałem `it.fails` (które zalicza każdy wyjątek); ciało ma tylko update i asercję.
describe("database gaps reachable through PostgREST", () => {
  let users: Record<"a", TestUser>;
  let a: TestUser;
  let clientId: string;
  let paid: Row;
  let cancelled: Row;
  let overdue: Row;
  let openForPaidOn: Row;
  let openCurrent: Row;
  let openCurrentForDueDate: Row;
  let openForPaidOnControl: Row;

  beforeAll(async () => {
    users = await createTestUsers(["a"]);
    a = users.a;
    clientId = String((await insertClient(a.client)).id);
    paid = await insertInvoice(a.client, clientId, "paid");
    cancelled = await insertInvoice(a.client, clientId, "cancelled");
    overdue = await insertInvoice(a.client, clientId, "open-overdue");
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

  it.fails("known gap: changing the amount of a paid invoice is rejected by the database", async () => {
    const { error } = await updateInvoice(paid, { amount_grosze: 123_400 });
    expect(error).not.toBeNull();
  });

  it.fails("known gap: changing the amount of a cancelled invoice is rejected by the database", async () => {
    const { error } = await updateInvoice(cancelled, { amount_grosze: 123_400 });
    expect(error).not.toBeNull();
  });

  it("control: changing the due date of a not yet overdue invoice succeeds", async () => {
    const { error } = await updateInvoice(openCurrentForDueDate, { due_date: "2099-12-30" });
    expect(error).toBeNull();
  });

  it.fails(
    "known gap: changing the due date of an overdue, not paused invoice is rejected by the database",
    async () => {
      const { error } = await updateInvoice(overdue, { due_date: "2099-01-01" });
      expect(error).not.toBeNull();
    },
  );

  it("control: setting a past paid_on with a full snapshot succeeds", async () => {
    const { error } = await updateInvoice(openForPaidOnControl, {
      paid_on: DATES.paidOn,
      paid_rate_bp: 1000,
      paid_compensation_grosze: 4000,
    });
    expect(error).toBeNull();
  });

  it.fails("known gap: setting paid_on in the future is rejected by the database", async () => {
    const { error } = await updateInvoice(openForPaidOn, {
      paid_on: "2099-01-01",
      paid_rate_bp: 1000,
      paid_compensation_grosze: 4000,
    });
    expect(error).not.toBeNull();
  });
});
