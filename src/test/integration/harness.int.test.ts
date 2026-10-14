import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/pages/api/clients/index";
import { callRoute, countRows, createTestUsers, deleteTestUsers, readRow, type TestUser } from "./harness";

describe("integration harness", () => {
  let users: Record<"a", TestUser>;

  beforeAll(async () => {
    users = await createTestUsers(["a"]);
  });

  afterAll(async () => {
    await deleteTestUsers(users);
  });

  it("creates a client as the signed-in user through the real handler and RLS", async () => {
    const { a } = users;
    const res = await callRoute(POST, {
      as: a,
      method: "POST",
      body: { name: "Harness Sp. z o.o.", nip: "", chargeCompensation: true },
    });

    expect(res.status).toBe(201);
    const id = String(res.body?.client?.id);
    const row = await readRow(a.client, "clients", id);
    expect(row).not.toBeNull();
    expect(row?.user_id).toBe(a.user.id);
  });

  it("rejects the same call without a user and creates no row", async () => {
    const { a } = users;
    const before = await countRows(a.client, "clients");

    const res = await callRoute(POST, {
      method: "POST",
      body: { name: "Bez sesji", nip: "", chargeCompensation: true },
    });

    expect(res.status).toBe(401);
    expect(res.body?.error).toBe("unauthorized");
    expect(await countRows(a.client, "clients")).toBe(before);
  });
});
