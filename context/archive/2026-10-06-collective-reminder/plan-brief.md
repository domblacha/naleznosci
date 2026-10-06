# Zbiorcze ponaglenie do schowka — Plan Brief

> Full plan: `context/changes/collective-reminder/plan.md`

## What & Why

Wycinek S-05 domyka główne kryterium sukcesu PRD. Użytkownik generuje dla klienta jedno zbiorcze ponaglenie obejmujące jego faktury na etapach 1–4, w tonie najwyższego z tych etapów, z pozycjami i sumą, i kopiuje je do schowka. Dziś lista pokazuje etapy i kwoty, ale treść ponaglenia trzeba pisać ręcznie.

## Starting Point

S-03 i S-04 dały czyste funkcje etapu (`src/lib/escalation.ts`) oraz odsetek i rekompensaty (`src/lib/charges.ts`). Wyspa `InvoicesManager` na `/` trzyma w stanie wszystkie otwarte faktury i `today`. Lista jest pogrupowana po etapach, a nie po klientach. W `ui/` nie ma `textarea`.

## Desired End State

Nad listą na `/` jest sekcja „Ponaglenia” z klientami, którzy mają faktury na etapach 1–4, ich najwyższym etapem i kwotą „Razem do zapłaty”. Przycisk otwiera dialog z edytowalną treścią i „Kopiuj do schowka”. Przykład z `/dev/ui` (dziś 05.10.2026): Acme ma etap 4 i 3 pozycje, należność główną 8733,56 zł, odsetki 125,17 zł, rekompensatę 637,50 zł, razem 9496,23 zł i termin zapłaty 12.10.2026. Żabka (bez rekompensaty) ma etap 3 i razem 3008,04 zł, bez linii o rekompensacie.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Faktury w ponagleniu | Etapy 1–4 klienta, ton najwyższego etapu | Tak mówi FR-008; wstrzymane dojdą w S-08. | PRD / Roadmap |
| Punkt wywołania | Sekcja „Ponaglenia” nad listą na `/` | Od razu widać, komu wysłać ponaglenie, a klient bez faktur na etapach 1–4 znika z niej (US-02). | Plan |
| Suma | Należność główna, odsetki, rekompensata i „Razem do zapłaty” | Klient widzi, skąd bierze się kwota, a całość spełnia FR-011. | Plan |
| Klient bez rekompensaty | Rekompensata pominięta w pozycjach i sumach | W piśmie do klienta nie ma „rekompensata 0,00 zł”. | Plan |
| Edycja przed kopiowaniem | Edytowalne pole, zmiany jednorazowe, nic się nie zapisuje | Pozwala dopisać np. numer konta, zanim powstaną edytowalne szablony i profil. | Plan |
| Szablony | 4 stałe teksty z polami `{data}`, `{klient}`, `{pozycje}`, `{podsumowanie}`, `{termin_zapłaty}`; termin = dziś + 7 dni | S-12 zapisze je w bazie bez zmiany silnika, a jego cięcie nie dotyka S-05. | Plan |
| Dane nadawcy | Poza S-05; slice S-13 `sender-profile` (już w roadmapie, przed S-12) | S-05 zostaje bez migracji i formularza profilu przy ciasnym budżecie MVP. | Plan |
| Architektura | Czysta funkcja w przeglądarce, bez API i migracji | Wyspa ma już wszystkie dane, a kwoty zgadzają się z listą, bo liczą je te same funkcje. | Plan |

## Scope

**In scope:**
- `src/lib/format.ts` (formatery wyjęte z wyspy), `src/lib/reminder.ts`, `src/lib/reminder-templates.ts` i testy;
- `textarea` z shadcn, hook schowka, `ReminderDialog`, `RemindersSection` i wpięcie w `InvoicesManager`;
- stany w `/dev/ui`, README, rozstrzygnięcie pytania o szablony w roadmapie, PR i wdrożenie.

**Out of scope:**
- dane nadawcy (S-13 `sender-profile`);
- edycja szablonów (S-12);
- historia ponagleń, wysyłka e-mail i PDF;
- wstrzymane faktury (S-08);
- ustawienia (S-10);
- zmiany smoke;
- migracja i API.

## Architecture / Approach

`buildClientReminders(invoices, today)` wybiera faktury na etapach 1–4, grupuje je po kliencie i wylicza etap, pozycje z odsetkami i rekompensatą oraz sumy. `renderReminder(reminder, today)` podstawia pola do szablonu tonu. `RemindersSection` liczy ponaglenia w `useMemo` z tego samego stanu co lista, więc nowa faktura od razu zmienia sekcję. Dialog trzyma edytowalną kopię tekstu, a `useCopyToClipboard` obsługuje sukces i błąd schowka.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Reguła i szablony ponaglenia | Moduł, 4 szablony, formatery i testy z przykładem Acme/Żabka | Twarda spacja U+00A0 w kwotach psuje porównania w testach |
| 2. Sekcja „Ponaglenia” i dialog | Sekcja, dialog, schowek i `/dev/ui` | Schowek odrzucony przez przeglądarkę albo stara treść poprzedniego klienta w polu |
| 3. Wdrożenie | README, roadmapa, PR, deploy przez potok F-01 | Brak (bez migracji) |

**Prerequisites:** S-04 na produkcji (zrobione); lokalny Supabase do smoke.
**Estimated effort:** ~2 sesje w 3 fazach.

## Open Risks & Assumptions

- Treść 4 szablonów to projekt do zatwierdzenia przy przeglądzie fazy 1; zmiana słów nie zmienia planu.
- Do czasu `sender-profile` podpis i numer konta dopisuje się ręcznie przy każdym ponagleniu. Jeśli S-12 wejdzie przed `sender-profile`, dodanie pola `{nadawca}` będzie wymagało aktualizacji szablonów zapisanych przez użytkowników.
- Data „dziś” pochodzi z serwera przy ładowaniu strony; karta otwarta przez noc pokaże wczorajsze dni i termin zapłaty (tak samo jak lista).

## Success Criteria (Summary)

- Dla klienta z fakturami na etapach 1–4 da się w dwóch kliknięciach skopiować jedno ponaglenie w tonie najwyższego etapu, z pozycjami i sumą zgodnymi z listą do grosza.
- Faktury bieżące i przed pierwszym progiem nie trafiają do ponaglenia, a klient bez rekompensaty nie widzi jej w treści.
- Zmiana jest na produkcji przez PR i potok F-01.
