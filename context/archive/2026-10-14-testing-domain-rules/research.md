---
date: 2026-10-14T17:37:14+02:00
researcher: Claude (Opus 5.5) dla Dominik Blacha
git_commit: 8e1ebc7f9a7c5f8d944f85cca1a4952a435d6ddd
branch: main
repository: 10x-kurs
topic: "Faza 1 planu testów: reguły domenowe — etap, kwoty, ponaglenie (ryzyka #1, #2, #3)"
tags: [research, testing, escalation, charges, reminder, vitest]
status: complete
last_updated: 2026-10-14
last_updated_by: Claude (Opus 5.5)
---

# Research: reguły domenowe — etap, kwoty, ponaglenie

**Date**: 2026-10-14T17:37:14+02:00
**Researcher**: Claude (Opus 5.5) dla Dominik Blacha
**Git Commit**: 8e1ebc7f9a7c5f8d944f85cca1a4952a435d6ddd
**Branch**: main
**Repository**: 10x-kurs

## Research Question

Faza 1 z `context/foundation/test-plan.md` §3: „Dowieść, że etap, kwoty i treść
ponaglenia są poprawne na granicach wg niezależnych wyroczni i że ponaglenie
zgadza się z listą” (ryzyka #1, #2, #3). Research ma ugruntować kolumnę
„Context `/10x-research` must ground” z §2 Risk Response Guidance:

- #1: skąd widoki biorą „dziś” i ustawienia; czy istnieją ścieżki liczące etap
  poza wspólną regułą; które przypadki brzegowe już są pokryte.
- #2: jak lista i ponaglenie dostają dane i ustawienia; czy mogą się rozjechać;
  co jest liczone w przeglądarce, a co na serwerze.
- #3: gdzie powstaje i jest czytana migawka przy wpłacie; jak cofnięcie wpłaty
  obchodzi się z migawką; jednostki.

## Summary

- **Reguła jest jedna i czysta.** Etap liczy wyłącznie `escalationGroup`
  (`src/lib/escalation.ts:42-50`), wywoływane tylko z `groupInvoices`
  (`escalation.ts:53-75`). Kwoty liczą `interestGrosze` / `compensationGrosze`
  (`src/lib/charges.ts:78-103`). W `src/` (bez testów) nie znaleziono
  zduplikowanej logiki dni, progów ani zaokrągleń. Jedynym duplikatem jest
  jednorazowy backfill w migracji `20261010130000_add_invoice_payment_snapshot.sql`,
  oznaczony komentarzem w `charges.ts:34-35`.
- **„Dziś” liczy się tylko na serwerze.** Wszystkie wywołania `todayInPoland(new Date())`
  w przejrzanych plikach są w frontmatterze stron (`index.astro:38`,
  `invoices.astro:34`, `history.astro:26`) albo w trasach API/serwisach. Wyspy
  React dostają `today` jako prop. W komponentach nie ma `new Date` ani `Date.now`.
- **Lista na `/` i ponaglenie nie mogą się rozjechać.** Oba pochodzą z tego
  samego obiektu `ClientReminder`, tworzonego raz przez `buildClientReminders`
  (`RemindersManager.tsx:24-27`). Tabela (`RemindersSection.tsx:45-50`) i dialog
  (`ReminderDialog.tsx:116`) czytają ten sam obiekt. Rozjechać mogą się natomiast
  **lista `/invoices` i ponaglenie**: to dwa osobne miejsca wywołujące te same
  prymitywy (`InvoicesManager.tsx:75-92` i `reminder.ts:46-52`).
- **Wykluczenie zapłaconych i anulowanych faktur nie jest częścią reguły.**
  Odfiltrowuje je tylko SQL w `listOpenInvoices` (`src/lib/services/invoices.ts:72-78`).
  `buildClientReminders` i `groupInvoices` nie czytają `paidOn` ani
  `cancelledOn`. Test jednostkowy fazy 1 nie zobaczy tej części ryzyka #2.
- **Istniejące testy są szerokie.** Mają pokrycie granic progów domyślnych,
  północy Warsaw/UTC, zaokrąglenia połowa w górę, krawędzi progów rekompensaty,
  migawki i danych nadawcy. Luki to: niestandardowe progi na granicach,
  wznowienie po długim wstrzymaniu, odsetki rosnące w czasie wstrzymania,
  zatrzymanie odsetek na dacie wpłaty w jednym scenariuszu, klient z mieszanką
  stanów, suma ≠ zaokrąglenie sumy oraz tytuły etapów 1–2. Kilka asercji bierze
  wyrocznię z kodu produkcyjnego (szczegóły niżej).

## Detailed Findings

### Reguła etapu (ryzyko #1)

- `todayInPoland(now)` formatuje datę w strefie `Europe/Warsaw` przez
  `Intl.DateTimeFormat` (`escalation.ts:19-30`).
- `daysOverdue(dueDate, today)` liczy różnicę dat kalendarzowych przez
  `Date.UTC`, więc zmiana czasu nie przesuwa wyniku (`escalation.ts:32-40`).
- Semantyka `escalationGroup` (`escalation.ts:42-50`):
  - `days <= 0` → `current`;
  - progi są włączne (`days >= t1` → `stage_1` … `days >= t4` → `stage_4`);
  - `1..t1-1` → `pre_threshold`;
  - etap 4 nie ma górnej granicy.
- Stan wstrzymania: w `groupInvoices` pozycja z prawdziwym (truthy) `pausedOn`
  trafia do grupy `paused`, zanim sprawdzi się etap. `daysOverdue` liczy się
  nadal (`escalation.ts:64-67`). Etap nie jest nigdzie zapisywany, więc po
  wznowieniu wynika z bieżących dni (FR-013) z konstrukcji kodu.
- Ustawienia:
  - `getSettings` czyta wiersz `user_settings`, a gdy go nie ma, zwraca
    `DEFAULT_ESCALATION_SETTINGS` (`src/lib/services/settings.ts:43-47`).
  - `index.astro` i `invoices.astro` ładują ustawienia na każde żądanie.
  - Błąd ładowania ustawia `loadError` i wyspa się nie renderuje, więc nie
    pokazuje po cichu wartości domyślnych (`index.astro:28-37`).
  - `RemindersManager.tsx:25` i `InvoicesManager.tsx:140` przekazują
    `settings.thresholds`.
- `escalationGroup`, `groupInvoices` i `buildClientReminders` mają domyślne
  wartości parametrów `DEFAULT_THRESHOLDS` / `DEFAULT_CHARGE_SETTINGS`
  (`escalation.ts:42,56`, `reminder.ts:36-37`). Wywołanie, które zapomni
  ustawień, po cichu użyje wartości domyślnych. W tej inspekcji wszystkie
  wywołania poza testami i `/dev` przekazują ustawienia.
- Monotoniczność progów waliduje `superRefine` w `src/lib/settings-schemas.ts:62-68`
  (test `settings-schemas.test.ts:45`). `escalationGroup` zakłada rosnące progi.

### Reguła kwot (ryzyko #3)

- Jednostki: kwoty w groszach, stopa w punktach bazowych (`charges.ts:26-27`).
- Odsetki: `amount × bp × days / 3 650 000` w BigInt, zaokrąglone połowa w górę,
  0 dla `days <= 0` (`charges.ts:73-86`). Dzielnik 365 nie zależy od dat, bo
  funkcja dostaje tylko liczbę dni.
- Rekompensata (`charges.ts:36-46,88-103`):
  - kwota ≤ 500 000 gr → 17 000 gr;
  - kwota > 500 000 i < 5 000 000 gr → 29 750 gr;
  - kwota ≥ 5 000 000 gr → 42 500 gr;
  - 0 przy `days <= 0` lub wyłączonym przełączniku klienta.
- Granice progów kwotowych są stałe. Użytkownik zmienia tylko kwoty i stopę
  (`chargeSettingsFrom`, `charges.ts:59-71`).
- **PRD nie podaje granic progów kwotowych.** `grep` w `prd.md` nie znalazł
  „5 000”, „50 000” ani „EUR”. Jedynym źródłem jest komentarz z odwołaniem do
  art. 10 ustawy o przeciwdziałaniu nadmiernym opóźnieniom (`charges.ts:31-33`).
- Migawka przy wpłacie (`supabase/migrations/20261010130000_add_invoice_payment_snapshot.sql`):
  - Constraint `invoices_payment_snapshot_check` wymaga, żeby `paid_on` był null
    wtedy i tylko wtedy, gdy obie kolumny migawki są null.
  - Zapis: `setInvoicePayment` przy oznaczeniu zapłaty przeładowuje ustawienia
    i zapisuje `paymentSnapshot(invoice, chargeSettingsFrom(settings))`
    (`services/invoices.ts:156-171`).
  - Zmiana daty wpłaty aktualizuje tylko `paid_on`, migawka zostaje
    (`services/invoices.ts:144-153`).
  - Cofnięcie wpłaty czyści `paid_on`, obie kolumny migawki i `paused_on`
    (`services/invoices.ts:122-131`).
  - Odczyt w historii: `frozenChargesAsOf` (`charges.ts:155-166`) wywoływany z
    `PaidInvoicesManager.tsx:90` i `PaymentDialog.tsx:91`, z fallbackiem `?? 0`.
- Wstrzymanie a odsetki: `interestGrosze` nie zna stanu wstrzymania. Zakładka
  „Wstrzymane” liczy odsetki z tych samych `daysOverdue` (`InvoicesManager.tsx:268-277`),
  więc odsetki rosną w czasie wstrzymania (FR-007).

### Ponaglenie a lista (ryzyko #2)

- Przepływ danych na `/`:
  - `index.astro:28-33` ładuje na serwerze `listOpenInvoices`,
    `listActiveClients`, `getSettings` i `getSenderProfile`.
  - `today` liczy się na serwerze (`index.astro:38`).
  - Wyspa `RemindersManager` (`client:load`) liczy `buildClientReminders` w
    przeglądarce (`RemindersManager.tsx:24-27`).
- Filtr etapów 1–4 działa w jednym miejscu: `reminder.ts:42-43`
  (`if (!(group in STAGE_BY_GROUP)) continue`). Pomija on grupy `paused`,
  `pre_threshold` i `current`.
- Ton: `reminder.stage = Math.max(...)` jest liczony tylko z faktur, które
  przeszły filtr (`reminder.ts:64`). `renderReminder` wybiera
  `templates[reminder.stage]` (`reminder.ts:137`).
- Suma: `totalGrosze` to suma pozycji po zaokrągleniu każdej z nich
  (`reminder.ts:73-76`), a nie zaokrąglenie sumy. `formatSummary` wypisuje
  zapisane pola i nie przelicza ich z `items` (`reminder.ts:110-118`).
- Dane nadawcy:
  - `senderBlock` pomija puste pola i zwraca `""`, gdy profil jest pusty.
  - `bankAccountClause` zwraca `""`, gdy nie ma konta (`src/lib/sender-profile.ts:18-40`).
  - Końcowe `.trimEnd()` usuwa pustą linię (`reminder.ts:139`).
- Treść w dialogu jest edytowalna (`ReminderDialog.tsx:116`). To świadoma decyzja
  i jest poza zakresem testów.

### Pokrycie istniejących testów

Testy przypadków brzegowych:

| Przypadek | Stan | Kotwica |
|---|---|---|
| Dzień terminu (0), dzień po (1), przed terminem | pokryte | `escalation.test.ts:5-11,30-32`; `charges.test.ts:27,63,71-79`; `invoice-lock.test.ts:6-16` |
| Próg−1 / próg, 4 progi domyślne (włączne) | pokryte | `escalation.test.ts:33-41` |
| Po ostatnim progu | pokryte (tylko 365 dni) | `escalation.test.ts:41` |
| Progi niestandardowe na granicach | **luka** (tylko `[1,2,3,4]`, days=1) | `escalation.test.ts:49` |
| `groupInvoices` przekazuje progi niestandardowe | **luka** | — |
| Północ Warsaw/UTC (CEST, CET, Nowy Rok) | pokryte | `escalation.test.ts:54-62` |
| `todayInPoland` w dniu zmiany czasu (29.03 / 25.10) | **luka** (DST jest pokryty tylko dla `daysOverdue`) | `escalation.test.ts:17-20` |
| Wstrzymana bez etapu | pokryte | `escalation.test.ts:93-116` |
| Wznowienie po długim wstrzymaniu przeskakuje etapy | **luka** (wynika tylko pośrednio) | — |
| `pausedOn: ""` traktowane jak niewstrzymane | **luka** (kod sprawdza truthy, komentarz mówi „non-empty”) | `escalation.ts:52,65` |
| Odsetki: ręcznie liczone wartości | pokryte | `charges.test.ts:15-19` |
| Połowa w górę dokładnie na 0,5 grosza | pokryte (stopa 1000 bp, 1 dzień) | `charges.test.ts:31-32` |
| Odsetki rosną w czasie wstrzymania | **luka** | — |
| Odsetki stają na dacie wpłaty (wpłata po N dniach, odczyt później) | **częściowe** | `charges.test.ts:141,155` |
| Migawka zamiast bieżących ustawień | pokryte | `charges.test.ts:150,168-174` |
| Krawędzie progów rekompensaty (5 000 / 50 000 zł, obie strony) | pokryte | `charges.test.ts:46-53,112-117` |
| Rekompensata wyłączona | pokryte | `charges.test.ts:59-61,90-92,162-166` |

Testy ponaglenia:

| Przypadek | Stan | Kotwica |
|---|---|---|
| Ponaglenie: tylko etapy 1–4, bez bieżących i sprzed progu | pokryte | `reminder.test.ts:48-62,109-117` |
| Ponaglenie: wstrzymane nie wpływają na pozycje, ton ani sumy | pokryte | `reminder.test.ts:65-93` |
| Ponaglenie: zapłacone i anulowane wykluczone | **luka, poza zasięgiem unit** (filtr w SQL) | `services/invoices.ts:72-78`; helper `inv()` ustawia null, `reminder.test.ts:28,31` |
| Ton = najwyższy etap | pokryte (w treści sprawdzone tylko etapy 3 i 4) | `reminder.test.ts:96-107,160-185` |
| Tytuły etapów 1 i 2 | **luka** (sprawdzany tylko brak `{…}`) | `reminder.test.ts:191-197` |
| Suma = suma pozycji, gdy zaokrąglenie sumy dałoby inny wynik | **luka** | `reminder.test.ts:141-153` (stałe) |
| Klient z mieszanką stanów (etapy 1–4 + wstrzymana + sprzed progu) | **luka** | `sampleInvoices`, `reminder.test.ts:37-45` |
| Dane nadawcy tylko, gdy uzupełnione | pokryte | `reminder.test.ts:218-267`; `sender-profile.test.ts:25-55` |

### Wyrocznie z kodu produkcyjnego (anty-wzorzec z §2)

- `charges.test.ts:81-87`: oczekiwana rekompensata to
  `compensationGrosze(123456, 40, true)`. Odsetki ratuje literał 1860 w `:87`,
  rekompensaty nic nie ratuje.
- `charges.test.ts:137-147`: `frozenChargesAsOf(...)` porównywane z
  `chargesAsOf(...)`. To test różnicowy dwóch ścieżek produkcyjnych. Błąd we
  wspólnym prymitywie przejdzie niezauważony.
- `charges.test.ts:173`: porównanie z `chargesAsOf(..., DEFAULT_CHARGE_SETTINGS)`.
- `charges.test.ts:94-95` i `escalation.test.ts:89`: `f(x)` porównane z `f(x)`
  sprawdza tylko determinizm.
- `charges.test.ts:101-103`: `chargeSettingsFrom(DEFAULT_ESCALATION_SETTINGS)`
  porównane z `DEFAULT_CHARGE_SETTINGS`. To porównanie jest okrężne, bo stałe
  powstają z siebie nawzajem (`charges.ts:49-57`).
- `reminder.test.ts:70-71`: oczekiwana wartość z `buildClientReminders`, czyli
  funkcji pod testem. Jest jednak uzupełniona jawnymi asercjami `items` i
  `stage` (`:73-74`).
- Pozostałe oczekiwania w `escalation.test.ts`, `reminder.test.ts` i
  `charges.test.ts:15-19,31-36,46-53` to literały. Worker przeliczył ręcznie
  1860, 38 i 47 gr i wszystkie się zgadzają. Pełny tekst ponaglenia ma jeden
  snapshot (`reminder.test.ts:160-181`). Pozostałe testy treści sprawdzają
  konkretne fragmenty.

## Code References

- `src/lib/escalation.ts:26-50` — `todayInPoland`, `daysOverdue`, `escalationGroup`
- `src/lib/escalation.ts:53-75` — `groupInvoices` (wstrzymanie, sortowanie)
- `src/lib/charges.ts:36-46` — domyślne stopy i progi rekompensaty
- `src/lib/charges.ts:78-103` — `interestGrosze`, `compensationGrosze`, `withinTier`
- `src/lib/charges.ts:112-166` — `chargesAsOf`, `paymentSnapshot`, `frozenChargesAsOf`
- `src/lib/reminder.ts:33-80` — `buildClientReminders` (filtr 1–4, ton, sumy)
- `src/lib/reminder.ts:120-140` — `renderReminder`
- `src/lib/services/invoices.ts:72-78` — `listOpenInvoices` (filtr zapłaconych i anulowanych w SQL)
- `src/lib/services/invoices.ts:122-171` — cofnięcie wpłaty, zmiana daty, zapis migawki
- `src/lib/services/settings.ts:43-47` — ustawienia z fallbackiem do domyślnych
- `src/components/invoices/RemindersManager.tsx:24-27` — ponaglenia liczone w przeglądarce
- `src/components/invoices/InvoicesManager.tsx:75-92,140` — osobne miejsce wywołujące prymitywy na `/invoices`
- `src/lib/settings-schemas.ts:62-68` — walidacja rosnących progów
- `supabase/migrations/20261010130000_add_invoice_payment_snapshot.sql` — kolumny, constraint i backfill migawki

## Architecture Insights

- Wszystkie reguły są czystymi funkcjami w `src/lib/` i dostają `today` oraz
  ustawienia jako argumenty. Dzięki temu warstwa unit (Vitest, `environment: node`,
  `vitest.config.ts`) wystarcza dla ryzyk #1 i #3 oraz dla kompozycji ponaglenia
  w ryzyku #2.
- Granica serwer/przeglądarka przebiega po `today` i `settings` jako propsach.
  Reguły wykonuje przeglądarka, ale na danych wyliczonych przez serwer.
- `/invoices` liczy kwoty w TSX (`InvoicesManager.tsx:75-92`), a nie przez
  funkcję biblioteczną. Zgodności `/invoices` z ponagleniem nie da się dziś
  sprawdzić testem unit bez wydzielenia tej logiki albo testu komponentowego.
  Projekt nie ma testów komponentowych (`context/archive/2026-10-10-ux-improvement/plan.md:460`).

## Historical Context (from prior changes)

- `context/archive/2026-10-06-collective-reminder/plan.md:11,41,157`: ponaglenie
  składane w przeglądarce z już wczytanych faktur, bez endpointu. Kod jest z tym
  zgodny.
- `context/archive/2026-10-10-ux-improvement/plan.md:284`: ponaglenia na `/`,
  faktury na `/invoices`. Ten rozdział stworzył dwa osobne miejsca wywołujące
  prymitywy kwot.
- `context/archive/2026-10-10-escalation-settings/`: migawka stopy i rekompensaty
  przy wpłacie. Plan testów cytuje ją jako źródło ryzyka #3. Kod jest z nią
  zgodny (`services/invoices.ts:156-171`).

## Related Research

- `context/foundation/test-plan.md` — §2 ryzyka #1–#3, §3 faza 1, §6.1–6.2 (do
  wypełnienia po fazie).

## Open Questions

1. **Wyrocznia dla granic progów kwotowych.** PRD ich nie podaje. Do wyboru:
   tekst ustawy (art. 10: „nie przekracza 5 000 zł” / „wyższa niż 5 000 zł i
   niższa niż 50 000 zł” / „równa lub wyższa niż 50 000 zł”, zgodnie z
   komentarzem w `charges.ts:31-33`; treść ustawy nie została zweryfikowana w
   tym researchu) albo decyzja właściciela.
2. **Wykluczenie zapłaconych i anulowanych faktur z ponaglenia** jest
   egzekwowane tylko w SQL. Opcje: (a) zostawić dla fazy 2 (integration);
   (b) dodać do `buildClientReminders` jawny filtr i test unit. Opcja (b)
   zmienia kod produkcyjny, więc to decyzja planu, nie testu.
3. **Zgodność `/invoices` z ponagleniem.** Opcje: wydzielić wspólną funkcję
   „wiersz faktury z kwotami” do `src/lib/` i przetestować ją unit, albo
   świadomie uznać to za ryzyko szczątkowe.
4. **`pausedOn: ""`**: kod (truthy) i komentarz („non-empty”) dają ten sam
   wynik, bo `""` jest falsy. Brak testu, ale też brak rozbieżności. Do
   decyzji, czy warto to przypiąć testem.
5. **Przypadki skrajne poza zakresem fazy 1, nieprzebadane:** wyścig północy
   między `today` strony a `today` API (`services/invoices.ts:208-211`) oraz
   karta pozostawiona otwarta po północy (`use-reload-on-bfcache-restore.ts`
   nie zostało przeczytane).
