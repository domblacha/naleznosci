# Reguły domenowe: etap, kwoty, ponaglenie — plan wdrożenia

## Overview

Faza 1 planu testów (`context/foundation/test-plan.md` §3) obejmuje ryzyka #1, #2 i #3.
Celem jest wykazanie, że etap eskalacji, odsetki, rekompensata i treść ponaglenia są
poprawne na granicach. Oczekiwane wartości pochodzą z PRD, z ustawy albo z ręcznych
wyliczeń, nigdy z kodu, który test sprawdza.

Plan uzupełnia luki znalezione w research i zamienia wyrocznie biorące wynik z kodu
na literały. Dodatkowo `/invoices` i ponaglenie zaczynają liczyć kwoty przez tę samą
funkcję `chargesAsOf`.

## Current State Analysis

Źródło: `context/changes/testing-domain-rules/research.md`.

- Reguły to czyste funkcje w `src/lib/`:
  - etap: `escalationGroup` / `groupInvoices` (`src/lib/escalation.ts:42-75`);
  - kwoty: `interestGrosze`, `compensationGrosze`, `chargesAsOf` i `frozenChargesAsOf`
    (`src/lib/charges.ts:78-166`);
  - ponaglenie: `buildClientReminders` / `renderReminder` (`src/lib/reminder.ts:33-140`).
- Vitest (`environment: node`, `src/**/*.test.ts`) działa w CI przez `npm test`.
- „Dziś” liczy wyłącznie serwer (`todayInPoland(new Date())`), a wyspy React dostają
  je jako prop.
- Kwoty liczą dwa osobne miejsca, które wołają te same prymitywy:
  - `reminder.ts:46-52`;
  - `InvoicesManager.tsx:75-92`, w komponencie `InvoiceGroups`, który nie dostaje `today`.
- Wykluczenie faktur zapłaconych i anulowanych robi tylko SQL
  (`src/lib/services/invoices.ts:72-78`).
- Luki w testach:
  - progi niestandardowe na granicach;
  - przekazywanie progów przez `groupInvoices`;
  - wznowienie po długim wstrzymaniu;
  - `todayInPoland` w dniach zmiany czasu;
  - odsetki rosnące w czasie wstrzymania;
  - odsetki zatrzymane na dacie wpłaty;
  - klient z fakturami w różnych stanach;
  - suma liczona z zaokrąglonych pozycji;
  - wybór szablonu dla etapów 1–2.
- Wyrocznie biorące wynik z kodu: `charges.test.ts:81-87`, `:94-95`, `:101-103`,
  `:137-147`, `:173`, `escalation.test.ts:89` i `reminder.test.ts:70-71`.
- PRD nie podaje granic progów rekompensaty. Źródłem jest art. 10 ustawy, cytowany
  w komentarzu `charges.ts:31-33`.

## Desired End State

- Każda asercja w `escalation.test.ts`, `charges.test.ts` i `reminder.test.ts`
  porównuje wynik z literałem policzonym poza kodem aplikacji. Wyjątek: test
  różnicowy `frozenChargesAsOf` vs `chargesAsOf` zostaje, ale dostaje literałowe
  kotwice.
- Wszystkie przypadki z listy luk mają test.
- `/invoices` i ponaglenie liczą odsetki i rekompensatę przez `chargesAsOf`.
  Na ekranie nic się nie zmienia.
- PRD (Guardrails) podaje granice progów rekompensaty.
- `test-plan.md`: sekcje §6.1–6.2 są wypełnione, a w §3
  jest notatka dla fazy 2 o filtrze zapłaconych i anulowanych.

Weryfikacja: `npm test`, `npm run lint` i `npx astro check` są zielone. Ręcznie
porównuję kwoty na `/invoices` i `/` przed refaktorem i po nim.

### Key Discoveries:

- `escalationGroup` traktuje progi jako włączne, a etap 4 nie ma górnej granicy
  (`escalation.ts:44-49`). Wstrzymanie wyprzedza sprawdzenie etapu
  (`escalation.ts:65`).
- `chargesAsOf` liczy dni przez `daysOverdue`, obcina je do ≥ 0 i nie zna stanu
  wstrzymania (`charges.ts:112-128`). Dzięki temu liczy odsetki także dla faktur
  wstrzymanych.
- `renderReminder` przyjmuje parametr `templates` (`reminder.ts:124`). Wybór
  szablonu da się więc sprawdzić na własnych szablonach-znacznikach, bez
  kopiowania treści z `REMINDER_TEMPLATES`.
- `InvoiceGroups` jest renderowany dwa razy, w zakładkach Eskalacja i Wstrzymane
  (`InvoicesManager.tsx:251,264`). `InvoicesManager` ma `today` w propsach (`:125`).

## What We're NOT Doing

- **Wykluczenia zapłaconych i anulowanych faktur z ponaglenia nie testujemy w tej
  fazie.** Gwarancję daje SQL w `listOpenInvoices`. Sprawdzi to faza 2 na prawdziwej
  bazie. `buildClientReminders` nie dostaje filtra.
- Nie dodajemy testów komponentów React ani e2e. Zgodność `/invoices` z ponagleniem
  wynika z jednej funkcji (faza 3), a nie z testu UI.
- Nie testujemy wyścigu północy między `today` strony a `today` API ani karty
  otwartej po północy (research, Open Questions 5).
- Nie zmieniamy treści szablonów ponagleń ani sposobu ich formatowania.
- Nie zmieniamy granic progów rekompensaty ani domyślnej stopy. PRD dostaje tylko
  opis istniejących granic.
- Nie przypinamy testem zachowania `pausedOn: ""`. Kod i komentarz dają ten sam
  wynik.

## Implementation Approach

Kolejność jest celowa:

1. Fazy 1–2 dotykają tylko testów (oraz PRD) i wzmacniają siatkę bezpieczeństwa
   literałami.
2. Faza 3 robi mały refaktor kodu aplikacji pod tą siatką.
3. Faza 4 dodaje testy kompozycji ponaglenia na już ujednoliconym liczeniu kwot i
   zamyka fazę w `test-plan.md`.

Wartości oczekiwane podane niżej policzono osobnym skryptem ze wzoru z PRD:
`kwota × bp × dni / 3 650 000`, zaokrąglenie połowa w górę. Nie korzystano przy tym
z `src/`. Implementujący przepisuje je jako literały i nie przelicza ich funkcjami
produkcyjnymi.

## Critical Implementation Details

- **Oracle discipline.** W nowych i poprawianych testach nie wolno budować
  oczekiwanego wyniku wywołaniem funkcji z `src/lib/charges.ts`, `escalation.ts` ani
  `reminder.ts`, ani importem `DEFAULT_*` / `REMINDER_TEMPLATES`, chyba że w roli
  wejścia. Jeśli literał z planu nie zgadza się z wynikiem kodu, to jest znalezisko:
  zatrzymaj się i zgłoś je, zamiast poprawiać literał pod kod.

## Phase 1: Wyrocznie z literałów

### Overview

Istniejące asercje, które biorą oczekiwany wynik z kodu produkcyjnego, dostają
ręcznie policzone literały. PRD dostaje granice progów rekompensaty.

### Changes Required:

#### 1. Testy kwot

**File**: `src/lib/charges.test.ts`

**Intent**: Usunąć wyrocznie liczone przez kod i tautologie. Wpisać do testów
granic progów źródło: art. 10 ust. 1 ustawy o przeciwdziałaniu nadmiernym
opóźnieniom w transakcjach handlowych.

**Contract**:
- `:81-87`: `chargesAsOf(invoice 123456 gr, termin 2026-09-01, "2026-10-11")` ma
  zwrócić `{ days: 40, interestGrosze: 1860, compensationGrosze: 17000 }` jako
  literał.
- `:94-96`: usunąć porównanie `f(x)` z `f(x)`. Asercja dla `"2026-09-11"` to
  `{ days: 10, interestGrosze: 465, compensationGrosze: 17000 }`.
- `:101-103`:
  - `DEFAULT_ESCALATION_SETTINGS` porównać z literałem
    `{ thresholds: [3,7,14,30], annualRateBp: 1375, compensationGrosze: [17000, 29750, 42500] }`.
    Progi dni pochodzą z PRD FR-005, a stopa i kwoty z ustawy (40/70/100 EUR po
    ok. 4,25 zł).
  - `chargeSettingsFrom(DEFAULT_ESCALATION_SETTINGS)` porównać z literałem progów:
    `500000` (włącznie) → 17000, `5000000` (wyłącznie) → 29750, bez granicy → 42500.
- `:45`: tytuł albo komentarz cytuje przepis: „nie przekracza 5 000 zł” / „wyższa
  niż 5 000 zł i niższa niż 50 000 zł” / „równa lub wyższa niż 50 000 zł”.
- `:137-147`: test różnicowy zostaje. Obok dochodzą literałowe kotwice dla
  ustawień `custom` (1000 bp, 10000/20000/30000) i dnia `"2026-10-11"` (40 dni):
  - 123456 gr → `{40, 1353, 10000}`;
  - 650000 gr → `{40, 7123, 20000}`;
  - 5000000 gr → `{40, 54795, 30000}`;
  - 650000 gr, klient bez rekompensaty → `{40, 7123, 0}`.
- `:172-173`: zamiast porównania z `chargesAsOf` dwa literały dla `invoices[0]`
  w dniu `"2026-10-11"`:
  - wynik z migawki (domyślne ustawienia) to `{ days: 40, interestGrosze: 1860, compensationGrosze: 17000 }`;
  - bieżący wynik po zmianie na `custom` to `{ days: 40, interestGrosze: 1353, compensationGrosze: 10000 }`.

#### 2. Testy etapu

**File**: `src/lib/escalation.test.ts`

**Intent**: Usunąć tautologię determinizmu w `:89`.

**Contract**: Test „jest deterministyczne i nie zmienia wejścia” zachowuje tylko
asercję o niezmienionym wejściu. Porównanie `groupInvoices(...)` z
`groupInvoices(...)` znika.

#### 3. Test ponaglenia z wyrocznią względną

**File**: `src/lib/reminder.test.ts`

**Intent**: Zamienić `expected = buildClientReminders([active])` (`:70-71,75`) na
literał.

**Contract**: Faktura A/1 to 123456 gr z terminem 2026-08-20, a TODAY to
2026-10-05, czyli 46 dni. Ponaglenie ma `stage: 4` i jedną pozycję
`{ daysOverdue: 46, interestGrosze: 2139, compensationGrosze: 17000 }`. Sumy:
`principalGrosze: 123456`, `interestGrosze: 2139`, `compensationGrosze: 17000`,
`totalGrosze: 142595`.

#### 4. PRD

**File**: `context/foundation/prd.md`

**Intent**: Uzupełnić Guardrails o granice progów rekompensaty, żeby kolejne testy
miały wyrocznię w PRD.

**Contract**: Nowy punkt w `### Guardrails` (po linii 43):
- próg 1: wartość faktury nie przekracza 5 000 zł;
- próg 2: wartość wyższa niż 5 000 zł i niższa niż 50 000 zł;
- próg 3: wartość równa lub wyższa niż 50 000 zł;
- źródło: art. 10 ust. 1 ustawy o przeciwdziałaniu nadmiernym opóźnieniom w
  transakcjach handlowych;
- granice są stałe, a użytkownik zmienia tylko kwoty (FR-009).

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- W zmienionych testach nie zostało porównanie wyniku funkcji z jej własnym
  wywołaniem: `grep -nE "toEqual\((chargesAsOf|groupInvoices|buildClientReminders|interestGrosze|compensationGrosze)\(" src/lib/charges.test.ts src/lib/escalation.test.ts src/lib/reminder.test.ts`
  zwraca tylko linie testu różnicowego (`:137-147`)

#### Manual Verification:

- Nowy punkt Guardrails w PRD ma brzmienie zgodne z art. 10 ust. 1 ustawy

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na
ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Brakujące przypadki etapu i kwot

### Overview

Testy w `escalation.test.ts` i `charges.test.ts` dla luk z ryzyk #1 i #3.

### Changes Required:

#### 1. Etap

**File**: `src/lib/escalation.test.ts`

**Intent**: Pokryć progi z ustawień, wznowienie po wstrzymaniu i dni zmiany czasu.

**Contract**: nowe przypadki:
- `escalationGroup` z progami `[5, 10, 20, 40]`:
  - 4 dni → `pre_threshold`;
  - 5 i 9 → `stage_1`;
  - 10 i 19 → `stage_2`;
  - 20 i 39 → `stage_3`;
  - 40 i 365 → `stage_4`.
- `groupInvoices` przekazuje progi: faktura 4 dni po terminie trafia do `stage_1`
  przy progach domyślnych i do `pre_threshold` przy `[5, 10, 20, 40]`.
- Wznowienie: ta sama faktura 40 dni po terminie z `pausedOn` ustawionym trafia do
  `paused`, a z `pausedOn: null` do `stage_4`. Etapy 1–3 są pominięte (FR-013).
- `todayInPoland` w dniach zmiany czasu:
  - `2026-03-28T22:59:59Z` → `"2026-03-28"`, `2026-03-28T23:00:00Z` → `"2026-03-29"`
    (przejście na czas letni 29.03);
  - `2026-10-24T21:59:59Z` → `"2026-10-24"`, `2026-10-24T22:00:00Z` → `"2026-10-25"`;
  - `2026-10-25T22:59:59Z` → `"2026-10-25"`, `2026-10-25T23:00:00Z` → `"2026-10-26"`
    (powrót do czasu zimowego 25.10).

#### 2. Kwoty

**File**: `src/lib/charges.test.ts`

**Intent**: Pokryć odsetki w czasie wstrzymania i odsetki zatrzymane na dacie
wpłaty.

**Contract**: nowe przypadki:
- Wstrzymanie nie zatrzymuje odsetek. Faktura 123456 gr z terminem 2026-09-01 i
  `pausedOn: "2026-09-15"` (dodatkowe pole na wejściu). `chargesAsOf` na
  `"2026-10-11"` daje `{ days: 40, interestGrosze: 1860, compensationGrosze: 17000 }`,
  tyle samo co bez wstrzymania (FR-007).
- Odsetki stają na dacie wpłaty. Faktura 100000 gr z terminem 2026-09-01 zapłacona
  `"2026-09-11"`, z migawką `{ rateBp: 1375, compensationGrosze: 17000 }`:
  - `frozenChargesAsOf(..., "2026-09-11")` daje `{ days: 10, interestGrosze: 377, compensationGrosze: 17000 }`;
  - komentarz w teście mówi, że historia podaje `paidOn` jako `asOf`
    (`PaidInvoicesManager.tsx:90`), więc późniejsze „dziś” nie wpływa na wynik.
- Połowa w górę przy stopie domyślnej i wielu dniach:
  - `interestGrosze(400000, 30)` → 4521 (dokładnie 4520,5479);
  - `interestGrosze(100000, 7)` → 264 (263,6986).

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Lint przechodzi: `npm run lint`

**Implementation Note**: Po zielonej weryfikacji automatycznej przejdź do fazy 3.
Faza nie ma kroków ręcznych.

---

## Phase 3: Jedno źródło kwot

### Overview

`buildClientReminders` i `/invoices` liczą odsetki i rekompensatę przez
`chargesAsOf`. Dzięki temu nie mogą się rozjechać.

### Changes Required:

#### 1. Ponaglenie

**File**: `src/lib/reminder.ts`

**Intent**: Zastąpić bezpośrednie wywołania `interestGrosze` i `compensationGrosze`
(`:46-52`) jednym wywołaniem `chargesAsOf(invoice, today, settings)`.

**Contract**:
- Sygnatura `buildClientReminders` się nie zmienia.
- `ReminderItem.daysOverdue` dalej pochodzi z `groupInvoices`. Dla etapów 1–4 jest
  równe `days` z `chargesAsOf`.

#### 2. Lista faktur

**File**: `src/components/invoices/InvoicesManager.tsx`

**Intent**: `InvoiceGroups` liczy kwoty wiersza przez
`chargesAsOf(invoice, today, chargeSettings)` zamiast wołać `interestGrosze` i
`compensationGrosze` (`:75-92`).

**Contract**:
- `InvoiceGroupsProps` dostaje `today: string`.
- Oba miejsca renderowania (`:251`, `:264`) przekazują `today` z propsów
  `InvoicesManager`.
- Warunek `daysOverdue <= 0 ? "—"` zostaje bez zmian.
- Nieużywane importy `interestGrosze` i `compensationGrosze` znikają.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą bez zmian w testach: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- W komponentach nie ma bezpośrednich wywołań prymitywów kwot:
  `grep -rnE "interestGrosze\(|compensationGrosze\(" src/components src/lib/reminder.ts`
  nie zwraca nic poza `src/components/dev/`

#### Manual Verification:

- Na `/invoices` odsetki i rekompensata faktur przeterminowanych oraz wstrzymanych
  są takie same jak przed zmianą. Zanotuj 2–3 wiersze przed refaktorem i porównaj.
  Faktury bieżące dalej pokazują „—”.
- Na `/` suma ponaglenia i treść w dialogu „Generuj ponaglenie” są takie same jak
  przed zmianą

**Implementation Note**: Przed ręczną weryfikacją i po niej ubij dev server na
porcie 4321 (lessons.md). Zatrzymaj się na ręczne potwierdzenie przed fazą 4.

---

## Phase 4: Zgodność ponaglenia

### Overview

Testy kompozycji ponaglenia dla ryzyka #2 i zamknięcie fazy w `test-plan.md`.

### Changes Required:

#### 1. Klient z fakturami w różnych stanach

**File**: `src/lib/reminder.test.ts`

**Intent**: Jeden scenariusz pokazuje, że ponaglenie bierze dokładnie faktury z
etapów 1–4, ma ton najwyższego etapu i sumę równą sumie pozycji. Drugi klient nie
ma rekompensaty.

**Contract**: TODAY `"2026-10-14"`, ustawienia domyślne.

Klient A (z rekompensatą):

| Faktura | Kwota (gr) | Termin | Dni | Etap / stan |
|---|---|---|---|---|
| A1 | 100000 | 2026-10-11 | 3 | etap 1 |
| A2 | 200000 | 2026-10-07 | 7 | etap 2 |
| A3 | 300000 | 2026-09-30 | 14 | etap 3 |
| A4 | 400000 | 2026-09-14 | 30 | etap 4 |
| A5 | 999900 | 2026-09-04 | 40 | wstrzymana |
| A6 | 50000 | 2026-10-12 | 2 | sprzed progu |
| A7 | 70000 | 2026-10-14 | 0 | bieżąca |

Oczekiwane ponaglenie dla A:
- pozycje w kolejności A4, A3, A2, A1;
- `stage: 4`;
- odsetki pozycji: A4 4521, A3 1582, A2 527, A1 113;
- rekompensata 17000 na każdej pozycji;
- `principalGrosze: 1000000`, `interestGrosze: 6743`, `compensationGrosze: 68000`,
  `totalGrosze: 1074743`.

Klient B (bez rekompensaty):

| Faktura | Kwota (gr) | Termin | Dni | Etap |
|---|---|---|---|---|
| B1 | 100000 | 2026-10-07 | 7 | etap 2 |
| B2 | 100000 | 2026-10-10 | 4 | etap 1 |

Oczekiwane ponaglenie dla B:
- `stage: 2`;
- pozycje B1, B2 z odsetkami 264 i 151;
- rekompensata 0;
- `totalGrosze: 200415`;
- tekst z `renderReminder` nie zawiera „rekompensat”.

Kolejność ponagleń: A, potem B (wyższy etap pierwszy).

#### 2. Suma z zaokrąglonych pozycji

**File**: `src/lib/reminder.test.ts`

**Intent**: Przypiąć regułę „suma = suma pozycji po zaokrągleniu” (PRD US-01:
kwoty zaokrąglone do grosza, treść kończy suma) na przypadku, w którym zaokrąglenie
sumy dałoby inny wynik.

**Contract**:
- Ustawienia: `chargeSettingsFrom({ thresholds: [3,7,14,30], annualRateBp: 1000, compensationGrosze: [10000, 20000, 30000] })`.
  Ustawienia w roli wejścia są dozwolone.
- Dwie faktury po 730 gr, 3 dni po terminie. Odsetki każdej to 0,6 gr → 1 gr.
- Ponaglenie: `interestGrosze: 2` (nie 1), `totalGrosze: 21462`.
- Wyrenderowana linia to `Odsetki: 0,02${NB}zł` (konwencja `NB` z
  `reminder.test.ts:8`).

#### 3. Wybór szablonu dla etapów 1–4

**File**: `src/lib/reminder.test.ts`

**Intent**: Sprawdzić, że `renderReminder` wybiera szablon etapu ponaglenia, bez
kopiowania treści `REMINDER_TEMPLATES`.

**Contract**: Własne szablony `{1: "ETAP1 {klient}", 2: "ETAP2 {klient}", 3: "ETAP3 {klient}", 4: "ETAP4 {klient}"}`.
Ponaglenia z etapami 1, 2, 3 i 4 (np. pojedyncza faktura 3, 7, 14 i 30 dni po
terminie) renderują się jako `"ETAP<n> <nazwa klienta>"`.

#### 4. Plan testów

**File**: `context/foundation/test-plan.md`

**Intent**: Zamknąć fazę 1 w orkiestratorze i przekazać fazie 2 część ryzyka #2,
której unit nie widzi.

**Contract**:
- §3: kolumny Status nie zmieniamy ręcznie, bo aktualizuje ją orkiestrator
  `/10x-test-plan` na podstawie artefaktów.
- §3: wiersz fazy 2 ma dopisany cel „ponaglenie i lista nie obejmują faktur
  zapłaconych ani anulowanych (filtr `listOpenInvoices`)”.
- §6.1: wzorzec testu reguły. Literał z wyliczenia wzorem z PRD (skrypt poza `src/`),
  granice próg−1/próg, progi niestandardowe, nigdy wynik funkcji produkcyjnej jako
  oczekiwanie.
- §6.2: wzorzec testu ponaglenia. Fixture klienta z fakturami w różnych stanach,
  asercje na pozycje, ton, sumę i brak rekompensaty, szablony-znaczniki do wyboru
  etapu.
- §6.5: notatka fazy 1, w tym przeniesienie filtra zapłaconych i anulowanych do
  fazy 2.
- „Last updated” zmienia się na datę zamknięcia.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- `test-plan.md` §3, §6.1, §6.2 i §6.5 opisują wzorce zgodnie z tym, co faktycznie
  powstało w testach

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na
ręczne potwierdzenie zamknięcia fazy.

---

## Testing Strategy

### Unit Tests:

- Etap: granice progów domyślnych (już są) i niestandardowych, przekazywanie progów,
  wstrzymanie i wznowienie, północ i zmiana czasu w Warszawie.
- Kwoty: literały z PRD i ustawy, połowa w górę, migawka, wstrzymanie, data wpłaty.
- Ponaglenie: klient z fakturami w różnych stanach, klient bez rekompensaty, suma z
  zaokrąglonych pozycji, wybór szablonu.

### Integration Tests:

- Brak w tej fazie. Filtr zapłaconych i anulowanych faktur przechodzi do fazy 2.

### Manual Testing Steps:

1. Przed fazą 3 zanotuj z `/invoices` odsetki i rekompensatę 2–3 faktur
   przeterminowanych i jednej wstrzymanej oraz sumę jednego ponaglenia z `/`.
2. Po fazie 3 porównaj te same wartości.
3. Sprawdź, że faktury bieżące na `/invoices` dalej pokazują „—”.

## Performance Considerations

Brak. `chargesAsOf` liczy dni ponownie (jedno odejmowanie dat na wiersz), co jest
pomijalne.

## Migration Notes

Nie dotyczy. Bez zmian w bazie.

## References

- Research: `context/changes/testing-domain-rules/research.md`
- Plan testów: `context/foundation/test-plan.md` (§2 ryzyka #1–#3, §3 faza 1, §6)
- PRD: `context/foundation/prd.md` (Guardrails, FR-005, FR-007, FR-008, FR-009,
  FR-013, US-01)
- Reguły: `src/lib/escalation.ts:26-75`, `src/lib/charges.ts:36-166`,
  `src/lib/reminder.ts:33-140`
- Miejsca liczenia kwot: `src/components/invoices/InvoicesManager.tsx:49-92,251,264`
- Lessons: `context/foundation/lessons.md` (dev server, nowy branch z aktualnego main)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Wyrocznie z literałów

#### Automated

- [x] 1.1 Testy jednostkowe przechodzą: `npm test`
- [x] 1.2 Lint przechodzi: `npm run lint`
- [x] 1.3 W zmienionych testach nie zostało porównanie wyniku funkcji z jej własnym wywołaniem (poza testem różnicowym)

#### Manual

- [x] 1.4 Nowy punkt Guardrails w PRD ma brzmienie zgodne z art. 10 ust. 1 ustawy

### Phase 2: Brakujące przypadki etapu i kwot

#### Automated

- [ ] 2.1 Testy jednostkowe przechodzą: `npm test`
- [ ] 2.2 Lint przechodzi: `npm run lint`

### Phase 3: Jedno źródło kwot

#### Automated

- [ ] 3.1 Testy jednostkowe przechodzą bez zmian w testach: `npm test`
- [ ] 3.2 Lint przechodzi: `npm run lint`
- [ ] 3.3 Typy przechodzą: `npx astro check`
- [ ] 3.4 W komponentach nie ma bezpośrednich wywołań prymitywów kwot (poza `src/components/dev/`)

#### Manual

- [ ] 3.5 Na `/invoices` kwoty faktur przeterminowanych i wstrzymanych są takie same jak przed zmianą, bieżące pokazują „—”
- [ ] 3.6 Na `/` suma ponaglenia i treść w dialogu są takie same jak przed zmianą

### Phase 4: Zgodność ponaglenia

#### Automated

- [ ] 4.1 Testy jednostkowe przechodzą: `npm test`
- [ ] 4.2 Lint przechodzi: `npm run lint`

#### Manual

- [ ] 4.3 `test-plan.md` §3, §6.1, §6.2 i §6.5 opisują wzorce zgodnie z tym, co faktycznie powstało w testach
