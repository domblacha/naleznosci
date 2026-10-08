import { describe, expect, it } from "vitest";
import { isInvoiceLocked, lockedFieldsChanged } from "@/lib/invoice-lock";
import type { InvoiceInput } from "@/types";

describe("isInvoiceLocked", () => {
  it("nie blokuje w dniu terminu", () => {
    expect(isInvoiceLocked({ dueDate: "2026-10-07", pausedOn: null }, "2026-10-07")).toBe(false);
  });

  it("blokuje od dnia po terminie", () => {
    expect(isInvoiceLocked({ dueDate: "2026-10-07", pausedOn: null }, "2026-10-08")).toBe(true);
  });

  it("nie blokuje przed terminem", () => {
    expect(isInvoiceLocked({ dueDate: "2026-10-07", pausedOn: null }, "2026-10-06")).toBe(false);
  });

  it("nie blokuje wstrzymanej faktury po terminie", () => {
    expect(isInvoiceLocked({ dueDate: "2026-09-01", pausedOn: "2026-10-01" }, "2026-10-08")).toBe(false);
  });

  it("blokuje tę samą fakturę po wznowieniu", () => {
    expect(isInvoiceLocked({ dueDate: "2026-09-01", pausedOn: null }, "2026-10-08")).toBe(true);
  });
});

describe("lockedFieldsChanged", () => {
  const current = { clientId: "c1", amountGrosze: 1000, dueDate: "2026-10-07" };
  const input: InvoiceInput = { clientId: "c1", number: "FV/1", amountGrosze: 1000, dueDate: "2026-10-07" };

  it("zmiana samego numeru nie liczy się", () => {
    expect(lockedFieldsChanged(current, { ...input, number: "FV/2" })).toBe(false);
  });

  it("zmiana klienta, kwoty lub terminu liczy się", () => {
    expect(lockedFieldsChanged(current, { ...input, clientId: "c2" })).toBe(true);
    expect(lockedFieldsChanged(current, { ...input, amountGrosze: 1001 })).toBe(true);
    expect(lockedFieldsChanged(current, { ...input, dueDate: "2026-10-08" })).toBe(true);
  });
});
