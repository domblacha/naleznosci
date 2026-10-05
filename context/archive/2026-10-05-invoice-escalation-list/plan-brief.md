# Lista otwartych faktur pogrupowana po etapach eskalacji — Plan Brief

> Full plan: `context/changes/invoice-escalation-list/plan.md`

## What & Why

Wycinek S-03 z roadmapy, czyli gwiazda przewodnia (US-01, FR-003 „dodaj”, FR-005, FR-010 „grupy”). Użytkownik dodaje fakturę i widzi ją w grupie właściwego etapu eskalacji. To pierwsze sprawdzenie sedna produktu: deterministycznej klasyfikacji wg dni po terminie (czas polski) i progów. Odsetki, ponaglenia, zapłata i wstrzymanie budują dalej na tej regule.

## Starting Point

`/` to chroniony placeholder. Jest tabela `clients` z RLS i pełny wzorzec warstw z S-02: serwis, strażnik API, schemat zod, wyspa z dialogiem, Vitest i smoke z dwoma kontami. Potok F-01 stosuje migracje przed kodem.

## Desired End State

Na `/` użytkownik klika „Dodaj fakturę”, wybiera klienta i podaje numer, kwotę oraz termin. Faktura od razu ląduje w swojej grupie. Grupy idą od najpilniejszej: etap 4, 3, 2, 1, po terminie przed etapem 1, bieżące. Puste są ukryte, a w grupie pierwszy jest najstarszy termin. Przykład: termin 10.10, dziś 13.10 daje 3 dni po terminie, czyli etap 1. Konto B nigdy nie widzi ani nie użyje klienta konta A.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Semantyka progów | Włącznie: dni = dziś − termin; ≤0 bieżąca (także dzień terminu), 1–2 przed progiem, ≥3 etap 1, ≥7 etap 2, ≥14 etap 3, ≥30 etap 4 | „+3” czyta się dosłownie i zgadza się z FR-003 (dzień 1 = dzień po terminie) | Plan |
| Unikalność numeru | Unikalny w obrębie konta, bez wielkości liter, niezależnie od klienta | JDG ma jedną numerację, więc duplikat to błąd wpisu, który zdublowałby pozycję w ponagleniu | Plan |
| Źródło progów | Stała `DEFAULT_THRESHOLDS` w kodzie, przekazywana do czystej funkcji | Bez tabeli ustawień przed S-10; testy sprawdzają regułę z dowolnymi progami | Plan |
| Układ listy | Od etapu 4 do bieżących, puste ukryte, w grupie najstarszy termin, remis po numerze | To, co wymaga działania, jest na górze | Plan |
| Miejsce dodawania | Dialog na `/` z wyborem klienta (select) | Wzorzec dialogu z S-02, a efekt (grupa) widać natychmiast | Plan |
| Izolacja klienta | Złożony FK `(client_id, user_id) → clients(id, user_id)` | Sam RLS na `invoices` przepuściłby fakturę z cudzym `client_id` | Plan |
| Kwota | `amount_grosze bigint`, parsowanie tekstu bez `parseFloat` | Odsetki w S-04 liczone na liczbach całkowitych, bez błędów typu `0,29 × 100` | Plan |
| „Dziś” | `Europe/Warsaw` przez `Intl`, różnica dat przez `Date.UTC`; serwer przekazuje `today` do wyspy | Granica dnia o północy PL, bez wpływu zmiany czasu i strefy przeglądarki | Plan |

## Scope

**In scope:**
- `src/lib/escalation.ts` z testami brzegowymi;
- migracja `invoices` (RLS, 8 polityk, złożony FK, unikalny numer) i `unique (id, user_id)` na `clients`;
- typy, schemat z parsowaniem kwoty, serwis i `POST /api/invoices`;
- lista z grupami i dialog na `/`, shadcn `select`, stany puste, `/dev/ui`;
- rozszerzony smoke, README, wpis w roadmapie, wdrożenie przez PR.

**Out of scope:**
- edycja i anulowanie (S-07), zapłata i historia (S-06), wstrzymanie (S-08);
- odsetki i rekompensata (S-04), ponaglenia (S-05);
- ustawienia progów (S-10), filtrowanie i sortowanie (S-11);
- dodawanie z `/clients`, dodatkowe pola faktury, paginacja.

## Architecture / Approach

Czysta reguła w `src/lib/escalation.ts`: `todayInPoland`, `daysOverdue`, `escalationGroup` i `groupInvoices`. Baza wymusza izolację i unikalność, a serwis mapuje `23505`/`23503` po nazwie ograniczenia na `duplicate_number`/`client_not_found`. Strona `/` na serwerze ładuje faktury (z nazwą klienta), klientów i `today`, a potem przekazuje je do wyspy `InvoicesManager`. Wyspa grupuje tą samą funkcją i po zapisie z dialogu dokłada fakturę do stanu.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Reguła eskalacji | Czysty moduł i Vitest granic (dzień terminu, progi, północ PL, zmiana czasu, etap 4) | Błąd granicy przenosi się na wszystkie kolejne wycinki |
| 2. Dane i API | Migracja z RLS i złożonym FK, schemat kwoty, serwis, endpoint, smoke izolacji | Mapowanie błędów zależy od nazw ograniczeń |
| 3. Widok listy i dialog | `/` z grupami, dialog z selectem, stany puste, `/dev/ui` | Dostępność selecta w dialogu; zakaz literałów kolorów |
| 4. Wdrożenie | README, roadmapa, PR, potok baza → kod, smoke na produkcji | Smoke na produkcji zostawia konta testowe (wymaga zgody) |

**Prerequisites:** S-02 done (jest); Docker z lokalnym Supabase; potok F-01 działa.
**Estimated effort:** ~2–3 sesje w 4 fazach.

## Open Risks & Assumptions

- Zakładamy, że PostgREST podaje nazwę naruszonego ograniczenia także dla `23503` (dla `23505` działa w S-02). Jeśli nie, mapowanie trzeba oprzeć na `details`.
- „Dziś” jest wyznaczane przy renderze; karta otwarta przez północ pokaże stare grupy do odświeżenia (świadomie poza zakresem).
- S-10 będzie musiał zastąpić `DEFAULT_THRESHOLDS` odczytem ustawień w miejscach wywołania.

## Success Criteria (Summary)

- Faktury z terminem dziś, wczoraj, 3, 7, 14, 30 i 100 dni temu trafiają kolejno do: bieżące, przed etapem 1, etap 1, 2, 3, 4, 4; Vitest pilnuje każdej granicy.
- Duplikat numeru i błędna kwota dostają polski komunikat pod polem; konto B nie widzi faktur A ani nie dopisze faktury do klienta A (smoke).
- Migracja i kod są na produkcji w kolejności baza → kod, a smoke przechodzi na `naleznosci.domblacha.workers.dev`.
