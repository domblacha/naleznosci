# Reguły edycji faktur w bazie (close-db-gaps) — Plan Brief

> Full plan: `context/changes/close-db-gaps/plan.md`
> Research: `context/changes/close-db-gaps/research.md`

## What & Why

Reguły edycji faktur działają tylko w serwisie, więc właściciel może je obejść przez PostgREST: zmienić kwotę
zapłaconej/anulowanej faktury, termin przeterminowanej albo wpisać `paid_on` w przyszłości. Cztery testy `it.fails`
w `db-gaps.int.test.ts` to dowodzą. Przenosimy te reguły do bazy, żeby historia i odsetki nie dały się sfałszować.

## Starting Point

Serwis (`updateInvoice`, `invoice-lock.ts`, zod `paymentInputSchema`) sprawdza reguły przed zapytaniem; RLS `update`
sprawdza tylko właściciela. W bazie jest jeden trigger na `invoices` (`invoices_guard_client_active`), który jest
wzorcem dla nowego.

## Desired End State

Baza odrzuca zmianę `client_id`, `amount_grosze` i `due_date` faktury zamkniętej (`invoice_closed`) oraz otwartej,
niewstrzymanej i przeterminowanej (`invoice_locked`), a także `paid_on` w przyszłości przy insercie i przy zmianie
`paid_on` (`paid_on_in_future`). Legalne ścieżki aplikacji działają jak dotąd, a w `db-gaps.int.test.ts` nie ma `it.fails`.

## Key Decisions Made

| Decision              | Choice                                                                                                | Why (1 sentence)                                                                  | Source   |
| --------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| Mechanizm             | Trigger `before insert or update`, nie CHECK                                                          | Reguły porównują `old`/`new` albo zależą od czasu.                                | Research |
| Dzień „dziś”          | `(now() at time zone 'Europe/Warsaw')::date`                                                          | Baza i `todayInPoland` muszą liczyć ten sam dzień.                                | Research |
| Zakres                | Pola zablokowane (klient, kwota, termin) dla zamkniętej i przeterminowanej niewstrzymanej + `paid_on` | Odwzorowuje całą regułę `invoice-lock.ts`, nie tylko 4 przypadki.                 | Plan     |
| Kody błędów           | `invoice_locked` → `locked`, `invoice_closed` → `not_found`, `paid_on_in_future` → `unknown`          | Wyścig o północy daje 409/404 zamiast 500, zgodnie z kontraktem z test-plan §6.5. | Plan     |
| `paid_on` przy update | Sprawdzane tylko przy zmianie `paid_on`                                                               | Niezwiązany update nie wywraca się na starym wierszu.                             | Plan     |
| Warunki               | Liczone na `old`                                                                                      | Tak samo jak serwis, który czyta bieżący wiersz.                                  | Research |
| Plik testów           | Nazwa zostaje, zmieniają się tytuły i `describe`                                                      | Odwołują się do niego test-plan i archiwum.                                       | Plan     |

## Scope

**In scope:** migracja z triggerem; testy reguł (4 dawne luki, 5 nowych odrzuceń, 4 nowe kontrole); mapowanie w
`toErrorCode`; README i test-plan §6.5.

**Out of scope:** numer zamkniętej faktury; zamrożenie migawki; walidacja istniejących wierszy; reguła „wpłata przed
wystawieniem”; edycja zastosowanych migracji.

## Architecture / Approach

Funkcja `public.invoices_guard_locked_fields()` (plpgsql, security invoker, `search_path = ''`) na
`before insert or update of client_id, amount_grosze, due_date, paid_on`. Na update odrzuca najpierw zamkniętą,
potem zablokowaną fakturę ze zmienionym polem (`is distinct from`), na insert i przy zmianie `paid_on` odrzuca
datę `> dzień PL`. Serwis rozpoznaje komunikaty po `error.message`.

## Phases at a Glance

| Phase                                  | What it delivers                        | Key risk                                                                                         |
| -------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1. Trigger w bazie i testy reguł       | Luki zamknięte, testy bez `it.fails`    | Zbyt szeroki warunek blokuje legalną ścieżkę (zmiana daty wpłaty, cofnięcie, edycja wstrzymanej) |
| 2. Mapowanie w serwisie i dokumentacja | 409/404 zamiast 500, README i test-plan | Rozjazd treści komunikatów między SQL a TS                                                       |

**Prerequisites:** lokalny Supabase (`npx supabase start`), świeży branch `feat/close-db-gaps` z aktualnego `main`.
**Estimated effort:** ~1 sesja, 2 fazy.

## Open Risks & Assumptions

- Strefa `Europe/Warsaw` jest zakodowana w SQL i w `todayInPoland`; zmiana jednej bez drugiej rozjedzie reguły
  (komentarz `UWAGA` w migracji).
- Zakładamy brak produkcyjnych wierszy z przyszłym `paid_on` (API to blokuje); trigger ich nie wykryje.

## Success Criteria (Summary)

- Właściciel nie zmieni przez PostgREST pól zablokowanych ani nie wpisze przyszłego `paid_on`.
- Edycja, zmiana daty wpłaty, cofnięcie wpłaty i edycja wstrzymanej faktury działają jak dotąd (testy i smoke zielone).
