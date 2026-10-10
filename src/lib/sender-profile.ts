import { formatBankAccount } from "@/lib/iban";
import type { SenderProfile } from "@/types";

export const EMPTY_SENDER_PROFILE: SenderProfile = {
  companyName: null,
  nip: null,
  address: null,
  bankAccount: null,
};

export function isSenderProfileEmpty(profile: SenderProfile): boolean {
  return (
    profile.companyName === null && profile.nip === null && profile.address === null && profile.bankAccount === null
  );
}

/** Lines under the signature: company name, non-empty address lines, then "NIP: ...". Missing parts are skipped. */
export function senderBlock(profile: SenderProfile): string {
  const addressLines = (profile.address ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return [
    ...(profile.companyName === null ? [] : [profile.companyName]),
    ...addressLines,
    ...(profile.nip === null ? [] : [`NIP: ${profile.nip}`]),
  ].join("\n");
}

/** Clause appended to the payment deadline sentence; carries its own leading space, empty without an account. */
export function bankAccountClause(profile: SenderProfile): string {
  return profile.bankAccount === null ? "" : ` na rachunek nr ${formatBankAccount(profile.bankAccount)}`;
}
