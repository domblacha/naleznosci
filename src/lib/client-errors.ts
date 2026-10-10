const DEFAULT_MESSAGE = "Coś poszło nie tak. Spróbuj ponownie.";

const MESSAGES: Record<string, string> = {
  duplicate_nip: "Klient z tym NIP-em już istnieje.",
  duplicate_name: "Klient o tej nazwie (bez NIP) już istnieje.",
  duplicate_nip_inactive: "Klient z tym NIP-em jest wśród usuniętych. Przywróć go w zakładce „Nieaktywni”.",
  duplicate_name_inactive: "Klient o tej nazwie (bez NIP) jest wśród usuniętych. Przywróć go w zakładce „Nieaktywni”.",
  has_open_invoices:
    "Nie można usunąć klienta, dopóki ma otwarte faktury (także wstrzymane). Oznacz je jako zapłacone albo je anuluj.",
  not_found: "Nie znaleziono klienta.",
  unauthorized: "Zaloguj się, aby zarządzać klientami.",
  config_missing: "Zapis klientów jest niedostępny: brak konfiguracji serwera.",
};

export function clientErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : DEFAULT_MESSAGE;
}
