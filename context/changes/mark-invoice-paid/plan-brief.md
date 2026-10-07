# Oznaczanie faktury jako zapłaconej i widok historii — Plan Brief

> Full plan: `context/changes/mark-invoice-paid/plan.md`

## What & Why

S-06 z roadmapy (US-02, FR-004, FR-006, FR-010). Użytkownik musi móc zamknąć fakturę, za którą dostał pieniądze. Inaczej zostaje ona w eskalacji i w ponagleniach, a odsetki dalej rosną. Zapłacona faktura ma zniknąć z listy i z ponagleń i trafić do historii z odsetkami liczonymi do dnia wpłaty.

## Starting Point

Tabela `invoices` nie ma żadnego pola stanu, więc każda faktura jest „otwarta”. Lista na `/` i sekcja „Ponaglenia” korzystają z jednej tablicy faktur w wyspie `InvoicesManager`. Odsetki i rekompensatę liczą czyste funkcje z `src/lib/charges.ts`, które przyjmują liczbę dni. Widoku historii nie ma.

## Desired End State

Każdy wiersz listy otwartych faktur ma przycisk „Zapłacona”. Otwiera on dialog z datą wpłaty (domyślnie dziś, nie później niż dziś) i podglądem kwot. Po zapisie faktura od razu znika z listy i z ponagleń. Strona `/history` pokazuje zapłacone faktury od najnowszej wpłaty, z dniami opóźnienia, odsetkami i rekompensatą liczonymi do daty wpłaty. Można tam zmienić datę wpłaty albo przywrócić fakturę do otwartych.

## Key Decisions Made

| Decision                 | Choice                                                                       | Why (1 sentence)                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Dopuszczalna data wpłaty | Nie później niż dziś (czas polski); wpłata przed terminem dozwolona (0 zł)    | Blokuje literówki w przyszłość, a wpłatę przed terminem nadal można zapisać.                                 |
| Naprawa pomyłek          | W historii „Zmień datę” oraz „Przywróć do otwartych”                         | Obejmuje zarówno złą datę, jak i omyłkowe oznaczenie.                                                         |
| Przywrócenie             | Od razu, bez potwierdzenia                                                   | Akcja jest w pełni odwracalna przez ponowne oznaczenie.                                                       |
| Kwoty zapłaconej faktury | Liczone z `paid_on` funkcjami `charges.ts`, bez zapisu w bazie               | Jedno źródło prawdy i prosta migracja; S-10 zdecyduje o ewentualnym zamrożeniu stopy.                         |
| Forma historii           | Osobna strona `/history` w Topbarze                                          | Zgodnie z FR-010 („osobny widok”); S-07 dopisze tu anulowane.                                                 |
| Oznaczanie               | Przycisk w wierszu + dialog z podglądem kwot, ten sam dialog do edycji daty  | Jeden komponent obsługuje oba przypadki, a użytkownik widzi skutek wybranej daty przed zapisem.              |
| Model danych             | Jedna kolumna `paid_on date null`, bez kolumny statusu                       | Stan wynika z daty; S-07 może dodać `cancelled_on` w tym samym stylu.                                         |
| API                      | `PUT`/`DELETE /api/invoices/[id]/payment`, oba idempotentne; cudza faktura → 404 | Jeden zasób obsługuje oznaczenie, edycję i przywrócenie; RLS bez nowych polityk.                          |

## Scope

**In scope:**

- Migracja `paid_on`, filtrowanie listy otwartych, lista zapłaconych
- Endpoint wpłaty z walidacją zod (wspólną dla przeglądarki i API)
- `chargesAsOf` z testami, `paymentInputSchema(today)` z testami
- `PaymentDialog` + hook, przycisk „Zapłacona”, stany w `/dev/ui`
- Strona `/history` (middleware, Topbar), edycja daty, przywracanie
- Kroki smoke (w tym izolacja właścicieli), README

**Out of scope:**

- Częściowe wpłaty; zapis kwot („snapshot”) w bazie
- Anulowanie (S-07), wstrzymanie (S-08), filtrowanie i sortowanie historii
- Potwierdzenie przed przywróceniem; kolumna statusu

## Architecture / Approach

`paid_on` jest całym stanem. `listInvoices` zwraca tylko faktury z `paid_on is null`, więc lista i ponaglenia na `/` same wykluczają zapłacone. `PUT` ustawia datę, a `DELETE` ją czyści. Serwis traktuje brak zwróconego wiersza (RLS) jako `not_found`. Reguła „nie później niż dziś” to fabryka schematu z parametrem `today`: na serwerze `todayInPoland`, w przeglądarce prop. Kwoty „na dzień X” liczy `chargesAsOf`, z którego korzystają dialog i historia.

## Phases at a Glance

| Phase                   | What it delivers                                                   | Key risk                                                           |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 1. Dane i API           | Migracja, serwis, schemat, endpoint `payment`, testy, smoke        | Aktualizacja cudzej faktury „przechodzi” z 0 wierszami zamiast 404 |
| 2. Oznaczanie na liście | Przycisk „Zapłacona”, `PaymentDialog` z podglądem, `/dev/ui`       | Fokus po zniknięciu wiersza, z którego otwarto dialog              |
| 3. Widok historii       | `/history` z kwotami do dnia wpłaty, „Zmień datę”, „Przywróć”      | Spójna kolejność po edycji daty                                    |

**Prerequisites:** S-04 (done); lokalny Supabase z zastosowanymi migracjami; port 4321 wolny.
**Estimated effort:** ~2–3 sesje w 3 fazach.

## Open Risks & Assumptions

- Po S-10 zmiana stopy w ustawieniach zmieni też kwoty w historii, bo liczymy je na bieżąco. To świadomy kompromis, do ponownego rozważenia w S-10.
- Przy północy „dziś” w przeglądarce może się różnić od „dziś” na serwerze. Rozstrzyga serwer i zwraca błąd pola.
- Rekompensata w historii zależy od bieżącego przełącznika klienta, tak samo jak na liście.

## Success Criteria (Summary)

- Zapłacona faktura znika z listy i z ponagleń bez przeładowania i nie wraca po odświeżeniu.
- W historii odsetki nie rosną po dacie wpłaty, a datę można poprawić lub cofnąć oznaczenie.
- Cudzej faktury nie da się oznaczyć ani przywrócić (404), a przyszłej daty nie da się zapisać.

## References

- Roadmap S-06: `context/foundation/roadmap.md`
- PRD: US-02, FR-004, FR-006, FR-007, FR-010 w `context/foundation/prd.md`
- Lekcje: `context/foundation/lessons.md`
