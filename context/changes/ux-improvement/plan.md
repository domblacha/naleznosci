# UX: taby, kolejność menu i header na mobile — plan implementacji

## Overview

Wspólny komponent tabs (shadcn `ui/tabs` na `radix-ui`) dzieli cztery strony na zakładki: Faktury (Ponaglenia · Eskalacja · Wstrzymane), Klienci (Aktywni · Nieaktywni), Historia (Zapłacone · Anulowane), Ustawienia (Dane nadawcy · Reguła eskalacji). Menu główne dostaje kolejność Faktury, Historia, Klienci, Ustawienia, a header na mobile układa się w dwa wiersze (góra: e-mail + Wyloguj, dół: menu).

**Rozszerzenie (fazy 4–5, 2026-10-10, na podstawie `frame.md`)**: `/` staje się stroną „Ponaglenia” (osobna wyspa, bez dodawania faktur), a faktury przechodzą na `/invoices` z tabami Eskalacja (domyślny) · Wstrzymane. Menu ma pięć pozycji: Ponaglenia, Faktury, Historia, Klienci, Ustawienia. Poniżej `sm` menu przechodzi do szuflady (shadcn Sheet), a header ma jeden wiersz: ☰ · e-mail · Wyloguj. To zastępuje dwuwierszowy header mobile z fazy 1.

## Current State Analysis

- Brak komponentu tabs; `radix-ui` ^1.6.7 eksportuje `Tabs` (`@radix-ui/react-tabs` 1.1.21), więc `npx shadcn@latest add tabs` (styl `radix-lyra`) nie dodaje zależności.
- `/` — jedna wyspa `InvoicesManager` z jednym stanem `invoices` (`src/components/invoices/InvoicesManager.tsx:38`); układ: przycisk „Dodaj fakturę” → `RemindersSection` → grupy z `groupInvoices` (:146-222). Ponaglenia liczone wewnątrz `RemindersSection` (`RemindersSection.tsx:21-24`).
- `/clients` — jedna wyspa `ClientsManager` z listą aktywnych i usuniętych (`ClientsManager.tsx:36-40`); sekcja „Usunięci klienci” tylko przy n > 0 (:161); fokus po usunięciu na nagłówek tej sekcji (:210-215), po przywróceniu na „Dodaj klienta” (:73).
- `/history` — dwie niezależne wyspy `PaidInvoicesManager` i `CancelledInvoicesSection` (`src/pages/history.astro:41-42`), każda z własnym `useState`.
- `/settings` — dwie niezależne wyspy `SenderProfileForm` i `SettingsForm` z Astro-owym `h2` pomiędzy (`src/pages/settings.astro:40-42`); stan formularzy wyłącznie lokalny w hookach.
- `Topbar.astro` — jeden wiersz `flex justify-between` bez klas responsywnych, linki w kolejności Faktury, Klienci, Historia, Ustawienia (`src/components/Topbar.astro:7-12,15`).
- `Layout.astro:17` — viewport bez `initial-scale=1`.
- Komunikaty 409 odsyłają do „sekcji „Usunięci klienci”” (`src/lib/client-errors.ts:6,8`).

## Desired End State

- Każda z czterech stron pokazuje taby z `src/components/ui/tabs.tsx`; taby z listami mają licznik pozycji aktualizowany na żywo po akcjach.
- `/` otwiera się na tabie „Ponaglenia”; „Eskalacja” zawiera wszystkie grupy poza `paused`, „Wstrzymane” grupę `paused`.
- Przełączenie taba nie gubi niezapisanych zmian w formularzach ustawień ani komunikatu „Zapisano…”.
- Po akcji przenoszącej pozycję między tabami użytkownik zostaje na bieżącym tabie, licznik docelowego taba rośnie, a fokus nigdy nie ginie (trafia na widoczny element).
- Menu: Faktury, Historia, Klienci, Ustawienia; poniżej `sm` header w dwóch wierszach, od `sm` wygląda jak dziś.
- Weryfikacja: `npm run lint`, `npx astro check`, `npm test`, `npm run build`, `npm run smoke` + ręczne przejście czterech stron na desktopie i w szerokości 360 px.
- Po fazach 4–5:
  - `/` („Ponaglenia”) pokazuje tylko listę ponagleń z dialogiem ponaglenia;
  - `/invoices` („Faktury”) ma „Dodaj fakturę” i taby Eskalacja · Wstrzymane;
  - powrót przyciskiem „Wstecz” (bfcache) na którąkolwiek z tych stron przeładowuje ją, więc dane są świeże;
  - poniżej `sm` header ma jeden wiersz (☰ · e-mail · Wyloguj), a menu otwiera się w szufladzie z lewej;
  - od `sm` menu jest poziome, z pięcioma linkami.

### Key Discoveries:

- `TabsContent` bez `forceMount` jest odmontowywany; z `forceMount` zostaje w DOM z atrybutem `hidden` (`node_modules/@radix-ui/react-tabs/dist/index.mjs:153-170`). Element wewnątrz `hidden` nie przyjmie fokusu — `focus()` cicho nic nie robi.
- `ref` otwierającego przycisku po przeniesieniu faktury do innej grupy wskazuje na odmontowany wiersz (`isConnected === false`), więc istniejący fallback na `addButtonRef` (`InvoicesManager.tsx:101-105`) działa — pod warunkiem że przycisk „Dodaj” jest poza panelami.
- Kitchen sink renderuje całe `ClientsManager` i `InvoicesManager` (`src/components/dev/KitchenSinkForms.tsx:252-257,685-720`), więc taby pojawią się tam automatycznie.
- ESLint `no-restricted-syntax` (`eslint.config.js:73-97`) zabrania literałów kolorów i wartości arbitralnych w widokach; `src/components/ui/**` jest wyłączone.

## What We're NOT Doing

- Stan taba w URL (`?tab=`) ani hash — aktywny tab żyje tylko w stanie komponentu, odświeżenie wraca do pierwszego taba.
- Automatyczne przełączanie taba po akcji (np. na „Nieaktywni” po usunięciu klienta).
- Ukrywanie pustych tabów.
- Liczniki na tabach `/settings` (nie ma tam list).
- Śledzenie „dirty” formularzy i ostrzeżenie `beforeunload`.
- Zmiany API, bazy, migracji, logiki eskalacji i ponagleń.
- Testy komponentowe/Playwright (projekt ich nie ma).
- (Fazy 4–5) Przycisk „Dodaj fakturę” na `/` — dodawanie faktur tylko na `/invoices`.
- (Fazy 4–5) `Cache-Control: no-store` i przeładowanie przy bfcache na stronach innych niż `/` i `/invoices`.
- (Fazy 4–5) Przekierowanie ze starego zachowania `/` (taby faktur) — aplikacja nie ma zewnętrznych linków do tabów.

## Implementation Approach

Jeden komponent shadcn `Tabs`, używany niekontrolowanie (`defaultValue` = pierwszy tab) i zawsze z `forceMount` na każdym `TabsContent`. Taby żyją wewnątrz istniejących managerów tam, gdzie stan jest wspólny (`/`, `/clients`), a na stronach z dwiema wyspami (`/history`, `/settings`) zastępuje je jedna nowa wyspa-wrapper. Przyciski „Dodaj fakturę/klienta” wychodzą nad taby, więc są stałym, zawsze widocznym celem fokusu. Globalny pusty stan strony (brak danych w ogóle) zostaje bez tabów; w pozostałych przypadkach taby są zawsze widoczne, a pusty panel pokazuje własny tekst.

## Critical Implementation Details

**User experience spec** — Fokus nie może trafić do ukrytego panelu. Przy `forceMount` element w nieaktywnym panelu jest `isConnected`, ale nie przyjmuje fokusu, więc każdy fallback „opener albo przycisk Dodaj” musi traktować element wewnątrz `[hidden]` jak niedostępny (`el.isConnected && !el.closest("[hidden]")`). Usunięcie klienta przestaje kierować fokus na nagłówek „Usunięci klienci” (byłby w ukrytym panelu) — fokus idzie na „Dodaj klienta”.

**State sequencing** — W historii licznik taba musi wynikać z tego samego stanu, który renderuje listę; dlatego stan obu list przechodzi do `HistoryManager`, a `PaidInvoicesManager` i `CancelledInvoicesSection` stają się kontrolowane (dostają listę i callbacki), zamiast trzymać kopię.

## Faza 1: Komponent Tabs i header

### Overview

Dodaje prymityw tabs i jego prezentację w kitchen sinku oraz zmienia header (kolejność menu, dwa wiersze na mobile).

### Changes Required:

#### 1. Komponent `ui/tabs`

**File**: `src/components/ui/tabs.tsx` (nowy, przez `npx shadcn@latest add tabs`)

**Intent**: Wspólny prymityw tabs dla czterech stron, w stylu projektu i na tokenach z `global.css`.

**Contract**: Eksporty `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, import z pakietu zbiorczego `radix-ui` (jak `switch.tsx:3`). Po instalacji sprawdzić, że generator nie wprowadził zależności `@radix-ui/react-tabs` do `package.json` ani nowych tokenów. `TabsList` nie może wymuszać poziomego przewijania strony przy 360 px — trzy triggery z licznikami („Ponaglenia (3)”, „Eskalacja (12)”, „Wstrzymane (1)”) muszą się zmieścić lub przewijać się w obrębie listy.

#### 2. Kitchen sink

**File**: `src/components/dev/KitchenSinkForms.tsx`

**Intent**: Pokazać stany tabów w `/dev/ui`: taby z licznikami, pusty panel i panel z treścią.

**Contract**: Nowa sekcja przez istniejący helper `Section` (:126-133).

#### 3. Header

**File**: `src/components/Topbar.astro`

**Intent**: Kolejność linków Faktury, Historia, Klienci, Ustawienia; poniżej `sm` dwa wiersze (góra: e-mail + Wyloguj rozsunięte do krawędzi, dół: nawigacja), od `sm` układ identyczny z dzisiejszym.

**Contract**: Tablica `links` (:7-12) w nowej kolejności. E-mail i formularz wylogowania w jednym wrapperze z `sm:contents`, żeby na desktopie kontener nadal miał trzech potomków (nav, e-mail, wyloguj) w `justify-between`; wrapper `order-first` na mobile. Nawigacja z `flex-wrap` jako zabezpieczenie. Aktywny link nadal przez `aria-current="page"`. Tylko klasy Tailwind z tokenów (reguła ESLint).

#### 4. Viewport

**File**: `src/layouts/Layout.astro`

**Intent**: Poprawne skalowanie na telefonie.

**Contract**: `<meta name="viewport" content="width=device-width, initial-scale=1" />` (:17).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`
- `package.json` nie zawiera nowej zależności po `shadcn add tabs`

#### Manual Verification:

- `/dev/ui` pokazuje sekcję tabów; strzałki przełączają taby, fokus widoczny
- Menu w kolejności Faktury, Historia, Klienci, Ustawienia na wszystkich czterech stronach, aktywny link wyróżniony
- Przy 360 px header ma dwa wiersze (e-mail + Wyloguj na górze, menu na dole), bez poziomego przewijania
- Od 640 px header wygląda jak przed zmianą

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed kolejną fazą.

---

## Faza 2: Faktury i Klienci

### Overview

Taby wewnątrz dwóch istniejących managerów, które już mają wspólny stan.

### Changes Required:

#### 1. Taby na `/`

**File**: `src/components/invoices/InvoicesManager.tsx`

**Intent**: Gdy są otwarte faktury: przycisk „Dodaj fakturę” nad tabami, potem taby w kolejności Ponaglenia (domyślny) · Eskalacja · Wstrzymane, każdy z licznikiem. Globalne puste stany („Najpierw dodaj klienta”, „Nie masz otwartych faktur” z CTA) zostają bez tabów.

**Contract**:
- Ponaglenia liczone w `InvoicesManager` przez `buildClientReminders` (przeniesione z `RemindersSection.tsx:21-24`); licznik = liczba klientów do ponaglenia.
- „Eskalacja” = wszystkie grupy z `groupInvoices` poza `paused`, w dotychczasowej kolejności i z nagłówkami grup; licznik = liczba faktur w tych grupach. Pusty panel: „Wszystkie otwarte faktury są wstrzymane”.
- „Wstrzymane” = grupa `paused`; licznik = liczba wstrzymanych. Pusty panel: „Nie masz wstrzymanych faktur”.
- Każdy `TabsContent` z `forceMount`; dialogi zostają poza panelami.
- Fallbacki fokusu (`focusOpenerOrAdd`, `onCloseAutoFocus` w `PaymentDialog` i `InvoiceFormDialog`) traktują opener w `[hidden]` jak niedostępny.

#### 2. `RemindersSection`

**File**: `src/components/invoices/RemindersSection.tsx`

**Intent**: Przyjmuje gotową listę ponagleń zamiast liczyć ją sama, żeby licznik taba i lista miały jedno źródło.

**Contract**: Prop `reminders` (typ zwracany przez `buildClientReminders`) zastępuje liczenie z `invoices`/`settings`; `today` i `sender` zostają dla `ReminderDialog`. Pusty stan „Żaden klient nie ma faktur na etapach 1–4.” bez zmian.

#### 3. Taby na `/clients`

**File**: `src/components/clients/ClientsManager.tsx`

**Intent**: Gdy jest choć jeden klient (aktywny lub usunięty): „Dodaj klienta” nad tabami, taby Aktywni (domyślny) · Nieaktywni z licznikami. Brak jakichkolwiek klientów → dzisiejszy pusty stan „Nie masz jeszcze klientów” + „Dodaj klienta”, bez tabów.

**Contract**:
- Panel „Aktywni”: tabela aktywnych; pusty: „Nie masz aktywnych klientów”.
- Panel „Nieaktywni”: alert `restoreError` i tabela usuniętych; pusty: „Nie masz usuniętych klientów”. Nagłówek „Usunięci klienci (n)” i `deletedHeadingRef` znikają (licznik jest na tabie).
- Po usunięciu fokus na „Dodaj klienta” (zamiast nagłówka); po przywróceniu bez zmian (`addButtonRef`). Jeden `addButtonRef` na jednym przycisku.
- Każdy `TabsContent` z `forceMount`.

#### 4. Komunikaty 409

**File**: `src/lib/client-errors.ts`

**Intent**: Odesłanie do nowej nazwy miejsca.

**Contract**: `duplicate_nip_inactive` i `duplicate_name_inactive` kończą się „Przywróć go w zakładce „Nieaktywni”.”

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`
- Smoke przechodzi na dev serwerze: `npm run smoke`

#### Manual Verification:

- `/` otwiera się na „Ponaglenia”; liczniki trzech tabów zgadzają się z treścią paneli
- Wstrzymanie faktury w tabie „Eskalacja”: tab się nie zmienia, licznik „Wstrzymane” rośnie, po zamknięciu dialogu fokus na „Dodaj fakturę”
- Oznaczenie faktury jako zapłaconej i anulowanie aktualizują liczniki; fokus nie ginie
- Brak otwartych faktur i brak klientów pokazują dotychczasowe puste stany bez tabów
- `/clients`: usunięcie klienta zostawia tab „Aktywni”, licznik „Nieaktywni” rośnie, fokus na „Dodaj klienta”; przywrócenie z „Nieaktywni” analogicznie
- Puste panele „Eskalacja”, „Wstrzymane”, „Aktywni”, „Nieaktywni” pokazują swoje teksty
- Komunikat 409 przy duplikacie usuniętego klienta odsyła do zakładki „Nieaktywni”

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed kolejną fazą.

---

## Faza 3: Historia i Ustawienia

### Overview

Nowe wyspy-wrappery w miejsce par niezależnych wysp, z tabami i (w historii) wspólnym stanem dla liczników.

### Changes Required:

#### 1. `HistoryManager`

**File**: `src/components/invoices/HistoryManager.tsx` (nowy)

**Intent**: Jedna wyspa z tabami Zapłacone (domyślny) · Anulowane i licznikami, trzymająca stan obu list.

**Contract**: Props `initialPaid`, `initialCancelled`, `today`. Sortowanie (`sortPaid`, `sortCancelled`) przy inicjalizacji i aktualizacji stanu. Taby zawsze widoczne (puste panele mają dzisiejsze teksty „Brak zapłaconych faktur” / „Brak anulowanych faktur”). Każdy `TabsContent` z `forceMount`.

#### 2. Listy historii jako komponenty kontrolowane

**File**: `src/components/invoices/PaidInvoicesManager.tsx`, `src/components/invoices/CancelledInvoicesSection.tsx`

**Intent**: Renderują listę z propsów i zgłaszają zmiany wrapperowi zamiast trzymać własną kopię.

**Contract**: `invoices` + callbacki zmiany (zapłacone: zmiana daty wpłaty i przywrócenie; anulowane: przywrócenie). Lokalny stan dialogów, błędów i `restoringId` zostaje. Nagłówki `h2` z `tabIndex={-1}` zostają jako cel fokusu po przywróceniu (ten sam, widoczny panel).

#### 3. Strona historii

**File**: `src/pages/history.astro`

**Intent**: Montuje `HistoryManager` zamiast dwóch wysp.

**Contract**: `<HistoryManager initialPaid={invoices} initialCancelled={cancelledInvoices} today={today} client:load />`.

#### 4. `SettingsTabs`

**File**: `src/components/settings/SettingsTabs.tsx` (nowy), `src/pages/settings.astro`

**Intent**: Jedna wyspa z tabami Dane nadawcy (domyślny) · Reguła eskalacji, bez liczników; zastępuje dwie wyspy i Astro-owy `h2` „Reguła eskalacji”.

**Contract**: Props `initialProfile`, `initialSettings`; renderuje `SenderProfileForm` i `SettingsForm` bez zmian w nich i w hookach. Każdy `TabsContent` z `forceMount` — to on chroni niezapisane zmiany i stan „Zapisano…” przy przełączaniu.

#### 5. README

**File**: `README.md`

**Intent**: Opisy stron i migracji odwołują się do tabów zamiast sekcji.

**Contract**: Wiersze `/`, `/history`, `/settings` w tabeli tras oraz wzmianki o „Usunięci klienci” / „cancelled section” / grupie „Wstrzymane” w opisie migracji.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`
- Smoke przechodzi na dev serwerze: `npm run smoke`

#### Manual Verification:

- `/history`: przywrócenie faktury zmniejsza licznik swojego taba, fokus na nagłówku panelu; zmiana daty wpłaty przesortowuje listę
- `/settings`: zmiana pola w „Dane nadawcy”, przełączenie na „Reguła eskalacji” i powrót — wpisana wartość zostaje; po zapisie i przełączeniu tabów formularz pokazuje zapisane wartości
- Wszystkie cztery strony przy 360 px: taby czytelne, bez poziomego przewijania strony
- README opisuje taby zamiast sekcji

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie.

---

## Faza 4: Ponaglenia na `/`, faktury na `/invoices`

### Overview

Dzieli `InvoicesManager` na dwie strony: `/` z samymi ponagleniami i `/invoices` z tabami Eskalacja · Wstrzymane. Każda strona wczytuje otwarte faktury z SSR, a po powrocie z bfcache przeładowuje się, żeby nie pokazać nieaktualnych danych.

**Stan wyjściowy**: `InvoicesManager.tsx:128-338` trzyma jeden stan `invoices` i liczy z niego grupy oraz ponaglenia (`:141-156`). `RemindersSection` dostaje gotowe `reminders` i nie ma akcji na wierszach poza dialogiem ponaglenia. `/` jest chroniony osobnym exact match (`middleware.ts:27`), a pozostałe trasy prefiksem (`:6`).

### Changes Required:

#### 1. Wyspa ponagleń

**File**: `src/components/invoices/RemindersManager.tsx` (nowy)

**Intent**: Wyspa strony `/`. Liczy ponaglenia z otwartych faktur i pokazuje je przez `RemindersSection`, bez dodawania i edycji faktur.

**Contract**: Props `invoices`, `hasClients`, `today`, `settings`, `sender`. Ponaglenia z `buildClientReminders(invoices, today, settings.thresholds, chargeSettingsFrom(settings))` w `useMemo`, bez stanu faktur (strona nic nie mutuje). Stany w tej kolejności:
- `hasClients === false` → dzisiejsze „Najpierw dodaj klienta” z „Przejdź do klientów”;
- brak ponagleń (także przy braku otwartych faktur) → tekst „Żaden klient nie ma faktur na etapach 1–4.” z linkiem „Przejdź do faktur” (`/invoices`);
- w pozostałych przypadkach → `RemindersSection` (tabela z „Generuj ponaglenie”).

Pusty stan przenieść z `RemindersSection` tutaj, żeby link stał obok tekstu. `RemindersSection` renderuje wtedy tylko tabelę i dialog. Wywołuje hook z pkt 4.

#### 2. `InvoicesManager` bez ponagleń

**File**: `src/components/invoices/InvoicesManager.tsx`

**Intent**: Wyspa strony `/invoices`: „Dodaj fakturę” nad tabami Eskalacja (domyślny) · Wstrzymane. Reszta zachowania z fazy 2 bez zmian.

**Contract**:
- Znikają prop `sender`, `buildClientReminders`, import `RemindersSection` i tab `reminders`.
- `Tabs defaultValue="escalation"`.
- Puste stany („Najpierw dodaj klienta”, „Nie masz otwartych faktur” z „Dodaj fakturę” i „Zobacz historię”), fokus, dialogi i `forceMount` bez zmian.
- Wywołuje hook z pkt 4.

#### 3. Strony

**File**: `src/pages/index.astro`, `src/pages/invoices.astro` (nowy)

**Intent**: `/` montuje `RemindersManager`, a `/invoices` przejmuje dzisiejszą treść `/`.

**Contract**:
- `index.astro`: `Layout title="Ponaglenia"`, `h1` „Ponaglenia”. Wczytuje `listOpenInvoices`, `listActiveClients` (tylko po `hasClients={clients.length > 0}`), `getSettings` i `getSenderProfile`. Komunikaty błędu mówią o ponagleniach („Nie udało się wczytać ponagleń. Odśwież stronę.”).
- `invoices.astro`: `export const prerender = false`, `Layout title="Faktury"`, `h1` „Faktury”, ten sam wzorzec ładowania co dziś `index.astro:18-38`, ale bez `getSenderProfile`. Montuje `<InvoicesManager … client:load />`.

#### 4. Przeładowanie po powrocie z bfcache

**File**: `src/components/hooks/use-reload-on-bfcache-restore.ts` (nowy)

**Intent**: Strona przywrócona przyciskiem „Wstecz” z bfcache pokazuje stan sprzed akcji na innej stronie, np. ponaglenie z fakturą zapłaconą już na `/invoices`. Przeładowanie pobiera świeże dane z SSR.

**Contract**: `useReloadOnBfcacheRestore()` — w `useEffect` nasłuchuje `pageshow` i przy `event.persisted` wywołuje `window.location.reload()`. Wzorzec jak `use-submit-pending.ts:7-13`, ze sprzątaniem listenera. Wołany w `RemindersManager` i `InvoicesManager`.

#### 5. Ochrona trasy i menu

**File**: `src/middleware.ts`, `src/components/Topbar.astro`

**Intent**: `/invoices` wymaga zalogowania; menu ma pięć pozycji.

**Contract**:
- `PROTECTED_ROUTES` dostaje `"/invoices"`.
- `links`: Ponaglenia (`/`), Faktury (`/invoices`), Historia, Klienci, Ustawienia.
- Dopasowanie aktywnego linku bez zmian (`/` exact, reszta `startsWith`).

#### 6. Kitchen sink

**File**: `src/components/dev/KitchenSinkForms.tsx`

**Intent**: `/dev/ui` pokazuje obie wyspy w ich stanach.

**Contract**:
- Sekcje `InvoicesManager` (`:686-721`) bez propu `sender`.
- Sekcja „Ponaglenia: pusty stan” przechodzi na `RemindersManager`.
- Nowe sekcje `RemindersManager`: lista ponagleń (dane `sampleInvoices`) i brak klientów.

#### 7. Smoke i README

**File**: `scripts/smoke.mjs`, `README.md`

**Intent**: Regresja nowej trasy i aktualny opis stron.

**Contract**:
- Smoke: krok „invoices page redirects anonymous user” (`/invoices` bez sesji → 302 `/auth/signin`) obok `:653-657` i „invoices renders for signed-in user” (200) obok `:684`.
- README:
  - wiersz `/` w tabeli tras opisuje ponaglenia;
  - nowy wiersz `/invoices` przejmuje opis listy faktur z tabami Eskalacja · Wstrzymane;
  - w opisie migracji `add_invoice_paused_on` „"Wstrzymane" tab of `/invoices`”;
  - w wierszu `/settings` „apply to `/` and `/invoices` immediately”;
  - akapit o `PROTECTED_ROUTES` (`:162`) bez zmian treści.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`
- Smoke przechodzi na dev serwerze, z nowymi krokami `/invoices`: `npm run smoke`

#### Manual Verification:

- `/` pokazuje nagłówek „Ponaglenia” i tabelę ponagleń bez „Dodaj fakturę” i bez tabów; „Generuj ponaglenie” działa, fokus wraca na przycisk
- `/` bez ponagleń pokazuje „Żaden klient nie ma faktur na etapach 1–4.” z linkiem „Przejdź do faktur”; bez klientów „Najpierw dodaj klienta”
- `/invoices` otwiera się na „Eskalacja”; taby Eskalacja · Wstrzymane z licznikami, wstrzymanie/zapłata/anulowanie jak w fazie 2
- Oznaczenie faktury jako zapłaconej na `/invoices`, potem „Wstecz” na `/` — strona przeładowuje się i ponaglenie nie zawiera tej faktury
- Menu: Ponaglenia, Faktury, Historia, Klienci, Ustawienia; aktywny link poprawny na `/` i `/invoices`
- `/invoices` bez sesji przekierowuje na `/auth/signin`
- `/dev/ui` pokazuje sekcje obu wysp

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed kolejną fazą.

---

## Faza 5: Menu mobilne w szufladzie

### Overview

Poniżej `sm` header ma jeden wiersz: przycisk ☰ · e-mail · Wyloguj. ☰ otwiera z lewej szufladę z pięcioma linkami. Od `sm` header wygląda jak po fazie 4.

### Changes Required:

#### 1. Komponent `ui/sheet`

**File**: `src/components/ui/sheet.tsx` (nowy, przez `npx shadcn@latest add sheet`)

**Intent**: Prymityw szuflady na Radix Dialog, w stylu projektu.

**Contract**:
- Eksporty `Sheet`, `SheetTrigger`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetClose`.
- Import z pakietu zbiorczego `radix-ui` (jak `dialog.tsx`).
- Po instalacji sprawdzić, że `package.json` nie ma nowej zależności, a overlay i tło używają tych samych klas co `DialogOverlay`/`DialogContent` (`dialog.tsx:29,51`), bez nowych tokenów.

#### 2. Wyspa `MobileNav`

**File**: `src/components/MobileNav.tsx` (nowy)

**Intent**: Przycisk ☰ i szuflada z linkami menu na mobile.

**Contract**:
- Props `links: { href: string; label: string; active: boolean }[]`; aktywność liczy `Topbar.astro`, żeby reguła dopasowania była w jednym miejscu.
- `SheetTrigger asChild` z `Button` (wariant `ghost`, rozmiar ikony) z ikoną `Menu` z `lucide-react` i `aria-label="Otwórz menu"`.
- `SheetContent side="left"` z `SheetTitle` „Menu” (Radix wymaga tytułu) i `nav aria-label="Główna nawigacja"`. Linki w pionie, aktywny z `aria-current="page"` i tymi samymi tokenami co w `Topbar` (`text-foreground` / `text-muted-foreground`).
- Zamknięcie: Escape, klik w overlay, ✕. Fokus wraca na ☰ (zapewnia `SheetTrigger`).

#### 3. Header

**File**: `src/components/Topbar.astro`

**Intent**: Jeden wiersz na mobile, układ desktopowy bez zmian.

**Contract**:
- Kontener `flex items-center justify-between gap-2`.
- Poziomy `nav` z klasą `hidden sm:flex`.
- `<MobileNav links={…} client:load />` w wrapperze `sm:hidden` (klasa na elemencie HTML, nie `className` na komponencie ui).
- E-mail (`min-w-0 truncate`) i formularz „Wyloguj” jako zwykli potomkowie kontenera. Znikają wrapper `order-first … sm:contents` i `flex-col` z fazy 1.
- Tablica `links` mapowana na `{ href, label, active }` raz i używana przez oba menu.

#### 4. Kitchen sink

**File**: `src/components/dev/KitchenSinkForms.tsx`

**Intent**: `/dev/ui` pokazuje szufladę.

**Contract**: Sekcja „Menu mobilne” przez `Section` z `MobileNav` i przykładowymi linkami (jeden aktywny).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`
- `package.json` nie zawiera nowej zależności po `shadcn add sheet`

#### Manual Verification:

- Przy 360 px header ma jeden wiersz (☰ · e-mail · Wyloguj), długi e-mail się skraca, bez poziomego przewijania
- ☰ otwiera szufladę z lewej z pięcioma linkami, aktywny wyróżniony; Escape, klik w overlay i ✕ zamykają ją, fokus wraca na ☰
- Klik w link w szufladzie przechodzi na stronę
- Od 640 px szuflada i ☰ są niewidoczne, header jak po fazie 4
- `/dev/ui` pokazuje sekcję menu mobilnego

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- Logika nie zmienia się (`groupInvoices`, `buildClientReminders` bez zmian), więc istniejące `src/lib/*.test.ts` pokrywają obliczenia. Nowych testów jednostkowych nie dodajemy — zmiana jest w warstwie widoku, a projekt nie ma testów komponentowych.

### Integration Tests:

- `npm run smoke` — strony i API nadal odpowiadają tymi samymi statusami (smoke nie sprawdza HTML, więc tylko regresja tras).

### Manual Testing Steps:

1. Na każdej stronie przełącz taby myszą i strzałkami; sprawdź liczniki względem treści.
2. Na `/` wstrzymaj i wznów fakturę, oznacz jako zapłaconą, anuluj — sprawdź liczniki i fokus.
3. Na `/clients` usuń i przywróć klienta; wywołaj 409 duplikatem usuniętego klienta.
4. Na `/settings` zmień pole, przełącz tab, wróć; zapisz i przełącz.
5. DevTools 360 px: header w dwóch wierszach, taby bez poziomego przewijania; 1024 px: header jak przed zmianą. (Po fazie 5: jeden wiersz z ☰.)
6. (Faza 4) Na `/invoices` oznacz fakturę z etapu 1–4 jako zapłaconą, wróć „Wstecz” na `/` — ponaglenie bez tej faktury.
7. (Faza 5) 360 px: otwórz i zamknij szufladę myszą i klawiaturą (Tab do ☰, Enter, Escape).

## Performance Considerations

`forceMount` renderuje ukryte panele; przy skali danych jednego użytkownika (dziesiątki faktur) bez znaczenia.

## Migration Notes

Brak — bez zmian schematu i API.

## References

- Research: `context/changes/ux-improvement/research.md`
- Wzorzec komponentu ui na `radix-ui`: `src/components/ui/switch.tsx:3`
- Fokus po akcjach: `src/components/invoices/InvoicesManager.tsx:101-105`, `src/components/clients/ClientsManager.tsx:72-73,210-215`
- Wcześniejsza decyzja o ponagleniach widocznych od razu: `context/archive/2026-10-06-collective-reminder/plan-brief.md:22`
- Frame rozszerzenia (fazy 4–5): `context/changes/ux-improvement/frame.md`
- Wzorzec `pageshow`/`persisted`: `src/components/hooks/use-submit-pending.ts:7-13`
- Wzorzec komponentu na Radix Dialog: `src/components/ui/dialog.tsx:24-51`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Komponent Tabs i header

#### Automated

- [x] 1.1 Lint przechodzi: `npm run lint` — 0c563f8
- [x] 1.2 Typy przechodzą: `npx astro check` — 0c563f8
- [x] 1.3 Testy jednostkowe przechodzą: `npm test` — 0c563f8
- [x] 1.4 Build przechodzi: `npm run build` — 0c563f8
- [x] 1.5 `package.json` nie zawiera nowej zależności po `shadcn add tabs` — 0c563f8

#### Manual

- [x] 1.6 `/dev/ui` pokazuje sekcję tabów; strzałki przełączają taby, fokus widoczny — 0c563f8
- [x] 1.7 Menu w kolejności Faktury, Historia, Klienci, Ustawienia na wszystkich czterech stronach, aktywny link wyróżniony — 0c563f8
- [x] 1.8 Przy 360 px header ma dwa wiersze (e-mail + Wyloguj na górze, menu na dole), bez poziomego przewijania — 0c563f8
- [x] 1.9 Od 640 px header wygląda jak przed zmianą — 0c563f8

### Phase 2: Faktury i Klienci

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint` — b6fdeff
- [x] 2.2 Typy przechodzą: `npx astro check` — b6fdeff
- [x] 2.3 Testy jednostkowe przechodzą: `npm test` — b6fdeff
- [x] 2.4 Build przechodzi: `npm run build` — b6fdeff
- [x] 2.5 Smoke przechodzi na dev serwerze: `npm run smoke` — b6fdeff

#### Manual

- [x] 2.6 `/` otwiera się na „Ponaglenia”; liczniki trzech tabów zgadzają się z treścią paneli — b6fdeff
- [x] 2.7 Wstrzymanie faktury w tabie „Eskalacja”: tab się nie zmienia, licznik „Wstrzymane” rośnie, po zamknięciu dialogu fokus na „Dodaj fakturę” — b6fdeff
- [x] 2.8 Oznaczenie faktury jako zapłaconej i anulowanie aktualizują liczniki; fokus nie ginie — b6fdeff
- [x] 2.9 Brak otwartych faktur i brak klientów pokazują dotychczasowe puste stany bez tabów — b6fdeff
- [x] 2.10 `/clients`: usunięcie klienta zostawia tab „Aktywni”, licznik „Nieaktywni” rośnie, fokus na „Dodaj klienta”; przywrócenie z „Nieaktywni” analogicznie — b6fdeff
- [x] 2.11 Puste panele „Eskalacja”, „Wstrzymane”, „Aktywni”, „Nieaktywni” pokazują swoje teksty — b6fdeff
- [x] 2.12 Komunikat 409 przy duplikacie usuniętego klienta odsyła do zakładki „Nieaktywni” — b6fdeff

### Phase 3: Historia i Ustawienia

#### Automated

- [x] 3.1 Lint przechodzi: `npm run lint` — dadb192
- [x] 3.2 Typy przechodzą: `npx astro check` — dadb192
- [x] 3.3 Testy jednostkowe przechodzą: `npm test` — dadb192
- [x] 3.4 Build przechodzi: `npm run build` — dadb192
- [x] 3.5 Smoke przechodzi na dev serwerze: `npm run smoke` — dadb192

#### Manual

- [x] 3.6 `/history`: przywrócenie faktury zmniejsza licznik swojego taba, fokus na nagłówku panelu; zmiana daty wpłaty przesortowuje listę — dadb192
- [x] 3.7 `/settings`: zmiana pola w „Dane nadawcy”, przełączenie na „Reguła eskalacji” i powrót — wpisana wartość zostaje; po zapisie i przełączeniu tabów formularz pokazuje zapisane wartości — dadb192
- [x] 3.8 Wszystkie cztery strony przy 360 px: taby czytelne, bez poziomego przewijania strony — dadb192
- [x] 3.9 README opisuje taby zamiast sekcji — dadb192

### Phase 4: Ponaglenia na `/`, faktury na `/invoices`

#### Automated

- [x] 4.1 Lint przechodzi: `npm run lint` — 9f22be1
- [x] 4.2 Typy przechodzą: `npx astro check` — 9f22be1
- [x] 4.3 Testy jednostkowe przechodzą: `npm test` — 9f22be1
- [x] 4.4 Build przechodzi: `npm run build` — 9f22be1
- [x] 4.5 Smoke przechodzi na dev serwerze, z nowymi krokami `/invoices`: `npm run smoke` — 9f22be1

#### Manual

- [x] 4.6 `/` pokazuje nagłówek „Ponaglenia” i tabelę ponagleń bez „Dodaj fakturę” i bez tabów; „Generuj ponaglenie” działa, fokus wraca na przycisk — 9f22be1
- [x] 4.7 `/` bez ponagleń pokazuje „Żaden klient nie ma faktur na etapach 1–4.” z linkiem „Przejdź do faktur”; bez klientów „Najpierw dodaj klienta” — 9f22be1
- [x] 4.8 `/invoices` otwiera się na „Eskalacja”; taby Eskalacja · Wstrzymane z licznikami, wstrzymanie/zapłata/anulowanie jak w fazie 2 — 9f22be1
- [x] 4.9 Oznaczenie faktury jako zapłaconej na `/invoices`, potem „Wstecz” na `/` — strona przeładowuje się i ponaglenie nie zawiera tej faktury — 9f22be1
- [x] 4.10 Menu: Ponaglenia, Faktury, Historia, Klienci, Ustawienia; aktywny link poprawny na `/` i `/invoices` — 9f22be1
- [x] 4.11 `/invoices` bez sesji przekierowuje na `/auth/signin` — 9f22be1
- [x] 4.12 `/dev/ui` pokazuje sekcje obu wysp — 9f22be1

### Phase 5: Menu mobilne w szufladzie

#### Automated

- [x] 5.1 Lint przechodzi: `npm run lint`
- [x] 5.2 Typy przechodzą: `npx astro check`
- [x] 5.3 Testy jednostkowe przechodzą: `npm test`
- [x] 5.4 Build przechodzi: `npm run build`
- [x] 5.5 `package.json` nie zawiera nowej zależności po `shadcn add sheet`

#### Manual

- [x] 5.6 Przy 360 px header ma jeden wiersz (☰ · e-mail · Wyloguj), długi e-mail się skraca, bez poziomego przewijania
- [x] 5.7 ☰ otwiera szufladę z lewej z pięcioma linkami, aktywny wyróżniony; Escape, klik w overlay i ✕ zamykają ją, fokus wraca na ☰
- [x] 5.8 Klik w link w szufladzie przechodzi na stronę
- [x] 5.9 Od 640 px szuflada i ☰ są niewidoczne, header jak po fazie 4
- [x] 5.10 `/dev/ui` pokazuje sekcję menu mobilnego
