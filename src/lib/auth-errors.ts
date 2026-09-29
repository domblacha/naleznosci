const DEFAULT_MESSAGE = "Coś poszło nie tak. Spróbuj ponownie.";

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Nieprawidłowy e-mail lub hasło.",
  user_already_exists: "Konto z tym adresem e-mail już istnieje.",
  email_exists: "Konto z tym adresem e-mail już istnieje.",
  weak_password: "Hasło jest zbyt słabe. Wybierz dłuższe lub bardziej złożone hasło.",
  email_address_invalid: "Podaj poprawny adres e-mail i hasło.",
  validation_failed: "Podaj poprawny adres e-mail i hasło.",
  invalid_input: "Podaj poprawny adres e-mail i hasło.",
  over_request_rate_limit: "Zbyt wiele prób. Spróbuj ponownie za chwilę.",
  over_email_send_rate_limit: "Zbyt wiele prób. Spróbuj ponownie za chwilę.",
  signup_disabled: "Rejestracja jest obecnie wyłączona.",
  email_not_confirmed: "Potwierdź swój adres e-mail, zanim się zalogujesz.",
  config_missing: "Logowanie jest niedostępne: brak konfiguracji serwera.",
};

export function authErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : DEFAULT_MESSAGE;
}
