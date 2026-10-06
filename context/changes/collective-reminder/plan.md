# Zbiorcze ponaglenie do schowka — plan implementacji

## Overview

Wycinek S-05 z roadmapy (US-01, FR-008, FR-011, NFR „treści ponagleń po polsku”). Na `/` nad listą faktur pojawia się sekcja „Ponaglenia” z klientami, którzy mają faktury na etapach 1–4. Przy każdym kliencie widać jego najwyższy etap, liczbę pozycji i kwotę „Razem do zapłaty”. Przycisk „Generuj ponaglenie” otwiera dialog z treścią w tonie najwyższego etapu. Treść jest w edytowalnym polu tekstowym, a przycisk kopiuje ją do schowka. Treść składa czysta funkcja z 4 stałych szablonów z polami. Dzięki temu S-12 (edytowalne szablony) zapisze te same szablony w bazie bez zmiany silnika, a cięcie S-12 nie dotyka ponaglenia. Zmiana nie ma migracji ani API.

## Current State Analysis

- Etap i dni po terminie wylicza `escalationGroup(days, thresholds)` (`src/lib/escalation.ts:41-49`; etapy `stage_1`–`stage_4`, a `pre_threshold` i `current` są poza ponagleniem). `groupInvoices` sortuje po terminie, a potem po numerze (`pl`, `numeric`) (`src/lib/escalation.ts:51-73`).
- Odsetki i rekompensatę w groszach liczą `interestGrosze` i `compensationGrosze` (`src/lib/charges.ts:38-63`), a przełącznik klienta przychodzi w `Invoice.clientChargesCompensation` (`src/types.ts:19`).
- Wyspa `InvoicesManager` ma w stanie wszystkie otwarte faktury użytkownika i `today` z serwera, a fakturę dodaną w dialogu dopisuje do stanu (`src/components/invoices/InvoicesManager.tsx:39-54`). Ponaglenie może więc powstać w przeglądarce, bez nowego endpointu.
- Formatery `formatAmount` (Intl `pl-PL`, PLN) i `formatDate` (`DD.MM.YYYY`) są lokalne w wyspie (`InvoicesManager.tsx:28-37`). Ponaglenie potrzebuje tych samych formatów.
- W `src/components/ui/` jest `dialog`, `alert`, `button` i `table`, ale nie ma `textarea` ani toastów. `DialogContent` ma domyślnie `sm:max-w-sm` (`src/components/ui/dialog.tsx:51`), co jest za wąskie na treść ponaglenia.
- `/dev/ui` renderuje `InvoicesManager` z przykładowymi fakturami dwóch klientów i `SAMPLE_TODAY = "2026-10-05"` (`src/components/dev/KitchenSinkForms.tsx:17-62,237`). Sekcja „Ponaglenia” pojawi się tam sama.
- Wstrzymanych faktur jeszcze nie ma (S-08), a anulowanych i zapłaconych też nie (S-06, S-07). Wszystkie faktury w stanie wyspy są otwarte, więc ponaglenie wybiera je wyłącznie po etapie.

## Desired End State

Na `/` sekcja „Ponaglenia” wymienia klientów z co najmniej jedną fakturą na etapach 1–4. Kolejność: najwyższy etap malejąco, potem nazwa klienta (`pl`). Każdy wiersz ma kolumny: klient, najwyższy etap, liczba faktur w ponagleniu, „Razem do zapłaty” i przycisk „Generuj ponaglenie”. Jeśli takich klientów nie ma, sekcja pokazuje tekst „Żaden klient nie ma faktur na etapach 1–4.”. Faktura dodana w dialogu od razu aktualizuje sekcję.

Dialog pokazuje edytowalne pole z treścią i przycisk „Kopiuj do schowka”. Po udanym kopiowaniu przycisk na 2 s zmienia się w „Skopiowano”. Po nieudanym pojawia się komunikat z prośbą o ręczne kopiowanie, a treść w polu zostaje zaznaczona. Ręczne zmiany w polu niczego nie zapisują i znikają po zamknięciu dialogu.

Przykład na danych z `/dev/ui` (dziś 05.10.2026). Acme Sp. z o.o. (rekompensata włączona) ma trzy pozycje w ponagleniu: FV/2026/08/001 (1234,56 zł, 46 dni, odsetki 21,39 zł, rekompensata 170,00 zł), FV/2026/08/002 (6500,00 zł, 41 dni, 100,39 zł, 297,50 zł) i FV/2026/09/007 (999,00 zł, 9 dni, 3,39 zł, 170,00 zł). FV/2026/10/002 (1 dzień po terminie) jest przed pierwszym progiem i nie wchodzi do ponaglenia. Najwyższy etap to 4. Podsumowanie: należność główna 8733,56 zł, odsetki 125,17 zł, rekompensata 637,50 zł, razem do zapłaty 9496,23 zł, termin zapłaty 12.10.2026. Żabka Handel (rekompensata wyłączona) ma etap 3, dwie pozycje (FV/2026/09/004 i FV/2026/09/010), odsetki 7,54 zł i razem 3008,04 zł. Ani pozycje, ani podsumowanie nie mają linii o rekompensacie.

Weryfikacja: Vitest pokrywa wybór faktur, etap, sumy, oba warianty rekompensaty, odmianę „dzień/dni” i pełny render szablonów. Ręcznie sprawdzamy sekcję, dialog, schowek i `/dev/ui`. Po merge zmiana jest na produkcji.

### Key Discoveries:

- `Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" })` wstawia twardą spację U+00A0 przed „zł” i jako separator tysięcy. Separator pojawia się dopiero od 5 cyfr części całkowitej: „1234,56 zł”, ale „12 345,67 zł”. Oczekiwane teksty w testach muszą mieć U+00A0, inaczej porównanie się nie powiedzie mimo identycznego wyglądu.
- Rekompensata w PRD przysługuje per faktura (`compensationGrosze` liczy ją per pozycja), więc suma rekompensat klienta to suma pozycji (Acme: 170,00 + 297,50 + 170,00 = 637,50 zł).
- Etap w ponagleniu to maksimum etapów pozycji, a nie etap najstarszej faktury. Przy domyślnych progach to to samo, ale funkcja nie może zakładać kolejności.

## What We're NOT Doing

- Dane nadawcy (nazwa firmy, NIP, adres, numer konta, podpis). Szablony kończą się „Z poważaniem” bez podpisu, a dane dopisuje się ręcznie w polu tekstowym. Dane nadawcy to osobny slice S-13 `sender-profile` (profil nadawcy i pole `{nadawca}` w szablonach), już dodany do roadmapy (2026-10-06).
- Edycja i zapis szablonów (S-12). Szablony to stała w kodzie przekazywana do funkcji jako parametr.
- Zapisywanie, że ponaglenie zostało wygenerowane lub wysłane, oraz historia ponagleń. PRD tego nie wymaga.
- Wysyłka e-mail (PRD Non-Goals) i PDF.
- Wykluczanie wstrzymanych faktur (S-08 doda filtr w tym samym miejscu, w którym dziś są etapy).
- Ustawienia progów i stóp (S-10). Funkcja przyjmuje progi i ustawienia jako parametry z wartościami domyślnymi.
- Zmiany w `scripts/smoke.mjs`. Ponaglenie powstaje w przeglądarce, nie dotyka API ani bazy.
- Migracja bazy i nowe endpointy.

## Implementation Approach

Kolejność jak w S-03 i S-04, od rdzenia na zewnątrz. Najpierw czysty moduł: wybór faktur klienta, etap, pozycje z kwotami, sumy i render szablonu. Do tego testy, bo treść trafia bezpośrednio do klienta użytkownika, a kwoty muszą zgadzać się z listą do grosza. Formatery kwot i dat przenosimy z wyspy do `src/lib/format.ts`, żeby lista i ponaglenie formatowały identycznie. Potem UI: sekcja nad listą liczy ponaglenia przez `useMemo` z tego samego stanu faktur co lista. Dialog trzyma edytowalną kopię tekstu, a hook obsługuje schowek. Na koniec README, roadmapa, PR i potok F-01, który przy braku migracji tylko wdraża kod.

## Critical Implementation Details

- **Kopiowanie do schowka.** `navigator.clipboard.writeText` działa tylko w bezpiecznym kontekście (https lub localhost) i może zostać odrzucony przez przeglądarkę. Kopiujemy wyłącznie w obsłudze kliknięcia, a odrzucenie lub brak API traktujemy jako stan błędu z ręcznym kopiowaniem, nigdy jako cichy sukces. Kopiujemy aktualną wartość pola tekstowego, a nie wygenerowany tekst, bo użytkownik mógł go poprawić.
- **Stan pola tekstowego.** Tekst w dialogu inicjujemy przy każdym otwarciu dla danego klienta, a nie raz przy montowaniu komponentu. Inaczej drugi klient zobaczy treść pierwszego.

## Phase 1: Reguła i szablony ponaglenia

### Overview

Czysty moduł, który z listy otwartych faktur i dzisiejszej daty buduje ponaglenia per klient i renderuje treść z szablonu tonu. Do tego wspólne formatery i testy.

### Changes Required:

#### 1. Formatery

**File**: `src/lib/format.ts` (nowy), `src/components/invoices/InvoicesManager.tsx`

**Intent**: Lista i ponaglenie mają formatować kwoty i daty identycznie, więc formatery wychodzą z wyspy do `src/lib/`.

**Contract**: `formatAmount(grosze: number): string` (Intl `pl-PL`, PLN, z U+00A0) i `formatDate(iso: string): string` (`YYYY-MM-DD` → `DD.MM.YYYY`). `InvoicesManager` importuje je zamiast lokalnych kopii. Wygląd listy się nie zmienia.

#### 2. Szablony tonów

**File**: `src/lib/reminder-templates.ts` (nowy)

**Intent**: 4 stałe szablony ponaglenia, po jednym na etap, z tonem od uprzejmego przypomnienia do przedsądowego wezwania. Struktura z polami pozwoli S-12 przechowywać je jako tekst użytkownika.

**Contract**: `REMINDER_TEMPLATES: Record<ReminderStage, string>` i `PAYMENT_DEADLINE_DAYS = 7`. Pola: `{data}` (dziś, `DD.MM.YYYY`), `{klient}` (nazwa klienta), `{pozycje}` (lista pozycji), `{podsumowanie}` (blok sum) i `{termin_zapłaty}` (dziś + 7 dni kalendarzowych, `DD.MM.YYYY`). Treść domyślna (do zatwierdzenia przy przeglądzie fazy, zmiany słów nie wymagają zmiany planu):

```text
— Etap 1 —
Przypomnienie o płatności
{data}

{klient}

Dzień dobry,

uprzejmie przypominam, że minął termin płatności poniższych faktur:

{pozycje}

{podsumowanie}

Być może płatność umknęła w natłoku spraw. Proszę o uregulowanie należności do {termin_zapłaty}. Jeśli przelew został już wysłany, proszę potraktować tę wiadomość jako nieaktualną.

Z poważaniem

— Etap 2 —
Ponowne przypomnienie o płatności
{data}

{klient}

Dzień dobry,

ponownie zwracam się z prośbą o zapłatę. Do dziś nie odnotowano wpłaty za poniższe faktury:

{pozycje}

{podsumowanie}

Proszę o uregulowanie pełnej kwoty do {termin_zapłaty}. Za każdy dzień opóźnienia naliczane są odsetki za opóźnienie w transakcjach handlowych.

Z poważaniem

— Etap 3 —
Wezwanie do zapłaty
{data}

{klient}

Wzywam do zapłaty zaległych należności z tytułu poniższych faktur:

{pozycje}

{podsumowanie}

Kwotę należy wpłacić najpóźniej do {termin_zapłaty}. Brak zapłaty w tym terminie spowoduje podjęcie dalszych kroków w celu odzyskania należności.

Z poważaniem

— Etap 4 —
Ostateczne przedsądowe wezwanie do zapłaty
{data}

{klient}

Wobec braku zapłaty mimo wcześniejszych przypomnień ostatecznie wzywam do zapłaty należności z tytułu poniższych faktur:

{pozycje}

{podsumowanie}

Jeżeli należność nie zostanie uregulowana do {termin_zapłaty}, sprawa zostanie skierowana na drogę postępowania sądowego, co narazi Państwa na dodatkowe koszty.

Z poważaniem
```

Linie „— Etap N —” w bloku tylko rozdzielają szablony w planie i nie są częścią treści.

#### 3. Moduł ponaglenia

**File**: `src/lib/reminder.ts` (nowy)

**Intent**: Zbudować ponaglenia per klient z otwartych faktur i wyrenderować treść. Zero zależności od Reacta i bazy.

**Contract**:
- `type ReminderStage = 1 | 2 | 3 | 4`.
- `buildClientReminders(invoices: Invoice[], today: string, thresholds = DEFAULT_THRESHOLDS, settings = DEFAULT_CHARGE_SETTINGS): ClientReminder[]`. Bierze tylko faktury z grupą `stage_1`–`stage_4` i grupuje je po `clientId`. `stage` to maksimum etapów pozycji. Pozycje są posortowane po terminie, a potem po numerze, tak jak w `groupInvoices`. Każda pozycja ma `number`, `amountGrosze`, `dueDate`, `daysOverdue`, `interestGrosze` i `compensationGrosze`. Sumy klienta: `principalGrosze`, `interestGrosze`, `compensationGrosze` i `totalGrosze` (suma trzech). Klient bez pozycji nie trafia do wyniku. Wynik jest posortowany po `stage` malejąco, a potem po nazwie klienta (`localeCompare` z `"pl"`). `ClientReminder` ma też `clientId`, `clientName` i `chargesCompensation`.
- `renderReminder(reminder: ClientReminder, today: string, templates = REMINDER_TEMPLATES): string`. Wybiera `templates[reminder.stage]` i podstawia pola, każde wystąpienie, w jednym przejściu `replace(/\{([^{}]+)\}/gu, …)` z mapą pól (nie osobnym `replaceAll` na pole, bo nazwa klienta z „{data}” zostałaby podmieniona drugi raz; nie `\w`, bo nie dopasuje „ł” w `{termin_zapłaty}`). Nieznane pola zostają bez zmian. Format pozycji (numeracja od 1, jedna linia na fakturę):
  `1. Faktura FV/2026/08/001 — kwota 1234,56 zł, termin płatności 20.08.2026, 46 dni po terminie, odsetki 21,39 zł, rekompensata 170,00 zł`
  Przy `daysOverdue === 1` jest „1 dzień po terminie” (możliwe po zmianie progów w S-10). Gdy `chargesCompensation` jest `false`, końcówki „, rekompensata …” nie ma. Blok podsumowania to kolejne linie: „Należność główna: …”, „Odsetki: …”, „Rekompensata: …” (pomijana, gdy `chargesCompensation` jest `false`) i „Razem do zapłaty: …”.
- `{termin_zapłaty}` liczymy jako dzień kalendarzowy dziś + `PAYMENT_DEADLINE_DAYS` na datach UTC, tak jak `daysOverdue`, więc zmiana czasu nie przesuwa wyniku.

#### 4. Testy

**File**: `src/lib/reminder.test.ts` (nowy)

**Intent**: Przypiąć regułę FR-008 i zawartość FR-011, w tym przykład z „Desired End State”.

**Contract**: przypadki opisane w „Testing Strategy → Unit Tests”. Oczekiwane kwoty w tekstach zapisujemy z U+00A0 (np. `"1234,56 zł"`).

### Success Criteria:

#### Automated Verification:

- Testy ponaglenia, wyliczeń i reguły przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`

#### Manual Verification:

- Przegląd treści 4 szablonów i formatu pozycji oraz podsumowania w wyrenderowanym przykładzie z testu (Acme etap 4, Żabka etap 3 bez rekompensaty)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Sekcja „Ponaglenia” i dialog

### Overview

Sekcja nad listą faktur na `/`, dialog z edytowalną treścią, kopiowanie do schowka i stany w `/dev/ui`.

### Changes Required:

#### 1. Komponent pola tekstowego

**File**: `src/components/ui/textarea.tsx` (nowy, przez `npx shadcn@latest add textarea`)

**Intent**: Edytowalne pole na treść ponaglenia w stylu lyra, zgodne z tokenami.

**Contract**: komponent shadcn bez zmian kolorów. Wysokość ustawiamy przez `rows`, a nie przez arbitralne klasy. Textarea z rejestru lyra ma `field-sizing-content` (pole rośnie z treścią i ignoruje `rows`), a `DialogContent` nie ma max-height ani overflow. Dlatego w dialogu Textarea dostaje `className="field-sizing-fixed"` (layout, nie kolor), żeby `rows` działało, a długa treść przewijała się w polu, a nie wypychała dialog poza ekran.

#### 2. Hook schowka

**File**: `src/components/hooks/use-copy-to-clipboard.ts` (nowy)

**Intent**: Kopiowanie z jawnym stanem sukcesu i błędu.

**Contract**: `useCopyToClipboard(): { status: "idle" | "copied" | "error"; copy(text: string): Promise<void>; reset(): void }`. `copied` wraca do `idle` po 2 s (timer czyszczony przy odmontowaniu i przy kolejnym kopiowaniu). Brak `navigator.clipboard` lub odrzucona obietnica dają `error`.

#### 3. Dialog ponaglenia

**File**: `src/components/invoices/ReminderDialog.tsx` (nowy)

**Intent**: Pokazać treść ponaglenia klienta do poprawienia i skopiowania.

**Contract**:
- `ReminderDialog({ reminder, today, open, onOpenChange, onCloseAutoFocus })` trzyma tekst w stanie i ustawia go z `renderReminder` przy każdym otwarciu dla klienta.
- Prezentacyjny `ReminderDialogView` (wzorzec `InvoiceFormView`) przyjmuje tekst, `onTextChange`, `status` i `onCopy`, żeby `/dev/ui` mogło pokazać stany bez schowka.
- Tytuł „Ponaglenie — {nazwa klienta}”, a opis „Etap N · Faktury: {liczba} · Razem do zapłaty: {kwota}” (zapis „Faktury: N” omija odmianę liczebnika).
- `DialogContent` dostaje `className="sm:max-w-2xl"` (szerokość, nie kolor), a `Textarea` ma etykietę „Treść ponaglenia”, `rows={18}` i `className="field-sizing-fixed"`.
- Przyciski to „Kopiuj do schowka” (w stanie `copied` ikona `Check` i tekst „Skopiowano”) oraz „Zamknij”.
- W stanie `error` pod polem jest `Alert` w wariancie `destructive` z tekstem „Nie udało się skopiować do schowka. Zaznacz treść i skopiuj ją ręcznie (Ctrl+C lub ⌘C).”, a pole zostaje zaznaczone (`select()`).
- Stan kopiowania jest ogłaszany w regionie `aria-live="polite"`.

#### 4. Sekcja „Ponaglenia”

**File**: `src/components/invoices/RemindersSection.tsx` (nowy), `src/components/invoices/InvoicesManager.tsx`

**Intent**: Pokazać klientów do ponaglenia i otwierać dla nich dialog.

**Contract**:
- `RemindersSection({ invoices, today })` liczy `buildClientReminders` w `useMemo`. Renderuje nagłówek „Ponaglenia” i `Table` z kolumnami: Klient, Etap (np. „Etap 4”), Faktury, Razem do zapłaty (do prawej) i przycisk „Generuj ponaglenie” w wariancie `outline` z `aria-label` zawierającym nazwę klienta.
- Pusty wynik daje tekst „Żaden klient nie ma faktur na etapach 1–4.” w `text-muted-foreground`.
- Fokus wraca na przycisk, który otworzył dialog (wzorzec `openerRef` z `InvoicesManager.tsx:42-48,142-145`).
- `InvoicesManager` renderuje sekcję nad grupami faktur, gdy `invoices.length > 0`, i przekazuje jej ten sam stan `invoices`.

#### 5. Kitchen sink

**File**: `src/components/dev/KitchenSinkForms.tsx`

**Intent**: `/dev/ui` pokazuje stany nowego komponentu formularza (wymóg z `CLAUDE.md`).

**Contract**: sekcje „ReminderDialogView: default”, „ReminderDialogView: copied” i „ReminderDialogView: copy error” z treścią z `renderReminder` dla przykładowego klienta Acme i `SAMPLE_TODAY`. Sekcja „Ponaglenia” pojawia się sama w istniejącym przykładzie `InvoicesManager`, a pusty stan (gdy nikt nie przekroczył etapu 1) pokazuje osobny przykład z jedną fakturą bieżącą.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi (w tym zakaz literałów kolorów): `npm run lint`
- Typy przechodzą: `npx astro check`
- Testy przechodzą: `npm test`
- Build przechodzi: `npm run build`
- Smoke przechodzi lokalnie (z `npm run dev` i lokalnym Supabase): `npm run smoke`

#### Manual Verification:

- Sekcja „Ponaglenia” na `/` pokazuje tylko klientów z fakturami na etapach 1–4, z najwyższym etapem i kwotą „Razem do zapłaty”; faktura przed pierwszym progiem i bieżąca nie wchodzą do ponaglenia
- Dialog klienta z kilkoma fakturami pokazuje jedno ponaglenie w tonie najwyższego etapu, z pozycjami (numer, kwota, termin, dni po terminie, odsetki, rekompensata) i podsumowaniem zgodnym z kwotami na liście
- Klient z wyłączoną rekompensatą ma ponaglenie bez linii o rekompensacie w pozycjach i podsumowaniu
- „Kopiuj do schowka” kopiuje treść z ręcznymi poprawkami, przycisk pokazuje „Skopiowano”, a wklejony tekst w programie pocztowym ma zachowane linie
- Faktura dodana w dialogu od razu zmienia sekcję „Ponaglenia”; po zamknięciu dialogu fokus wraca na przycisk klienta
- `/dev/ui` pokazuje stany dialogu (default, copied, copy error) i pusty stan sekcji w trybie jasnym i ciemnym

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Wdrożenie

### Overview

Dokumentacja, roadmapa, PR i wdrożenie przez potok F-01. Zmiana nie ma migracji, więc `db push` nic nie stosuje, a `wrangler deploy` wdraża kod. Na końcu weryfikacja na produkcji.

### Changes Required:

#### 1. README

**File**: `README.md`

**Intent**: Opisać nowy stan ekranu głównego.

**Contract**: w tabeli tras wiersz `/` wspomina sekcję ponagleń z kopiowaniem zbiorczego ponaglenia klienta do schowka.

#### 2. Roadmapa

**File**: `context/foundation/roadmap.md`

**Intent**: Zamknąć otwarte pytanie z S-05.

**Contract**: przy Unknown „Jakie domyślne treści mają 4 szablony tonów (etap 1–4)?” dopisać rozstrzygnięcie: stałe szablony w `src/lib/reminder-templates.ts` (przypomnienie, ponowne przypomnienie, wezwanie do zapłaty, ostateczne przedsądowe wezwanie), termin zapłaty dziś + 7 dni, bez danych nadawcy (decyzja z planowania 2026-10-06). Statusów nie ruszamy; to robią `/10x-implement` i `/10x-archive`. Slice S-13 `sender-profile` jest już w roadmapie.

#### 3. PR i wdrożenie

**Intent**: Zmiana trafia na produkcję wyłącznie przez gałąź i PR (README §Deployment).

**Contract**:
- gałąź `feat/collective-reminder` i PR;
- merge po zielonym `checks`;
- job `deploy` przechodzi (`db push` bez nowych migracji, potem `wrangler deploy`);
- bez ręcznego `wrangler deploy`.

### Success Criteria:

#### Automated Verification:

- Job `checks` na PR jest zielony: `gh pr checks`
- Job `deploy` po merge jest zielony: `gh run list --branch main --limit 1`

#### Manual Verification:

- Na produkcji klient z fakturą na etapie 1–4 ma ponaglenie, które kopiuje się do schowka (https)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `src/lib/reminder.test.ts`:
  - wybór faktur: z mieszanki grup (bieżąca, przed progiem, etapy 1–4) do ponaglenia wchodzą tylko etapy 1–4; klient mający wyłącznie faktury bieżące lub przed progiem nie ma ponaglenia;
  - etap: maksimum etapów pozycji, także gdy faktura z wyższym etapem nie jest pierwsza na wejściu; granice progów (dzień 3 → etap 1, dzień 2 → brak ponaglenia, dzień 30 → etap 4);
  - grupowanie po `clientId`: dwóch klientów o różnych fakturach daje dwa ponaglenia; kolejność wyniku po etapie malejąco, potem po nazwie;
  - sumy: przykład Acme z `/dev/ui` (8733,56 / 125,17 / 637,50 / 9496,23 zł) i Żabka (3000,50 / 7,54 / 0 / 3008,04 zł);
  - render: pełny tekst Acme (etap 4) porównany z oczekiwanym, z pozycjami, podsumowaniem, datą 05.10.2026 i terminem zapłaty 12.10.2026; Żabka (etap 3) bez słowa „rekompensata”; każdy z 4 szablonów po renderze nie zawiera `{` ani `}`; „1 dzień po terminie” przy progach `[1, 2, 3, 4]`; termin zapłaty przez koniec miesiąca (28.10 → 04.11).
- `src/lib/format.test.ts` (nowy): `formatAmount` z U+00A0 i separatorem tysięcy od 5 cyfr, `formatDate`.
- `src/lib/charges.test.ts` i `src/lib/escalation.test.ts` bez zmian (regresja).

### Integration Tests:

- `scripts/smoke.mjs` bez zmian: potwierdza, że strona `/` z nową sekcją się renderuje, a API faktur i izolacja kont działają jak wcześniej.

### Manual Testing Steps:

1. Dodaj klientowi z rekompensatą faktury z terminami 40, 10 i 1 dzień temu: sekcja pokazuje go z etapem 4 i dwiema fakturami; faktura sprzed 1 dnia nie jest w ponagleniu.
2. Otwórz dialog: ton etapu 4, dwie pozycje, kwoty jak w kolumnach listy, razem = suma kwot, odsetek i rekompensat.
3. Wyłącz klientowi rekompensatę na `/clients`, wróć na `/`: ponaglenie bez linii o rekompensacie, razem pomniejszone o rekompensaty.
4. Dopisz w polu numer konta, kliknij „Kopiuj do schowka”, wklej w programie pocztowym: tekst z poprawką i podziałem linii; przycisk pokazał „Skopiowano”.
5. Zamknij i otwórz dialog ponownie: poprawka zniknęła, tekst wygenerowany od nowa. Otwórz dialog innego klienta: jego treść, nie poprzedniego.
6. Dodaj nową fakturę z terminem 5 dni temu klientowi bez ponaglenia: sekcja od razu pokazuje go z etapem 1.

## Performance Considerations

Mała skala (PRD: `data_volume: small`). Ponaglenia liczy jeden `useMemo` na zmianę stanu faktur, a render tekstu działa tylko po otwarciu dialogu. Bez zapytań do bazy.

## Migration Notes

Brak migracji. Rollback to wycofanie Workera (README §Rollback) i revert w PR; schemat bazy się nie zmienia.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-05, S-12)
- PRD: `context/foundation/prd.md` (US-01, US-02, FR-008, FR-011, FR-014, NFR)
- Poprzedni wycinek (wzorzec): `context/archive/2026-10-06-interest-and-compensation/plan.md`
- Reguła etapów: `src/lib/escalation.ts:41-73`
- Wyliczenia kwot: `src/lib/charges.ts:38-63`
- Wyspa listy i formatery: `src/components/invoices/InvoicesManager.tsx:28-54,142-145`
- Szerokość dialogu: `src/components/ui/dialog.tsx:51`
- Kitchen sink: `src/components/dev/KitchenSinkForms.tsx:17-62,237`
- Lekcje: `context/foundation/lessons.md` (dev server, `className` w `.astro`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguła i szablony ponaglenia

#### Automated

- [x] 1.1 Testy ponaglenia, wyliczeń i reguły przechodzą: `npm test` — 54c8110
- [x] 1.2 Lint przechodzi: `npm run lint` — 54c8110
- [x] 1.3 Typy przechodzą: `npx astro check` — 54c8110

#### Manual

- [x] 1.4 Przegląd treści 4 szablonów i formatu pozycji oraz podsumowania w wyrenderowanym przykładzie z testu (Acme etap 4, Żabka etap 3 bez rekompensaty) — 54c8110

### Phase 2: Sekcja „Ponaglenia” i dialog

#### Automated

- [x] 2.1 Lint przechodzi (w tym zakaz literałów kolorów): `npm run lint` — 9cd748e
- [x] 2.2 Typy przechodzą: `npx astro check` — 9cd748e
- [x] 2.3 Testy przechodzą: `npm test` — 9cd748e
- [x] 2.4 Build przechodzi: `npm run build` — 9cd748e
- [x] 2.5 Smoke przechodzi lokalnie (z `npm run dev` i lokalnym Supabase): `npm run smoke` — 9cd748e

#### Manual

- [x] 2.6 Sekcja „Ponaglenia” na `/` pokazuje tylko klientów z fakturami na etapach 1–4, z najwyższym etapem i kwotą „Razem do zapłaty”; faktura przed pierwszym progiem i bieżąca nie wchodzą do ponaglenia — 9cd748e
- [x] 2.7 Dialog klienta z kilkoma fakturami pokazuje jedno ponaglenie w tonie najwyższego etapu, z pozycjami (numer, kwota, termin, dni po terminie, odsetki, rekompensata) i podsumowaniem zgodnym z kwotami na liście — 9cd748e
- [x] 2.8 Klient z wyłączoną rekompensatą ma ponaglenie bez linii o rekompensacie w pozycjach i podsumowaniu — 9cd748e
- [x] 2.9 „Kopiuj do schowka” kopiuje treść z ręcznymi poprawkami, przycisk pokazuje „Skopiowano”, a wklejony tekst w programie pocztowym ma zachowane linie — 9cd748e
- [x] 2.10 Faktura dodana w dialogu od razu zmienia sekcję „Ponaglenia”; po zamknięciu dialogu fokus wraca na przycisk klienta — 9cd748e
- [x] 2.11 `/dev/ui` pokazuje stany dialogu (default, copied, copy error) i pusty stan sekcji w trybie jasnym i ciemnym — 9cd748e

### Phase 3: Wdrożenie

#### Automated

- [x] 3.1 Job `checks` na PR jest zielony: `gh pr checks` — f1dcae9
- [x] 3.2 Job `deploy` po merge jest zielony: `gh run list --branch main --limit 1` — f1dcae9

#### Manual

- [x] 3.3 Na produkcji klient z fakturą na etapie 1–4 ma ponaglenie, które kopiuje się do schowka (https) — f1dcae9
