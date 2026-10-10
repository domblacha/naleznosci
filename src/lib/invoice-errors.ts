const DEFAULT_MESSAGE = "Coś poszło nie tak. Spróbuj ponownie.";

const MESSAGES: Record<string, string> = {
  duplicate_number: "Faktura o tym numerze już istnieje.",
  client_not_found: "Nie znaleziono klienta. Odśwież stronę.",
  client_inactive: "Klient tej faktury jest usunięty. Przywróć go na stronie Klienci.",
  not_found: "Nie znaleziono faktury. Odśwież stronę.",
  locked: "Faktura jest po terminie: klienta, kwoty ani terminu nie można już zmienić. Odśwież stronę.",
  unauthorized: "Zaloguj się, aby zarządzać fakturami.",
  config_missing: "Zapis faktur jest niedostępny: brak konfiguracji serwera.",
};

export function invoiceErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : DEFAULT_MESSAGE;
}
