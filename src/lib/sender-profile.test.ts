import { describe, expect, it } from "vitest";
import { bankAccountClause, EMPTY_SENDER_PROFILE, isSenderProfileEmpty, senderBlock } from "@/lib/sender-profile";
import type { SenderProfile } from "@/types";

const FULL: SenderProfile = {
  companyName: "Firma Testowa Sp. z o.o.",
  nip: "5260250995",
  address: "ul. Prosta 1\n00-001 Warszawa",
  bankAccount: "61109010140000071219812874",
};

describe("isSenderProfileEmpty", () => {
  it("jest true, gdy wszystkie pola są null", () => {
    expect(isSenderProfileEmpty(EMPTY_SENDER_PROFILE)).toBe(true);
  });

  it.each(["companyName", "nip", "address", "bankAccount"] as const)(
    "jest false, gdy wypełnione jest pole %s",
    (key) => {
      expect(isSenderProfileEmpty({ ...EMPTY_SENDER_PROFILE, [key]: FULL[key] })).toBe(false);
    },
  );
});

describe("senderBlock", () => {
  it("składa nazwę, adres i NIP w tej kolejności", () => {
    expect(senderBlock(FULL)).toBe("Firma Testowa Sp. z o.o.\nul. Prosta 1\n00-001 Warszawa\nNIP: 5260250995");
  });

  it("pomija brakujące elementy", () => {
    expect(senderBlock({ ...FULL, companyName: null, address: null })).toBe("NIP: 5260250995");
    expect(senderBlock({ ...FULL, nip: null })).toBe("Firma Testowa Sp. z o.o.\nul. Prosta 1\n00-001 Warszawa");
  });

  it("pomija puste linie adresu i przycina pozostałe", () => {
    expect(senderBlock({ ...EMPTY_SENDER_PROFILE, address: "  ul. Prosta 1  \n\n   \n00-001 Warszawa\n" })).toBe(
      "ul. Prosta 1\n00-001 Warszawa",
    );
  });

  it("zwraca pusty tekst bez żadnych danych (konto nie wchodzi do bloku)", () => {
    expect(senderBlock(EMPTY_SENDER_PROFILE)).toBe("");
    expect(senderBlock({ ...EMPTY_SENDER_PROFILE, bankAccount: FULL.bankAccount })).toBe("");
  });
});

describe("bankAccountClause", () => {
  it("zwraca zdanie z numerem konta w grupach", () => {
    expect(bankAccountClause(FULL)).toBe(" na rachunek nr 61 1090 1014 0000 0712 1981 2874");
  });

  it("zwraca pusty tekst bez konta", () => {
    expect(bankAccountClause({ ...FULL, bankAccount: null })).toBe("");
  });
});
