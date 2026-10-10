# Ustawienia reguły eskalacji — Plan Brief

> Full plan: `context/changes/escalation-settings/plan.md`

## What & Why

S-10 (FR-009): użytkownik ustawia dni 4 progów eskalacji, roczną stopę odsetek i 3 kwoty rekompensaty w PLN, a zmiana od razu działa na wszystkie **otwarte** faktury. Stopa ustawowa zmienia się 1 stycznia 2027, więc dziś wymagałoby to zmiany stałej w kodzie. Przy okazji plan zamyka decyzję odłożoną w S-06: zapłacone faktury nie mogą zmieniać kwot wstecz po zmianie ustawień.

## Starting Point

Progi (`DEFAULT_THRESHOLDS`) oraz stopa i rekompensata (`DEFAULT_CHARGE_SETTINGS`) to stałe w kodzie, przekazywane jako parametry domyślne do czystych funkcji. Historia (`/history`) liczy odsetki i rekompensatę przy każdym renderze ze stałej i z bieżącej flagi klienta. Faktura nie pamięta żadnej stopy, więc zmiana ustawień przepisałaby rozliczone kwoty, np. 113,01 zł (13,75%) na 92,47 zł (11,25%) dla 10 000 zł i 30 dni.

## Desired End State

Strona `/settings` (link „Ustawienia” w Topbarze) z formularzem progów, stopy i 3 kwot, przyciskami „Zapisz” i „Przywróć domyślne”. `/`, ponaglenia i podgląd „Zapłacona” liczą się z ustawień użytkownika. Oznaczenie faktury jako zapłaconej zapisuje na niej stopę i kwotę rekompensaty, dlatego `/history` nie zmienia się ani po zmianie ustawień, ani po przełączeniu „naliczaj rekompensatę” u klienta. Stare zapłacone faktury dostają migawkę z obecnych wartości domyślnych, więc ich kwoty zostają bez zmian.

## Key Decisions Made

| Decision                   | Choice                                                                 | Why (1 sentence)                                                                                   |
| -------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Kwoty zapłaconych faktur   | Migawka stopy (bp) i kwoty rekompensaty zapisana przy oznaczeniu        | Rozliczona historia nie może się zmieniać wstecz; FR-009 dotyczy tylko otwartych faktur.             |
| Zmiana daty wpłaty         | Migawka zostaje, zmienia się tylko liczba dni                           | Poprawka daty nie powinna zmieniać warunków rozliczenia.                                            |
| Cofnięcie do otwartych     | Czyści migawkę; faktura liczy się z bieżących ustawień                  | Otwarta faktura zawsze podlega aktualnym ustawieniom.                                               |
| Co konfiguruje rekompensata | Tylko 3 kwoty; granice 5 000 / 50 000 zł stałe w kodzie                 | Zmienia się kurs EUR, nie granice ustawowe; ostatni próg otwarty z definicji (F2).                  |
| Migawka rekompensaty       | Kwota progu (0 przy wyłączonej fladze klienta), pokazywana tylko po terminie | Zmiana daty w obie strony daje poprawny wynik bez ponownego czytania ustawień.                     |
| Gdzie liczona migawka      | W aplikacji (`setInvoicePayment` + `charges.ts`), nie w triggerze       | Logika progów zostaje w jednym miejscu; SQL powiela wartości domyślne tylko raz w backfillu.        |
| Przechowywanie ustawień    | Tabela `user_settings`, wiersz na użytkownika, brak wiersza = domyślne  | Upsert bez seedowania, a nowe konto działa od razu.                                                    |
| Ekran                      | Strona `/settings` z „Przywróć domyślne”                                | Wzorzec `/clients` i `/history`, łatwy powrót do wartości ustawowych.                                 |
| Liczby                     | Stopa w bp, kwoty w groszach, zod `int()` (F1)                          | Brak liczb zmiennoprzecinkowych w wyliczeniach.                                                    |

## Scope

**In scope:** tabela `user_settings` z RLS, `PUT /api/settings`, kolumny migawki z backfillem i constraintem, migawka w `setInvoicePayment`, historia liczona z migawki, ustawienia w `/` (grupy, etykiety, kwoty, ponaglenia, podgląd wpłaty), strona `/settings`, `/dev/ui`, smoke, README, F1/F2.

**Out of scope:** konfiguracja granic progów rekompensaty, wersjonowanie ustawień i kilka stóp na okres, odświeżanie migawki przy zmianie daty, migawka dla anulowanych, trigger liczący migawkę, ręczna korekta kwot.

## Architecture / Approach

Ustawienia są czytane na serwerze (`getSettings` z wartościami domyślnymi) w `index.astro` i `settings.astro` i trafiają do wysp jako props. Czyste funkcje dostają je jako parametry, które już mają. `setInvoicePayment` odczytuje fakturę: jeśli jest otwarta, liczy `paymentSnapshot` z ustawień i flagi klienta i robi warunkowy update; jeśli jest zapłacona, zmienia tylko datę. Historia liczy kwoty przez `frozenChargesAsOf` tylko z danych faktury.

## Phases at a Glance

| Phase                                          | What it delivers                                                   | Key risk                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 1. Model ustawień i API                        | `user_settings`, walidacja, serwis, `PUT /api/settings`, F1/F2      | Parsowanie stopy i kwot bez liczb zmiennoprzecinkowych                   |
| 2. Zamrożenie kwot zapłaconych faktur          | Kolumny migawki z backfillem, zapis przy wpłacie, historia z migawki | Backfill musi odtworzyć dzisiejsze kwoty; constraint blokuje stary kod w oknie wdrożenia |
| 3. Ustawienia w wyliczeniach otwartych faktur  | `/`, ponaglenia i podgląd wpłaty z ustawień użytkownika             | Pominięte miejsce wywołania zostaje na wartościach domyślnych            |
| 4. Ekran `/settings`                           | Strona, formularz z resetem, link, `/dev/ui`, README                 | UX błędów progów (para pól)                                              |

**Prerequisites:** S-04 i S-06 (gotowe); świeży branch `feat/escalation-settings` z aktualnego `main`.
**Estimated effort:** ~3–4 sesje w 4 fazach.

## Open Risks & Assumptions

- Między `db push` a `wrangler deploy` stary kod nie oznaczy faktury jako zapłaconej (constraint migawki). Okno trwa sekundy, a gdy deploy padnie, trzeba wykonać „Re-run failed jobs”.
- Faktura oznaczona przed zmianą stopy zostaje na starej stopie nawet po poprawieniu daty wpłaty na dzień po zmianie. To świadoma decyzja.
- Zakładamy jedną stopę na cały okres opóźnienia (PRD Non-Goal).

## Success Criteria (Summary)

- Zmiana ustawień na `/settings` od razu zmienia etapy, odsetki, rekompensatę i ponaglenia otwartych faktur.
- Kwoty w `/history` nie zmieniają się po zmianie ustawień, flagi klienta ani migracji.
- Nowe konto bez zapisanych ustawień działa na wartościach domyślnych.
