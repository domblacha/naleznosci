const DEFAULT_MESSAGE = "Coś poszło nie tak. Spróbuj ponownie.";

const MESSAGES: Record<string, string> = {
  duplicate_number: "Faktura o tym numerze już istnieje.",
  client_not_found: "Nie znaleziono klienta. Odśwież stronę.",
  not_found: "Nie znaleziono faktury. Odśwież stronę.",
  unauthorized: "Zaloguj się, aby zarządzać fakturami.",
  config_missing: "Zapis faktur jest niedostępny: brak konfiguracji serwera.",
};

export function invoiceErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : DEFAULT_MESSAGE;
}
