# Frame Brief: Ponaglenia na `/`, faktury na osobnej podstronie

> Etap ramowania przed /10x-plan. Dokument oddziela to, o co faktycznie
> chodzi, od tego, co założono na starcie.

## Reported Observation

`/` („Faktury”) to jedna wyspa React: przycisk „Dodaj fakturę” nad tabami Ponaglenia (domyślny) · Eskalacja · Wstrzymane (`src/components/invoices/InvoicesManager.tsx:248-283`). Pytanie użytkownika: czy przenieść ponaglenia na `/`, a faktury na osobną podstronę z tabami Eskalacja i Wstrzymane, oraz czy i jak bardzo odbiegałoby to od założeń.

## Initial Framing (preserved)

- **Stated cause / approach**: ponaglenia to inna czynność niż zarządzanie fakturami, więc powinny mieć własną stronę główną.
- **Proposed direction**: `/` = Ponaglenia; nowa `/faktury` z tabami Eskalacja · Wstrzymane.
- **Pre-dispatch narrowing**: „Za dużo na jednej stronie”. Przebieg pracy: „częściej ponaglenia niż samo zarządzanie fakturami czy ich podgląd”.

## Dimension Map

1. **Zgodność z PRD**: PRD mógłby wiązać ponaglenia i listę faktur w jednym widoku.
2. **Zgodność z decyzjami `ux-improvement`**: podział mógłby odwracać decyzje świeżo wdrożonego planu (domyślny tab, stan taba).
3. **Sprzężenie przepływu i stanu**: ponaglenia i akcje na fakturach (zapłata, wstrzymanie) mogą być powiązane tak ciasno, że osobne strony pogorszą pracę. ← ryzyko w ujęciu użytkownika
4. **Konwencje i powierzchnia zmiany**: routing, menu, middleware, puste stany, nazewnictwo tras.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1. PRD wymaga jednego widoku | FR-010 (`prd.md:126`) wymaga listy otwartych faktur pogrupowanej na bieżące, przed progiem, etapy 1–4 i wstrzymane. Tab Eskalacja + Wstrzymane na podstronie faktur spełnia to w całości. FR-011 (`prd.md:132`) nie mówi, gdzie generuje się ponaglenie. Jedyne luźne powiązanie to sformułowanie US-01 „otwiera listę faktur i generuje ponaglenie” (`prd.md:51`) — opis scenariusza, nie wymóg układu. PRD w ogóle nie definiuje tras. | NONE (konflikt) |
| 2. Odwraca decyzje `ux-improvement` | Decyzja „Ponaglenia domyślny — od razu widać, komu wysłać ponaglenie” (`plan-brief.md:22`) zostaje zachowana, a nawet wzmocniona: ponaglenia są pierwszym ekranem po zalogowaniu, bez polegania na `defaultValue`. „Stan taba tylko lokalny” (`:24`) i reguły fokusu/liczników (`:26-27`) dotyczą stron z tabami, więc dla faktur obowiązują dalej. Zmienia się tylko lista tabów w `change.md`: „faktury: eskalacja, ponaglenia, wstrzymane”. Zmiana `ux-improvement` jest `implemented`, ale jeszcze nie zarchiwizowana ani nie zmergowana (branch `feat/ux-improvement`). | WEAK (korekta, nie odwrócenie) |
| 3. Ciasne sprzężenie przepływu | Tab Ponaglenia nie ma akcji na wierszach: tylko „Generuj ponaglenie” (`RemindersSection.tsx:55-60`). Zapłata i wstrzymanie są już dziś w innym tabie, więc wymagają przełączenia. Po podziale przełączenie taba zamienia się w nawigację, a SSR przy wejściu na stronę wczytuje świeże dane — zgodność liczników ze stanem nie wymaga wspólnej wyspy. Licznik ponagleń jest liczony z tego samego `invoices` (`InvoicesManager.tsx:153-155`), więc każda strona musi nadal wczytywać otwarte faktury. Użytkownik deklaruje, że przeważają ponaglenia, więc przeskoki są rzadkie. Drobne ryzyko: przycisk „Wstecz” po akcji na podstronie może przywrócić z bfcache nieaktualne ponaglenia. | WEAK |
| 4. Konwencje i powierzchnia | Trasy są po angielsku (`/clients`, `/history`, `/settings` — `middleware.ts:6`), więc `/faktury` łamie konwencję; spójnie byłoby `/invoices`. Trzeba dodać trasę do `PROTECTED_ROUTES`, bo `/` ma osobne exact match (`middleware.ts:27`). Menu dochodzi do 5 pozycji (`Topbar.astro:7-12`), więc trzeba sprawdzić drugi wiersz na mobile. Globalne puste stany („Najpierw dodaj klienta”, „Nie masz otwartych faktur” + „Dodaj fakturę”, `InvoicesManager.tsx:202-224`) trzeba rozdzielić: na `/` brak przycisku „Dodaj fakturę”, chyba że zostanie link. Przekierowania auth na `/` (smoke `:100,679,683`) zostają poprawne. Do zmiany jest też tabela tras w README. | STRONG (koszt realny, ale ograniczony i mechaniczny) |

## Narrowing Signals

- Użytkownik wskazał przeładowanie strony („za dużo na jednej stronie”), a nie problem z nazwą czy widocznością. To czyni podział na dwie strony odpowiedzią wprost, a nie obejściem.
- Przewaga ponagleń w codziennej pracy oznacza, że `/` = Ponaglenia trafia w główną czynność, a koszt nawigacji do faktur pojawia się rzadko.
- Brak akcji na wierszach w Ponagleniach: dzisiejsza „jedna strona” nie daje przepływu bez przełączania, więc podział go nie psuje.

## Cross-System Convention

Aplikacje typu „inbox + rejestr” (do zrobienia dziś vs. zarządzanie danymi) zwykle rozdzielają te dwa miejsca, a ekran startowy daje czynności codziennej. Wiodąca hipoteza jest z tym zgodna. W tym projekcie konwencja tras jest anglojęzyczna — to jedyny element propozycji, który od niej odbiega.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: `/` łączy dwie czynności o różnej częstotliwości — codzienne wysyłanie ponagleń i okazjonalne zarządzanie fakturami — przez co strona jest przeładowana.

Wstępne ujęcie się potwierdziło. Podział jest zgodny z PRD (żaden wymóg nie wiąże ponagleń i listy w jednym widoku) i z intencją `ux-improvement` (ponaglenia na pierwszym ekranie). Odbiega od niego tylko w jednym punkcie: lista tabów na `/` z trzech robi się dwoma stronami. Jedyna korekta propozycji to nazwa trasy: `/invoices` zamiast `/faktury`, dla spójności z istniejącymi trasami. Etykieta w menu może pozostać po polsku.

## Confidence

**HIGH** — PRD i decyzje planu sprawdzone w źródłach, sygnał od użytkownika jest jednoznaczny, a ryzyka (bfcache, puste stany, 5 pozycji menu) są konkretne i lokalne.

## What Changes for /10x-plan

Plan ma dotyczyć podziału `InvoicesManager` na dwie strony: `/` z Ponagleniami i `/invoices` z tabami Eskalacja · Wstrzymane. W planie trzeba rozstrzygnąć: etykiety menu i ich kolejność (5 pozycji, mobile), puste stany na `/`, ochronę nowej trasy w middleware, świeżość danych po powrocie przez „Wstecz” oraz README/smoke. Trzeba też zdecydować, czy zrobić to na branchu `feat/ux-improvement` przed merge, czy jako osobną zmianę po nim.

## References

- `src/components/invoices/InvoicesManager.tsx:140-155,202-283`
- `src/components/invoices/RemindersSection.tsx:19-60`
- `src/components/Topbar.astro:7-12`, `src/middleware.ts:6,27`, `scripts/smoke.mjs:100,659-694`
- `context/foundation/prd.md:48-57,126,132`
- `context/changes/ux-improvement/plan-brief.md:22-28`, `context/changes/ux-improvement/change.md` (ta sama zmiana — podział dorabiany jako kolejna faza)
- Investigation: inline (bez sub-agentów — powierzchnia mała, dowody zebrane bezpośrednio)
