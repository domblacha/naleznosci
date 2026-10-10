// Domyślne szablony ponaglenia, po jednym na etap. Pola: {data}, {klient}, {pozycje},
// {podsumowanie}, {termin_zapłaty}{konto}. S-12 przeniesie je do ustawień użytkownika.

export type ReminderStage = 1 | 2 | 3 | 4;

export const PAYMENT_DEADLINE_DAYS = 7;

export const REMINDER_TEMPLATES: Record<ReminderStage, string> = {
  1: `Przypomnienie o płatności
{data}

{klient}

Dzień dobry,

uprzejmie przypominam, że minął termin płatności poniższych faktur:

{pozycje}

{podsumowanie}

Być może płatność umknęła w natłoku spraw. Proszę o uregulowanie należności do {termin_zapłaty}{konto}. Jeśli przelew został już wysłany, proszę potraktować tę wiadomość jako nieaktualną.

Z poważaniem
{nadawca}`,
  2: `Ponowne przypomnienie o płatności
{data}

{klient}

Dzień dobry,

ponownie zwracam się z prośbą o zapłatę. Do dziś nie odnotowano wpłaty za poniższe faktury:

{pozycje}

{podsumowanie}

Proszę o uregulowanie pełnej kwoty do {termin_zapłaty}{konto}. Za każdy dzień opóźnienia naliczane są odsetki za opóźnienie w transakcjach handlowych.

Z poważaniem
{nadawca}`,
  3: `Wezwanie do zapłaty
{data}

{klient}

Wzywam do zapłaty zaległych należności z tytułu poniższych faktur:

{pozycje}

{podsumowanie}

Kwotę należy wpłacić najpóźniej do {termin_zapłaty}{konto}. Brak zapłaty w tym terminie spowoduje podjęcie dalszych kroków w celu odzyskania należności.

Z poważaniem
{nadawca}`,
  4: `Ostateczne przedsądowe wezwanie do zapłaty
{data}

{klient}

Wobec braku zapłaty mimo wcześniejszych przypomnień ostatecznie wzywam do zapłaty należności z tytułu poniższych faktur:

{pozycje}

{podsumowanie}

Jeżeli należność nie zostanie uregulowana do {termin_zapłaty}{konto}, sprawa zostanie skierowana na drogę postępowania sądowego, co narazi Państwa na dodatkowe koszty.

Z poważaniem
{nadawca}`,
};
