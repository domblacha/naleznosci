import { describe, expect, it } from "vitest";
import { senderProfileInputSchema } from "@/lib/sender-profile-schemas";

const valid = {
  companyName: "Firma Testowa Sp. z o.o.",
  nip: "5260250995",
  address: "ul. Prosta 1\n00-001 Warszawa",
  bankAccount: "61109010140000071219812874",
};

function issues(overrides: Record<string, unknown>) {
  const result = senderProfileInputSchema.safeParse({ ...valid, ...overrides });
  return (result.error?.issues ?? []).map((issue) => ({ path: issue.path, message: issue.message }));
}

describe("senderProfileInputSchema", () => {
  it("przyjmuje poprawny profil", () => {
    expect(senderProfileInputSchema.parse(valid)).toEqual(valid);
  });

  it("zamienia puste pola na null", () => {
    expect(senderProfileInputSchema.parse({ companyName: "", nip: "", address: "", bankAccount: "" })).toEqual({
      companyName: null,
      nip: null,
      address: null,
      bankAccount: null,
    });
  });

  it("zamienia same spacje i znaki nowej linii na null", () => {
    expect(
      senderProfileInputSchema.parse({ companyName: "   ", nip: " - ", address: " \n  \n ", bankAccount: "  " }),
    ).toEqual({ companyName: null, nip: null, address: null, bankAccount: null });
  });

  it("traktuje brakujące klucze jak puste pola", () => {
    expect(senderProfileInputSchema.parse({})).toEqual({
      companyName: null,
      nip: null,
      address: null,
      bankAccount: null,
    });
  });

  it("przycina nazwę firmy i adres, zachowując nowe linie w adresie", () => {
    expect(
      senderProfileInputSchema.parse({ ...valid, companyName: "  Firma  ", address: "\n ul. A 1\nWarszawa \n" }),
    ).toMatchObject({
      companyName: "Firma",
      address: "ul. A 1\nWarszawa",
    });
  });

  it("normalizuje NIP i numer konta", () => {
    expect(
      senderProfileInputSchema.parse({
        ...valid,
        nip: "PL 526-025-09-95",
        bankAccount: "PL61 1090-1014 0000 0712 1981 2874",
      }),
    ).toMatchObject({ nip: "5260250995", bankAccount: "61109010140000071219812874" });
  });

  it("odrzuca błędny NIP z błędem pod kluczem nip", () => {
    expect(issues({ nip: "5260250996" })).toEqual([{ path: ["nip"], message: "Podaj poprawny NIP (10 cyfr)" }]);
  });

  it("odrzuca błędny numer konta z błędem pod kluczem bankAccount", () => {
    expect(issues({ bankAccount: "61109010140000071219812875" })).toEqual([
      {
        path: ["bankAccount"],
        message: "Podaj poprawny numer konta (26 cyfr, np. 61 1090 1014 0000 0712 1981 2874)",
      },
    ]);
  });

  it("przyjmuje nazwę 200 znaków i odrzuca 201", () => {
    expect(issues({ companyName: "a".repeat(200) })).toEqual([]);
    expect(issues({ companyName: "a".repeat(201) })).toEqual([
      { path: ["companyName"], message: "Nazwa firmy może mieć najwyżej 200 znaków" },
    ]);
  });

  it("przyjmuje adres 300 znaków i odrzuca 301", () => {
    expect(issues({ address: "a".repeat(300) })).toEqual([]);
    expect(issues({ address: "a".repeat(301) })).toEqual([
      { path: ["address"], message: "Adres może mieć najwyżej 300 znaków" },
    ]);
  });

  it("liczy limity po przycięciu", () => {
    expect(issues({ companyName: `  ${"a".repeat(200)}  `, address: `\n${"a".repeat(300)}\n` })).toEqual([]);
  });
});
