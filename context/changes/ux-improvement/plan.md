# UX: taby, kolejność menu i header na mobile — plan implementacji

## Overview

Wspólny komponent tabs (shadcn `ui/tabs` na `radix-ui`) dzieli cztery strony na zakładki: Faktury (Ponaglenia · Eskalacja · Wstrzymane), Klienci (Aktywni · Nieaktywni), Historia (Zapłacone · Anulowane), Ustawienia (Dane nadawcy · Reguła eskalacji). Menu główne dostaje kolejność Faktury, Historia, Klienci, Ustawienia, a header na mobile układa się w dwa wiersze (góra: e-mail + Wyloguj, dół: menu).

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
5. DevTools 360 px: header w dwóch wierszach, taby bez poziomego przewijania; 1024 px: header jak przed zmianą.

## Performance Considerations

`forceMount` renderuje ukryte panele; przy skali danych jednego użytkownika (dziesiątki faktur) bez znaczenia.

## Migration Notes

Brak — bez zmian schematu i API.

## References

- Research: `context/changes/ux-improvement/research.md`
- Wzorzec komponentu ui na `radix-ui`: `src/components/ui/switch.tsx:3`
- Fokus po akcjach: `src/components/invoices/InvoicesManager.tsx:101-105`, `src/components/clients/ClientsManager.tsx:72-73,210-215`
- Wcześniejsza decyzja o ponagleniach widocznych od razu: `context/archive/2026-10-06-collective-reminder/plan-brief.md:22`

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
