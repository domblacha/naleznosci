# Odsetki i rekompensata przy przeterminowanych fakturach — Plan Brief

> Full plan: `context/changes/interest-and-compensation/plan.md`

## What & Why

Wycinek S-04: przy każdej fakturze po terminie na liście `/` użytkownik widzi odsetki proste (kwota × roczna stopa × dni po terminie / 365) i rekompensatę z progu kwotowego, do grosza. Poprawność tych kwot jest guardrailem z Kryteriów sukcesu PRD, a ponaglenie (S-05) i historia zapłaconych (S-06) je konsumują, dlatego wyliczenie stoi przed nimi jako osobna, przetestowana funkcja.

## Starting Point

S-03 dało listę otwartych faktur w grupach etapów i funkcję `daysOverdue` liczącą dni w czasie polskim (`src/lib/escalation.ts`). Kwoty są w groszach (`bigint`), a przełącznik „naliczaj rekompensatę” jest na kliencie, ale lista faktur go nie pobiera. Ustawień użytkownika jeszcze nie ma (S-10).

## Desired End State

Tabela na `/` ma kolumny „Odsetki” i „Rekompensata”. Faktura na 1 234,56 zł, 40 dni po terminie, pokazuje 18,60 zł odsetek i 170,00 zł rekompensaty. Faktury bieżące mają „—”, a klient z wyłączonym przełącznikiem ma rekompensatę 0,00 zł. Faktura dodana w dialogu od razu ma kwoty.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Domyślna stopa | 13,75% rocznie (1375 pb), stała w kodzie | Ustawowe odsetki handlowe w II półroczu 2026 (stopa ref. NBP 3,75% + 10 pp), a rekompensata i tak dotyczy B2B. |
| Progi rekompensaty | ≤ 5 000 zł → 170,00 zł; > 5 000 i < 50 000 zł → 297,50 zł; ≥ 50 000 zł → 425,00 zł | Granice z art. 10 ustawy, a kwoty 40/70/100 EUR przeliczone raz po ok. 4,25 zł, bo PRD mówi o progach w PLN. |
| Które faktury mają kwoty | Każda od 1 dnia po terminie, także przed etapem 1; bieżące „—” | FR-007 mówi o fakturze przeterminowanej, a odsetki biegną od dnia po terminie. |
| Prezentacja | 2 kolumny, kontener `max-w-5xl`, bez „Razem” i sum grup | Minimalna zmiana, a sumy per klient policzy ponaglenie w S-05. |
| Arytmetyka | `BigInt` na groszach, stopa w punktach bazowych, połowa w górę | Iloczyn kwota × stopa × dni przekracza `Number.MAX_SAFE_INTEGER`, a liczby zmiennoprzecinkowe zgubiłyby grosz. |
| Dane | Bez migracji; `clients(name, charge_compensation)` w zapytaniu | Przełącznik już istnieje, a ustawienia domyślne są stałą jak `DEFAULT_THRESHOLDS`. |

## Scope

**In scope:**
- moduł `src/lib/charges.ts` z `DEFAULT_CHARGE_SETTINGS`, `interestGrosze`, `compensationGrosze` i testami;
- przełącznik klienta w `Invoice` i serwisie faktur;
- kolumny na liście i w `/dev/ui`;
- README, rozstrzygnięcie pytania S-04 w roadmapie, PR i wdrożenie.

**Out of scope:**
- ustawienia użytkownika (S-10);
- kurs EUR z NBP per faktura;
- stopa zmienna w czasie;
- odsetki do dnia wpłaty (S-06);
- kolumna „Razem” i sumy grup;
- grupa „wstrzymane” (S-08);
- zmiany smoke;
- migracja.

## Architecture / Approach

Czysta funkcja w `src/lib/charges.ts` przyjmuje kwotę w groszach, liczbę dni po terminie, przełącznik klienta i ustawienia, a zwraca grosze. Wyspa `InvoicesManager` wywołuje ją dla każdego wiersza z `daysOverdue`, które już zwraca `groupInvoices`. Serwer dostarcza przełącznik klienta w tym samym zapytaniu co nazwę.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Reguła wyliczeń | Moduł i testy wzoru, zaokrąglenia i granic progów | Cichy błąd zaokrąglenia lub precyzji |
| 2. Kwoty na liście | Przełącznik klienta w danych, 2 kolumny, `/dev/ui` | Tabela 7 kolumn za szeroka na mniejszych ekranach |
| 3. Wdrożenie | README, roadmapa, PR, deploy przez potok F-01 | Brak (bez migracji) |

**Prerequisites:** S-03 na produkcji (zrobione); lokalny Supabase do smoke.
**Estimated effort:** ~1–2 sesje w 3 fazach.

## Open Risks & Assumptions

- Stopa ustawowa zmieni się 1 stycznia 2027; do czasu S-10 zmiana wymaga zmiany stałej w kodzie.
- Stała kwota rekompensaty w PLN może odbiegać o kilka złotych od równowartości 40/70/100 EUR z kursu NBP właściwego dla terminu.
- Zmiana przełącznika klienta działa wstecz na jego otwarte faktury (zgodnie z zasadą FR-009).

## Success Criteria (Summary)

- Każda faktura po terminie pokazuje odsetki i rekompensatę zgodne ze wzorem PRD, do grosza.
- Testy przypinają wzór, połowę grosza, granice 5 000 zł i 50 000 zł oraz największą kwotę z bazy.
- Zmiana jest na produkcji przez PR i potok F-01.
