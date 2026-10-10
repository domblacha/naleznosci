# Profil nadawcy wstawiany do ponagleń — Plan Brief

> Full plan: `context/changes/sender-profile/plan.md`

## What & Why

S-13 z roadmapy. Dziś każde ponaglenie kończy się gołym „Z poważaniem”, a użytkownik dopisuje ręcznie dane firmy i numer konta. Po tej zmianie zapisuje je raz na `/settings`, a ponaglenie wstawia je samo.

## Starting Point

`renderReminder` (`src/lib/reminder.ts`) podstawia pola z mapy w 4 stałych szablonach. Tekst powstaje w przeglądarce, w oknie ponaglenia na `/`. S-10 zostawił gotowy wzorzec: tabela z jednym wierszem na użytkownika, serwis, `PUT` API, schemat zod i formularz na `/settings`. Walidator NIP już istnieje, walidatora numeru konta nie ma.

## Desired End State

Na `/settings` jest karta „Dane nadawcy” z opcjonalnymi polami: nazwa firmy, NIP, adres (wieloliniowy) i numer konta. Ma własny przycisk „Zapisz”. Ponaglenie ma nazwę, adres i `NIP: …` pod „Z poważaniem” oraz „… do 17.10.2026 na rachunek nr 61 1090 1014 0000 0712 1981 2874” w zdaniu o terminie. Brakujące pole znika bez śladu. Przy całkowicie pustym profilu okno ponaglenia pokazuje podpowiedź z linkiem do Ustawień, a ta podpowiedź nie trafia do tekstu.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Miejsce formularza | Karta na `/settings`, osobny formularz, API i tabela `sender_profiles` | Bez nowej trasy, a zapis profilu nie wymusza zapisu reguły eskalacji (`NOT NULL` w `user_settings`). |
| Wymagalność | Wszystkie 4 pola opcjonalne | Użytkownik może podać tylko to, czego potrzebuje (np. samo konto). |
| Walidacja | NIP z sumą kontrolną (`isValidNip`), konto jako polski NRB/IBAN (26 cyfr, mod-97, opcjonalne `PL`) | Literówka w numerze konta, na który klient ma zapłacić, jest najdroższym błędem. |
| Pusty profil | Tekst kończy się na „Z poważaniem”; Alert z linkiem w oknie, gdy wszystkie 4 pola są puste | Do schowka nigdy nie trafia placeholder, a użytkownik wie, gdzie uzupełnić dane. |
| Układ | `{nadawca}` (nazwa, adres, NIP) pod podpisem; `{konto}` (` na rachunek nr …`) po `{termin_zapłaty}` | Klient widzi numer tam, gdzie czyta, do kiedy i dokąd zapłacić. |
| Zapis w bazie | NIP jako 10 cyfr, konto jako 26 cyfr bez `PL`, formatowanie przy wyświetlaniu | Jeden kanoniczny format i proste checki w bazie. |

## Scope

**In scope:**
- migracja `sender_profiles` z RLS 4×2,
- `iban.ts`, schemat zod, serwis i `PUT /api/sender-profile`,
- pola `{nadawca}` i `{konto}` w 4 szablonach,
- karta na `/settings`,
- przekazanie profilu do okna ponaglenia razem z podpowiedzią,
- testy jednostkowe, smoke, kitchen sink i README.

**Out of scope:**
- edytowalne szablony (FR-014),
- konta zagraniczne,
- sumy kontrolne w bazie,
- adres rozbity na pola,
- nagłówek pisma,
- osobna strona `/profile`,
- usuwanie wiersza profilu.

## Architecture / Approach

Profil czytany jest na serwerze (`getSenderProfile`, równolegle z istniejącymi zapytaniami na `/` i `/settings`) i trafia propsem: `InvoicesManager` → `RemindersSection` → `ReminderDialog` → `renderReminder(reminder, today, sender)`. Blok nadawcy i klauzulę rachunku liczą czyste funkcje w `src/lib/sender-profile.ts`. `{konto}` ma własną spację wiodącą, a wynik przechodzi przez `trimEnd()`, więc pusty profil daje tekst identyczny z dzisiejszym, co potwierdza istniejący test.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Dane i API profilu nadawcy | Tabela z RLS, walidacja NIP/IBAN, serwis, `PUT /api/sender-profile`, smoke | Rozjazd między limitami w migracji a schematem zod |
| 2. Dane nadawcy w tekście ponaglenia | `{nadawca}` i `{konto}` w 4 szablonach z testami | Puste linie lub podwójne spacje przy częściowym profilu |
| 3. Formularz i okno ponaglenia | Karta na `/settings`, profil w oknie, podpowiedź, kitchen sink, README | Dwa przyciski „Zapisz” na jednej stronie mylą użytkownika |

**Prerequisites:** S-05 (done); świeży branch `feat/sender-profile` z aktualnego `main`; lokalny Supabase z migracjami S-10.
**Estimated effort:** ~1–2 sesje w 3 fazach.

## Open Risks & Assumptions

- Zakładamy, że użytkownicy mają polskie konta. Konto zagraniczne nie przejdzie walidacji i wymagałoby osobnej zmiany.
- Zdanie etapu 4 z rachunkiem („…uregulowana do 12.10.2026 na rachunek nr …, sprawa…”) jest gramatycznie poprawne, ale długie. Ocena w kroku ręcznym 3.8.

## Success Criteria (Summary)

- Użytkownik raz zapisuje dane nadawcy, a każde ponaglenie ma je bez ręcznego dopisywania.
- Ponaglenie przy częściowym lub pustym profilu nie zawiera placeholderów ani pustych linii.
- Profil widzi i zmienia wyłącznie jego właściciel.
