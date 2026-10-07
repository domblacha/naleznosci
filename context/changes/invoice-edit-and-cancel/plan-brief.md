# Edycja i anulowanie faktury — Plan Brief

> Full plan: `context/changes/invoice-edit-and-cancel/plan.md`

## What & Why

S-07 z roadmapy (FR-003, FR-010). Użytkownik musi móc poprawić błędnie wpisaną fakturę i wycofać fakturę, która nie powinna być ścigana. Blokada edycji po terminie chroni poprawność odsetek i etapów. Anulowanie zachowuje historię zamiast kasować wiersz.

## Starting Point

Faktury można tylko dodawać i oznaczać jako zapłacone (`paid_on`, S-06). Edycji nie ma, twarde usuwanie blokuje RLS, a unikalny numer obejmuje wszystkie faktury. Lista otwartych i ponaglenia biorą faktury z jednej tablicy w `InvoicesManager`.

## Desired End State

W wierszu listy otwartych jest „Edytuj”. Do dnia terminu włącznie wszystko jest edytowalne. Od dnia po terminie klient, kwota i termin są wyłączone, a numer nadal można zmienić. Serwer egzekwuje to samo. W dialogu edycji jest „Anuluj fakturę” z potwierdzeniem. Anulowana faktura znika z listy i ponagleń, zwalnia numer i trafia do sekcji „Anulowane faktury” w `/history`, skąd można ją przywrócić.

## Key Decisions Made

| Decision                    | Choice                                                                                  | Why (1 sentence)                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Granica blokady             | Zablokowana, gdy `today > due_date`; w dniu terminu edycja wolna                        | Dosłownie „od dnia po terminie” z FR-003.                                                         |
| Pola po terminie            | Klient, kwota, termin zablokowane; numer zawsze wolny                                   | Zmiana klienta przenosiłaby dług i zmieniała rekompensatę; literówkę w numerze trzeba móc poprawić. |
| Numer anulowanej            | Zwolniony (częściowy indeks `where cancelled_on is null`)                               | Typowy przypadek: anuluj błędną, dodaj poprawną z tym samym numerem.                              |
| Odwracalność                | Potwierdzenie przed anulowaniem + „Przywróć do otwartych” w historii                    | Pomyłka jest kosztowna (wycina z ponagleń), więc potwierdzenie i wyjście awaryjne.               |
| Co można edytować/anulować  | Tylko faktury otwarte; check w bazie wyklucza „zapłacona i anulowana”                   | Jeden stan na fakturę; zapłaconą najpierw się przywraca.                                         |
| Miejsce akcji               | „Edytuj” w wierszu, „Anuluj fakturę” w dialogu edycji                                   | Dwa przyciski w wierszu zamiast trzech, a akcja destrukcyjna jest o krok dalej.                  |
| Historia                    | Osobna sekcja „Anulowane faktury” z datą anulowania, bez odsetek                        | Kolumny pasują do stanu; zapłacone zostają bez zmian.                                            |
| Termin w przeszłości        | Dozwolony przy edycji, jak przy dodawaniu                                               | Spójność z dodawaniem; faktura od razu trafia na właściwy etap.                                  |
| Model danych                | `cancelled_on date null`, datę ustawia serwer (dziś, czas polski)                       | Ten sam styl co `paid_on`, bez kolumny statusu.                                                  |
| API                         | `PUT /api/invoices/[id]`; `PUT`/`DELETE /api/invoices/[id]/cancellation`; `locked` → 409 | Wzorce `clients/[id]` i `payment`; RLS bez nowych polityk.                                       |

## Scope

**In scope:**

- Migracja `cancelled_on`, constraint wykluczający, częściowy indeks numeru
- `isInvoiceLocked` / `lockedFieldsChanged` z testami granicy dnia, `amountInputText`
- Serwis i endpointy edycji, anulowania i przywracania; smoke (blokada, izolacja, numer)
- Dialog edycji z polami wyłączonymi, potwierdzenie (`alert-dialog`), stany w `/dev/ui`
- Sekcja „Anulowane faktury” w `/history` z przywracaniem; README

**Out of scope:**

- Edycja/anulowanie zapłaconych; wyjątek blokady dla wstrzymanych (S-08)
- Wybór daty anulowania; odsetki anulowanych; filtrowanie/sortowanie historii (S-11)
- Audyt zmian; twarde usuwanie; menu „⋯” w wierszu

## Architecture / Approach

Stan wynika z dat: `paid_on` albo `cancelled_on` (nigdy oba). `listOpenInvoices` wyklucza anulowane, więc lista i ponaglenia aktualizują się bez zmian w `reminder.ts`. Edycja czyta bieżący wiersz otwartej faktury, sprawdza blokadę czystą funkcją i aktualizuje warunkowo (`due_date >= today` przy zmianie pól blokowanych), więc północ ani równoległe zamknięcie faktury nie przepuszczą zmiany. Ta sama funkcja wyłącza pola w dialogu i jest punktem, w którym S-08 doda wyjątek.

## Phases at a Glance

| Phase                               | What it delivers                                                        | Key risk                                                         |
| ----------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1. Dane i API                       | Migracja, reguła blokady z testami, serwis, endpointy, smoke            | Zmiana zablokowanej faktury przechodzi przez wyścig dnia/stanu   |
| 2. Edycja i anulowanie na liście    | „Edytuj”, dialog z blokadą, potwierdzenie anulowania, `/dev/ui`         | Fokus po zniknięciu wiersza; dwa różne przyciski „Anuluj”        |
| 3. Historia anulowanych             | Sekcja „Anulowane faktury” z przywracaniem, README                      | Kolizja numeru przy przywracaniu                                 |

**Prerequisites:** S-03 i S-06 (done); lokalny Supabase z zastosowanymi migracjami; port 4321 wolny.
**Estimated effort:** ~2–3 sesje w 3 fazach.

## Open Risks & Assumptions

- Termin ustawiony przez pomyłkę w przeszłości od razu blokuje kwotę i termin; naprawa przez anulowanie i ponowne dodanie.
- Rollback Workera po migracji pokaże anulowane faktury jako otwarte (stary kod nie zna `cancelled_on`); naprawa przez ponowne wdrożenie.
- Przy północy „dziś” w przeglądarce może się różnić od serwerowego; rozstrzyga serwer (`locked` → komunikat „Odśwież stronę”).

## Success Criteria (Summary)

- Po terminie nie da się zmienić klienta, kwoty ani terminu, ani w UI, ani przez API (409); numer da się poprawić.
- Anulowana faktura znika z listy i z ponagleń bez przeładowania, jest w historii i da się ją przywrócić.
- Po anulowaniu można dodać fakturę o tym samym numerze; cudzej faktury nie da się edytować, anulować ani przywrócić (404).

## References

- Roadmap S-07: `context/foundation/roadmap.md`
- PRD: FR-003, FR-010, FR-013 w `context/foundation/prd.md`
- Wzorzec S-06: `context/archive/2026-10-07-mark-invoice-paid/plan.md`
- Lekcje: `context/foundation/lessons.md`
