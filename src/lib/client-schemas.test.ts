import { describe, expect, it } from "vitest";
import { clientInputSchema } from "@/lib/client-schemas";

describe("clientInputSchema", () => {
  it("przycina nazwę i zwija spacje", () => {
    const result = clientInputSchema.parse({ name: "  Acme   Sp.  z   o.o.  ", nip: "" });
    expect(result.name).toBe("Acme Sp. z o.o.");
  });

  it("odrzuca pustą nazwę", () => {
    const result = clientInputSchema.safeParse({ name: "   ", nip: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Podaj nazwę klienta");
  });

  it("odrzuca nazwę dłuższą niż 200 znaków", () => {
    const result = clientInputSchema.safeParse({ name: "a".repeat(201), nip: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Nazwa może mieć najwyżej 200 znaków");
  });

  it("akceptuje nazwę o długości 200 znaków", () => {
    expect(clientInputSchema.safeParse({ name: "a".repeat(200), nip: "" }).success).toBe(true);
  });

  it("zamienia pusty lub brakujący NIP na null", () => {
    expect(clientInputSchema.parse({ name: "Acme", nip: "" }).nip).toBeNull();
    expect(clientInputSchema.parse({ name: "Acme", nip: "  " }).nip).toBeNull();
    expect(clientInputSchema.parse({ name: "Acme" }).nip).toBeNull();
  });

  it("normalizuje NIP do 10 cyfr", () => {
    expect(clientInputSchema.parse({ name: "Acme", nip: "PL 123-456-32-18" }).nip).toBe("1234563218");
  });

  it("odrzuca zły NIP z polskim komunikatem", () => {
    const result = clientInputSchema.safeParse({ name: "Acme", nip: "1234563219" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Podaj poprawny NIP (10 cyfr)");
  });

  it("ustawia chargeCompensation domyślnie na true", () => {
    expect(clientInputSchema.parse({ name: "Acme", nip: "" }).chargeCompensation).toBe(true);
    expect(clientInputSchema.parse({ name: "Acme", nip: "", chargeCompensation: false }).chargeCompensation).toBe(
      false,
    );
  });
});
