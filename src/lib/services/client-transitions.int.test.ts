import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createClient } from "@/pages/api/clients/index";
import { PUT as editClient } from "@/pages/api/clients/[id]";
import { PUT as deleteClient, DELETE as restoreClient } from "@/pages/api/clients/[id]/deactivation";
import {
  callRoute,
  countRows,
  createTestUsers,
  deleteTestUsers,
  insertClient,
  insertInvoice,
  readRow,
  type InvoiceState,
  type TestUser,
} from "@/test/integration/harness";

type Handler = Parameters<typeof callRoute>[0];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// NIP-y z poprawną sumą kontrolną (zod je sprawdza); konta testowe są świeże, więc stałe się nie kolidują.
const NIP_ACTIVE = "5260250995";
const NIP_DELETED = "1234563218";
const NIP_FREE = "5252344078";
const NIP_TAKEN = "1111111111";

describe("client state transitions through the API", () => {
  let users: Record<"a", TestUser>;
  let a: TestUser;

  beforeAll(async () => {
    users = await createTestUsers(["a"]);
    a = users.a;
  });

  afterAll(async () => {
    await deleteTestUsers(users);
  });

  const call = (handler: Handler, method: string, id: string, body?: unknown) =>
    callRoute(handler, { as: a, method, params: { id }, body });

  const clientBody = (overrides: Record<string, unknown> = {}) => ({
    name: "Nowa Firma Sp. z o.o.",
    nip: "",
    chargeCompensation: true,
    ...overrides,
  });

  describe("deleting a client", () => {
    it.each<InvoiceState>(["open-current", "open-overdue", "paused"])(
      "is rejected while the client has a %s invoice",
      async (state) => {
        const client = await insertClient(a.client);
        await insertInvoice(a.client, String(client.id), state);

        const res = await call(deleteClient, "PUT", String(client.id));

        expect(res.status).toBe(409);
        expect(res.body?.error).toBe("has_open_invoices");
        expect(await readRow(a.client, "clients", String(client.id))).toEqual(client);
      },
    );

    it("succeeds when the client has only paid and cancelled invoices", async () => {
      const client = await insertClient(a.client);
      await insertInvoice(a.client, String(client.id), "paid");
      await insertInvoice(a.client, String(client.id), "cancelled");

      const res = await call(deleteClient, "PUT", String(client.id));

      expect(res.status).toBe(200);
      const row = await readRow(a.client, "clients", String(client.id));
      expect(row?.deactivated_on).toMatch(DATE_PATTERN);
      expect(row).toEqual({ ...client, deactivated_on: row?.deactivated_on });
    });

    it("returns 404 for an already deleted client", async () => {
      const client = await insertClient(a.client, { deactivated_on: "2024-02-01" });

      const res = await call(deleteClient, "PUT", String(client.id));

      expect(res.status).toBe(404);
      expect(res.body?.error).toBe("not_found");
      expect(await readRow(a.client, "clients", String(client.id))).toEqual(client);
    });
  });

  describe("editing a client", () => {
    it("returns 404 for a deleted client and leaves the row untouched", async () => {
      const client = await insertClient(a.client, { deactivated_on: "2024-02-01" });

      const res = await call(editClient, "PUT", String(client.id), clientBody({ name: "Zmieniona nazwa" }));

      expect(res.status).toBe(404);
      expect(res.body?.error).toBe("not_found");
      expect(await readRow(a.client, "clients", String(client.id))).toEqual(client);
    });

    it("changes the name of an active client", async () => {
      const client = await insertClient(a.client);

      const res = await call(
        editClient,
        "PUT",
        String(client.id),
        clientBody({ name: "Zmieniona nazwa", nip: NIP_FREE }),
      );

      expect(res.status).toBe(200);
      expect(await readRow(a.client, "clients", String(client.id))).toEqual({
        ...client,
        name: "Zmieniona nazwa",
        nip: NIP_FREE,
      });
    });
  });

  describe("restoring a client", () => {
    it("returns 404 for an active client and leaves the row untouched", async () => {
      const client = await insertClient(a.client);

      const res = await call(restoreClient, "DELETE", String(client.id));

      expect(res.status).toBe(404);
      expect(res.body?.error).toBe("not_found");
      expect(await readRow(a.client, "clients", String(client.id))).toEqual(client);
    });

    it("clears the deletion date of a deleted client", async () => {
      const client = await insertClient(a.client, { deactivated_on: "2024-02-01" });

      const res = await call(restoreClient, "DELETE", String(client.id));

      expect(res.status).toBe(200);
      expect(await readRow(a.client, "clients", String(client.id))).toEqual({ ...client, deactivated_on: null });
    });
  });

  describe("duplicates", () => {
    it.each([
      { title: "NIP of an active client", deleted: false, field: "nip", error: "duplicate_nip" },
      { title: "NIP of a deleted client", deleted: true, field: "nip", error: "duplicate_nip_inactive" },
      { title: "name of an active client", deleted: false, field: "name", error: "duplicate_name" },
      { title: "name of a deleted client", deleted: true, field: "name", error: "duplicate_name_inactive" },
    ] as const)("rejects creating a client with the $title", async ({ deleted, field, error }) => {
      const nip = deleted ? NIP_DELETED : NIP_ACTIVE;
      const name = `Duplikat ${deleted ? "usuniętego" : "aktywnego"} ${field}`;
      await insertClient(a.client, {
        name,
        nip: field === "nip" ? nip : null,
        deactivated_on: deleted ? "2024-02-01" : null,
      });
      const before = await countRows(a.client, "clients");

      // Nazwa jest unikalna tylko wśród klientów bez NIP-u, więc wariant nazwy wysyła pusty NIP; wielkość liter nie ma znaczenia.
      const body = field === "nip" ? clientBody({ name: "Inna nazwa", nip }) : clientBody({ name: name.toUpperCase() });
      const res = await callRoute(createClient, { as: a, method: "POST", body });

      expect(res.status).toBe(409);
      expect(res.body?.error).toBe(error);
      expect(await countRows(a.client, "clients")).toBe(before);
    });

    it("rejects renaming a client to the NIP of another active client", async () => {
      const taken = await insertClient(a.client, { nip: NIP_TAKEN });
      const other = await insertClient(a.client);

      const res = await call(editClient, "PUT", String(other.id), clientBody({ nip: String(taken.nip) }));

      expect(res.status).toBe(409);
      expect(res.body?.error).toBe("duplicate_nip");
      expect(await readRow(a.client, "clients", String(other.id))).toEqual(other);
    });
  });
});
