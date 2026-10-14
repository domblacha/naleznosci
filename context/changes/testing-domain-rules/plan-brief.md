# Reguły domenowe: etap, kwoty, ponaglenie — Plan Brief

> Full plan: `context/changes/testing-domain-rules/plan.md`
> Research: `context/changes/testing-domain-rules/research.md`

## What & Why

To faza 1 planu testów (ryzyka #1–#3). Celem jest wykazanie, że etap eskalacji,
odsetki, rekompensata i treść ponaglenia są poprawne na granicach. Wartości
oczekiwane pochodzą z PRD, z ustawy albo z ręcznych wyliczeń, nigdy z kodu, który
test sprawdza. Główna obawa właściciela (wywiad Q1) dotyczy złego etapu i
ponaglenia niezgodnego z listą.

## Starting Point

Reguły to czyste funkcje w `src/lib/` z szerokimi testami Vitest, które działają w
CI. Brakuje kilku przypadków brzegowych. Część asercji bierze oczekiwany wynik z
kodu produkcyjnego. `/invoices` i ponaglenie liczą kwoty w dwóch osobnych miejscach.

## Desired End State

Każda asercja w testach reguł porównuje wynik z literałem policzonym poza kodem.
Brakujące przypadki mają testy:
- progi z ustawień użytkownika na granicach;
- wznowienie po wstrzymaniu;
- dni zmiany czasu;
- odsetki w czasie wstrzymania i na dacie wpłaty;
- klient z fakturami w różnych stanach;
- suma liczona z zaokrąglonych pozycji;
- wybór szablonu dla etapów 1–4.

`/invoices` i ponaglenie liczą kwoty przez jedną funkcję. PRD podaje granice
progów rekompensaty.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Wyrocznia granic progów rekompensaty | Art. 10 ust. 1 ustawy, dopisany do Guardrails w PRD | PRD milczał, a ustawa to źródło niezależne od kodu, którego mogą używać kolejne testy | Plan |
| Zapłacone i anulowane w ponagleniu | Faza 2 (integration), bez filtra w regule | Gwarancję daje SQL `listOpenInvoices`, więc testujemy miejsce, które ją faktycznie zapewnia | Research → Plan |
| Zgodność `/invoices` z ponagleniem | Oba liczą przez `chargesAsOf` | Rozjazd staje się niemożliwy z konstrukcji kodu, bez testów komponentów | Research → Plan |
| Istniejące wyrocznie z kodu | Zamiana na literały, test różnicowy zostaje z kotwicami | Cały zestaw spełnia zasadę wyroczni z test-plan §1 | Research → Plan |
| Warstwa testów | Wyłącznie unit (Vitest) | Reguły są czyste i dostają „dziś” oraz ustawienia jako argumenty | Research |

## Scope

**In scope:**
- literały w `charges.test.ts`, `escalation.test.ts` i `reminder.test.ts`;
- nowe przypadki brzegowe etapu, kwot i ponaglenia;
- refaktor `reminder.ts` i `InvoicesManager.tsx` na `chargesAsOf`;
- punkt Guardrails w PRD;
- §6.1, §6.2 i §6.5 oraz notatka dla fazy 2 w `test-plan.md`.

**Out of scope:**
- filtr zapłaconych i anulowanych faktur (faza 2);
- testy komponentów i e2e;
- wyścig północy między stroną a API;
- zmiany szablonów, granic progów i stopy;
- `pausedOn: ""`.

## Architecture / Approach

Najpierw wzmacniamy siatkę bezpieczeństwa: literały w istniejących testach (faza 1)
i nowe przypadki (faza 2). Pod tą siatką robimy mały refaktor, po którym oba miejsca
liczenia kwot wołają `chargesAsOf(invoice, today, settings)` (faza 3).
`InvoiceGroups` dostaje w tym celu prop `today`. Na koniec testy kompozycji
ponaglenia (faza 4). Literały policzono skryptem ze wzoru z PRD
(`kwota × bp × dni / 3 650 000`, połowa w górę), bez `src/`. Rozbieżność z kodem
to znalezisko, a nie powód do poprawienia literału.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Wyrocznie z literałów | Testy bez wyroczni z kodu, granice progów w PRD | Literał niezgodny z kodem (wtedy to znalezisko) |
| 2. Brakujące przypadki etapu i kwot | Progi z ustawień, wznowienie, zmiana czasu, wstrzymanie, data wpłaty | Niewłaściwe chwile UTC dla zmiany czasu (sprawdzone przez `Intl`) |
| 3. Jedno źródło kwot | `/invoices` i ponaglenie liczą przez `chargesAsOf` | Regres wyświetlania na `/invoices` (ręczne porównanie przed i po) |
| 4. Zgodność ponaglenia | Fixture z fakturami w różnych stanach, suma z zaokrągleń, wybór szablonu, test-plan §6 | Fixture zbyt duży, żeby błąd był czytelny |

**Prerequisites:** świeży branch `feat/testing-domain-rules` z aktualnego `main`
(lessons.md). Do kroków ręcznych fazy 3 potrzebny jest lokalny Supabase z danymi.

**Estimated effort:** ok. 1–2 sesje w 4 małych fazach.

## Open Risks & Assumptions

- Brzmienie art. 10 ust. 1 przyjęto z komentarza w `charges.ts:31-33` i z wiedzy
  ogólnej. Faza 1 ma krok ręczny, który je potwierdza.
- Zakładamy, że `ReminderItem.daysOverdue` z `groupInvoices` równa się `days` z
  `chargesAsOf` dla etapów 1–4. To ta sama funkcja `daysOverdue`, a obcięcie do
  ≥ 0 nie działa przy dniach ≥ 1.

## Success Criteria (Summary)

- `npm test`, `npm run lint` i `npx astro check` są zielone, a żaden nowy ani
  poprawiony test nie bierze oczekiwanej wartości z kodu produkcyjnego.
- Kwoty na `/invoices` i w ponagleniu wyglądają tak samo jak przed zmianą i
  pochodzą z jednej funkcji.
- Kolejna osoba pisząca test reguły znajdzie wzorzec w test-plan §6.1–6.2.
