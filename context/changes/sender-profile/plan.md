# Profil nadawcy wstawiany do ponagleń — Implementation Plan

## Overview

S-13 z roadmapy (poza PRD v1; dotyczy FR-011). Użytkownik zapisuje na `/settings`, w karcie „Dane nadawcy”, nazwę firmy, NIP, adres i numer konta. Wygenerowane ponaglenie wstawia te dane samo:

- nazwę, adres i NIP pod „Z poważaniem” (pole `{nadawca}`),
- numer konta w zdaniu o terminie zapłaty (pole `{konto}`: „… do 17.10.2026 na rachunek nr 61 1090 1014 0000 0712 1981 2874”).

Profil z pustymi polami nie zostawia w tekście placeholderów ani pustych linii. Gdy wszystkie 4 pola są puste, okno ponaglenia pokazuje podpowiedź z linkiem do Ustawień.

## Current State Analysis

- `renderReminder` (`src/lib/reminder.ts:122-137`) buduje mapę `fields` (`data`, `klient`, `pozycje`, `podsumowanie`, `termin_zapłaty`) i podstawia ją w jednym przejściu regexem. Wartość pola nie jest podstawiana ponownie (test `reminder.test.ts:198-202`). Trzeci parametr `templates` ma wartość domyślną `REMINDER_TEMPLATES`.
- Każdy z 4 szablonów (`src/lib/reminder-templates.ts:9-71`) kończy się na „Z poważaniem” bez końcowego znaku nowej linii. Zdanie z `{termin_zapłaty}` jest w każdym szablonie inne (etap 1 `:23`, 2 `:39`, 3 `:53`, 4 `:69`).
- Tekst powstaje w przeglądarce: `ReminderContent` (`src/components/invoices/ReminderDialog.tsx:94`) woła `renderReminder(reminder, today)`. Dane idą z `src/pages/index.astro:24-28` (`Promise.all` z `getSettings`) przez `InvoicesManager` (`:35`, `:145`) do `RemindersSection` → `ReminderDialog`.
- Wzorzec do skopiowania to S-10:
  - migracja `supabase/migrations/20261010120000_create_user_settings.sql` (PK `user_id default auth.uid()`, RLS 4×2, `delete` zablokowany),
  - serwis `src/lib/services/settings.ts` (`maybeSingle` + domyślne z kodu, `upsert onConflict user_id`),
  - API `src/pages/api/settings.ts` (`PUT`, 401/500/400 z `fieldErrors`),
  - schemat `src/lib/settings-schemas.ts` (tekst z formularza → wartości domenowe),
  - hook `src/components/hooks/use-settings-form.ts`, widok `src/components/settings/SettingsForm.tsx` (`SettingsFormView` + kontener) oraz strona `src/pages/settings.astro`.
- Walidacja NIP już jest: `normalizeNip`/`isValidNip` (`src/lib/nip.ts`), używana w `src/lib/client-schemas.ts:10`. Walidatora numeru konta nie ma.
- `user_settings` ma progi i stawki jako `NOT NULL`. Kolumny nadawcy w tej tabeli wymusiłyby zapis reguły eskalacji przy zapisie profilu, dlatego profil dostaje osobną tabelę.
- `/dev/ui` (`src/components/dev/KitchenSinkForms.tsx`) renderuje `SettingsFormView`, `ReminderDialogView` i `InvoicesManager`, więc nowe propsy trzeba tam też podać.

## Desired End State

- Na `/settings`, nad formularzem reguły eskalacji, jest osobny formularz z kartą „Dane nadawcy” i własnym przyciskiem „Zapisz”. Ma cztery opcjonalne pola:
  - nazwa firmy (≤ 200 znaków),
  - NIP (z sumą kontrolną, akceptuje spacje, myślniki i prefiks `PL`),
  - adres (pole wieloliniowe, ≤ 300 znaków),
  - numer konta (polski NRB/IBAN: 26 cyfr, opcjonalny prefiks `PL`, spacje i myślniki, kontrola mod-97).
- Po zapisie pola pokazują wartości znormalizowane:
  - NIP jako 10 cyfr,
  - konto jako `61 1090 1014 0000 0712 1981 2874`,
  - puste pole jako pusty tekst.
- Zapis z wszystkimi polami pustymi czyści profil (wiersz z samymi `null`).
- Ponaglenie z pełnym profilem kończy się tak:
  ```
  Z poważaniem
  Firma Testowa Sp. z o.o.
  ul. Prosta 1
  00-001 Warszawa
  NIP: 5260250995
  ```
  W zdaniu o terminie dochodzi wtedy ` na rachunek nr 61 1090 1014 0000 0712 1981 2874` bezpośrednio po dacie.
- Brakujące pole po prostu znika. Bez konta zdanie o terminie wygląda jak dziś. Bez nazwy, adresu i NIP-u tekst kończy się na „Z poważaniem”.
- Gdy wszystkie 4 pola profilu są puste (albo użytkownik nie ma wiersza), okno ponaglenia pokazuje pod polem tekstowym Alert „Ponaglenie nie zawiera danych nadawcy. Uzupełnij je w Ustawieniach.” z linkiem do `/settings`. Alert nie trafia do tekstu kopiowanego do schowka. Wystarczy jedno wypełnione pole, żeby Alert zniknął.
- Profil widzi i zmienia wyłącznie jego właściciel (RLS).

### Key Discoveries:

- Nowe pola to tylko nowe klucze w mapie `fields`. Jedno przejście podstawiania (`reminder.ts:134`) gwarantuje, że np. nazwa firmy `Firma {data}` nie zostanie podstawiona ponownie.
- `{konto}` niesie własną spację wiodącą (` na rachunek nr …` albo pusty tekst). Dzięki temu w szablonie stoi `do {termin_zapłaty}{konto}.` i przy pustym koncie zdanie jest identyczne z dzisiejszym.
- `{nadawca}` stoi w osobnej linii pod „Z poważaniem”. `renderReminder` obcina końcowe białe znaki wyniku (`trimEnd`), więc pusty blok nie zostawia linii na końcu. Istniejący test pełnego tekstu (`reminder.test.ts:158-180`) pozostaje zielony bez zmian.
- Przykładowy poprawny numer: `PL61109010140000071219812874` (mod-97 = 1, sprawdzone).

## What We're NOT Doing

- Edytowalne szablony (FR-014, zaparkowane). Pola `{nadawca}` i `{konto}` trafiają tylko do stałych szablonów w kodzie.
- Konta zagraniczne i IBAN spoza Polski: walidacja przyjmuje wyłącznie polski NRB/IBAN.
- Sumy kontrolne NIP i konta w bazie: baza sprawdza tylko format (10 i 26 cyfr), a sumy kontrolne sprawdza kod, tak jak przy `clients.nip`.
- Podział adresu na ulicę, kod i miasto: adres to jedno pole wieloliniowe.
- Nagłówek pisma z danymi nadawcy u góry ponaglenia.
- Osobna strona `/profile` i link w Topbar: profil żyje na `/settings`.
- Usuwanie wiersza profilu: wyczyszczenie to zapis pustych pól.

## Implementation Approach

Trzy pionowe kroki, każdy weryfikowalny osobno:

1. Dane i API: tabela, typy, walidacja, serwis, endpoint.
2. Czysta logika tekstu ponaglenia z testami jednostkowymi.
3. UI i przepływ profilu do okna ponaglenia.

Każda warstwa kopiuje odpowiadający jej plik z S-10, zamiast budować nową abstrakcję. Formatowanie bloku nadawcy i numeru konta to czyste funkcje w `src/lib/`, używane przez `renderReminder` i formularz.

## Faza 1: Dane i API profilu nadawcy

### Overview

Tabela `sender_profiles` z RLS, typy, walidacja numeru konta i schemat formularza z testami, serwis odczytu i zapisu oraz `PUT /api/sender-profile`.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261010140000_create_sender_profiles.sql`

**Intent**: Jeden wiersz profilu na użytkownika. Wszystkie pola są opcjonalne, a brak wiersza znaczy „profil pusty”.

**Contract**: Tabela `public.sender_profiles` ma kolumny:

- `user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade`,
- `company_name text null check (char_length(company_name) between 1 and 200)`,
- `nip text null check (nip ~ '^[0-9]{10}$')`,
- `address text null check (char_length(address) between 1 and 300)`,
- `bank_account text null check (bank_account ~ '^[0-9]{26}$')`,
- `updated_at timestamptz not null default now()`.

RLS włączony. Polityki 4 operacje × `anon`/`authenticated` jak w `create_user_settings`: `authenticated` widzi i zmienia tylko `auth.uid() = user_id`, `delete` dla `authenticated` jest `using (false)`, a `anon` nie ma żadnego dostępu. Komentarz w nagłówku mówi, że ograniczenia muszą się zgadzać z `src/lib/sender-profile-schemas.ts`.

#### 2. Typy

**File**: `src/types.ts`

**Intent**: Typ domenowy profilu i typ wejścia formularza (tekst).

**Contract**:

- `SenderProfile { companyName: string | null; nip: string | null; address: string | null; bankAccount: string | null }`. NIP to 10 cyfr, konto to 26 cyfr bez `PL`, a `null` oznacza brak.
- `SenderProfileInput` ma te same klucze jako `string`.

#### 3. Numer konta

**File**: `src/lib/iban.ts` (+ `src/lib/iban.test.ts`)

**Intent**: Normalizacja, walidacja i formatowanie polskiego numeru konta, wzorowane na `nip.ts`.

**Contract**:

- `normalizeBankAccount(raw)` usuwa spacje i myślniki oraz prefiks `PL` bez względu na wielkość liter.
- `isValidBankAccount(digits)` sprawdza 26 cyfr i mod-97 IBAN. Liczy na `BigInt`, czyli `BBAN + "2521" + cyfry kontrolne`, gdzie `P = 25`, `L = 21`, a wynik musi wynosić 1.
- `formatBankAccount(digits)` daje `"61 1090 1014 0000 0712 1981 2874"` (2 cyfry + 6 grup po 4).
- Testy: poprawny numer z prefiksem i bez, ze spacjami i myślnikami; zmieniona jedna cyfra jest odrzucana; 25 i 27 cyfr są odrzucane; litery w środku są odrzucane.

#### 4. Profil — stałe i formatowanie

**File**: `src/lib/sender-profile.ts` (+ `src/lib/sender-profile.test.ts`)

**Intent**: Czyste funkcje wspólne dla ponaglenia, formularza i okna.

**Contract**:

- `EMPTY_SENDER_PROFILE` ma wszystkie pola `null`.
- `isSenderProfileEmpty(profile)` zwraca `true` wtedy i tylko wtedy, gdy wszystkie 4 pola są `null`.
- `senderBlock(profile)` łączy znakami nowej linii, w tej kolejności: nazwę, niepuste przycięte linie adresu i `NIP: <nip>`. Pomija brakujące elementy, a przy braku wszystkich zwraca `""`.
- `bankAccountClause(profile)` zwraca `" na rachunek nr <formatBankAccount>"` albo `""`.

#### 5. Schemat formularza

**File**: `src/lib/sender-profile-schemas.ts` (+ `src/lib/sender-profile-schemas.test.ts`)

**Intent**: Tekst z formularza lub API przechodzi w `SenderProfile`. Każde pole jest przycinane, a pusty tekst daje `null`.

**Contract**: `senderProfileInputSchema: z.ZodType<SenderProfile>` z kluczami `SenderProfileInput` i komunikatami po polsku pod polem:

- `companyName`: ≤ 200 znaków po przycięciu,
- `nip`: `normalizeNip` + `isValidNip`, komunikat jak w `client-schemas.ts`,
- `address`: ≤ 300 znaków po przycięciu, z zachowanymi znakami nowej linii,
- `bankAccount`: `normalizeBankAccount` + `isValidBankAccount`, komunikat „Podaj poprawny numer konta (26 cyfr, np. 61 1090 1014 0000 0712 1981 2874)”.

Testy pokrywają: wszystkie pola puste lub same spacje dają same `null`; normalizację NIP i konta; błędny NIP i konto z błędem pod właściwym kluczem; przekroczone limity długości.

#### 6. Serwis

**File**: `src/lib/services/sender-profile.ts`

**Intent**: Odczyt i zapis profilu zalogowanego użytkownika, jak w `services/settings.ts`.

**Contract**:

- `getSenderProfile(supabase): Promise<SenderProfile>` czyta przez `maybeSingle`, a przy braku wiersza zwraca `EMPTY_SENDER_PROFILE`.
- `saveSenderProfile(supabase, profile): Promise<SenderProfile>` robi `upsert` z `updated_at` i `onConflict: "user_id"`.
- Mapowanie wierszy snake_case ↔ camelCase. Błąd Supabase rzuca wyjątek.

#### 7. API

**File**: `src/pages/api/sender-profile.ts`

**Intent**: Zapis profilu, kopia `api/settings.ts`.

**Contract**: `export const prerender = false`. `PUT` zwraca:

- 401 `unauthorized`, gdy brak użytkownika,
- 500 `config_missing`, gdy brak konfiguracji,
- 400 `invalid_input` z `fieldErrors` (klucze `SenderProfileInput`), gdy body jest błędne,
- 200 `{ profile: SenderProfile }` po zapisie,
- 500 `unknown`, gdy zapis się nie powiedzie.

#### 8. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Grupa `senderProfileSteps()` dołączona po `snapshotSteps()`, wzorowana na `settingsSteps`.

**Contract**: Kroki:

1. Anonimowy użytkownik → 401.
2. A: błędny NIP → 400 z `fieldErrors.nip`.
3. A: błędne konto → 400 z `fieldErrors.bankAccount`.
4. A: zapis pełnego profilu (`PL61 1090-1014…`, NIP ze spacjami) → 200, a profil ma znormalizowane wartości.
5. B: zapis własnego profilu → 200.
6. A: ponowny zapis pokazuje, że B nie zmienił profilu A.
7. A i B: zapis pustych pól → 200 z samymi `null`.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się lokalnie bez utraty danych: `npx supabase migration up`
- Typy i Astro przechodzą: `npx astro check`
- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą, w tym `iban.test.ts`, `sender-profile.test.ts` i `sender-profile-schemas.test.ts`: `npm test`
- Build przechodzi: `npm run build`
- Smoke przechodzi, łącznie z grupą `senderProfileSteps`: `npm run smoke`

#### Manual Verification:

- W Supabase Studio wiersz `sender_profiles` z NIP-em innym niż 10 cyfr albo kontem innym niż 26 cyfr jest odrzucany przez check

**Implementation Note**: Po tej fazie i zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Faza 2: Dane nadawcy w tekście ponaglenia

### Overview

`renderReminder` dostaje profil i podstawia `{nadawca}` oraz `{konto}`. Wszystkie 4 szablony używają obu pól.

### Changes Required:

#### 1. Szablony

**File**: `src/lib/reminder-templates.ts`

**Intent**: Miejsce na konto w zdaniu o terminie i na blok nadawcy pod podpisem.

**Contract**: W każdym szablonie `{termin_zapłaty}` staje się `{termin_zapłaty}{konto}`:

- etap 1: „do {termin_zapłaty}{konto}. Jeśli…”,
- etap 2: „do {termin_zapłaty}{konto}. Za…”,
- etap 3: „do {termin_zapłaty}{konto}. Brak…”,
- etap 4: „do {termin_zapłaty}{konto}, sprawa…”.

Ostatnia linia każdego szablonu to `Z poważaniem\n{nadawca}`. Komentarz na górze pliku wymienia nowe pola.

#### 2. Render

**File**: `src/lib/reminder.ts`

**Intent**: Podstawianie danych nadawcy bez zmiany zachowania przy pustym profilu.

**Contract**:

- Sygnatura: `renderReminder(reminder, today, sender: SenderProfile = EMPTY_SENDER_PROFILE, templates = REMINDER_TEMPLATES)`.
- `fields.nadawca = senderBlock(sender)`, `fields.konto = bankAccountClause(sender)`.
- Wynik podstawiania przechodzi przez `trimEnd()`.

#### 3. Testy

**File**: `src/lib/reminder.test.ts`

**Intent**: Pokrycie decyzji o bloku nadawcy i koncie.

**Contract**:

- Istniejący test pełnego tekstu Acme bez profilu zostaje bez zmian (dowód, że pusty profil nie zmienia tekstu).
- Wywołanie z niestandardowymi szablonami (`:200`) przekazuje `EMPTY_SENDER_PROFILE` jako trzeci argument.
- Nowe testy:
  - pełny profil daje dokładny koniec tekstu etapu 4 (blok z nazwą, dwiema liniami adresu i `NIP: 5260250995`) i zdanie „…uregulowana do 12.10.2026 na rachunek nr 61 1090 1014 0000 0712 1981 2874, sprawa…”;
  - profil z samym kontem kończy się na „Z poważaniem” i ma zdanie z rachunkiem;
  - profil bez konta ma zdanie bez „na rachunek”;
  - adres z pustymi liniami i spacjami nie daje pustych linii w bloku;
  - nazwa firmy `Firma {klient}` nie jest podstawiana ponownie;
  - żaden z 4 szablonów nie zostawia `{` ani `}` także przy pełnym profilu.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą, w tym nowe przypadki `renderReminder`: `npm test`
- Typy i Astro przechodzą: `npx astro check`
- Lint przechodzi: `npm run lint`

**Implementation Note**: Faza nie ma kroków ręcznych. Po zielonej weryfikacji automatycznej przejdź do fazy 3.

---

## Faza 3: Formularz na `/settings` i profil w oknie ponaglenia

### Overview

Karta „Dane nadawcy” na `/settings` z własnym zapisem. Profil wczytany na `/` trafia do okna ponaglenia, a okno pokazuje podpowiedź przy pustym profilu. Do tego kitchen sink i README.

### Changes Required:

#### 1. Hook formularza

**File**: `src/components/hooks/use-sender-profile-form.ts`

**Intent**: Stan formularza profilu, kopia struktury `use-settings-form.ts` bez „Przywróć domyślne”.

**Contract**:

- `senderProfileInputText(profile)` zamienia `null` na `""`, a konto zapisuje przez `formatBankAccount`.
- `useSenderProfileForm({ initialProfile })` zwraca `{ values, setField, errors, serverError, pending, saved, submit }`.
- Walidacja klienta: `senderProfileInputSchema`.
- `submit` wysyła `PUT /api/sender-profile`. Po 200 pola dostają znormalizowane wartości z odpowiedzi i ustawia się `saved`.
- Komunikaty błędów: `unauthorized` → „Zaloguj się, aby zmienić dane nadawcy.”, `config_missing` i domyślny jak w hooku ustawień.

#### 2. Widok formularza

**File**: `src/components/settings/SenderProfileForm.tsx`

**Intent**: Karta „Dane nadawcy” z opisem „Ponaglenie wstawia je pod podpisem, a numer konta — w zdaniu o terminie zapłaty. Wszystkie pola są opcjonalne.”

**Contract**:

- `SenderProfileFormView` (propsy jak `SettingsFormView`, bez `onReset`) i kontener `SenderProfileForm({ initialProfile })`.
- Pola nazwy, NIP-u i konta to `FormField`. Adres to `Label` + `Textarea` (`src/components/ui/textarea.tsx`) z komunikatem błędu powiązanym przez `aria-describedby`, wizualnie spójnym z `FormField`.
- Przycisk `SubmitButton` „Zapisz” i komunikat „Zapisano dane nadawcy” (`Alert role="status"`).
- Bez kolorów literalnych i nadpisywania kolorów komponentów `ui`.

#### 3. Strona ustawień

**File**: `src/pages/settings.astro`

**Intent**: Dwa niezależne formularze na jednej stronie.

**Contract**:

- `getSettings` i `getSenderProfile` w `Promise.all`. Błąd któregokolwiek daje istniejący komunikat `loadError`.
- `<SenderProfileForm initialProfile={…} client:load />` nad `<SettingsForm … client:load />`. Formularze są rozdzielone śródtytułami `h2` („Dane nadawcy”, „Reguła eskalacji”) albo samymi kartami, tak by każdy przycisk „Zapisz” jednoznacznie należał do swojej sekcji.

#### 4. Profil w oknie ponaglenia

**Files**: `src/pages/index.astro`, `src/components/invoices/InvoicesManager.tsx`, `src/components/invoices/RemindersSection.tsx`, `src/components/invoices/ReminderDialog.tsx`

**Intent**: Profil wczytany na serwerze trafia do `renderReminder`, a okno informuje o pustym profilu.

**Contract**:

- `index.astro` dokłada `getSenderProfile` do `Promise.all`; domyślnie jest `EMPTY_SENDER_PROFILE`.
- Nowy prop `sender: SenderProfile` przechodzi `InvoicesManager` → `RemindersSection` → `ReminderDialog` → `ReminderContent`, który woła `renderReminder(reminder, today, sender)`.
- `ReminderDialogView` dostaje prop `senderMissing: boolean`. Gdy jest `true`, pod polem tekstowym renderuje `Alert` (wariant domyślny) z tekstem „Ponaglenie nie zawiera danych nadawcy. Uzupełnij je w Ustawieniach.”, gdzie „Ustawieniach” to link `href="/settings"`.
- `senderMissing = isSenderProfileEmpty(sender)`.

#### 5. Kitchen sink

**File**: `src/components/dev/KitchenSinkForms.tsx`

**Intent**: Stany nowego formularza i okna (zgodnie z CLAUDE.md).

**Contract**:

- `SenderProfileFormView`: pusty, wypełniony, z błędami NIP-u i konta, pending, zapisany, błąd serwera.
- `ReminderDialogView`: z `senderMissing` i bez.
- Istniejące użycia `InvoicesManager` i `ReminderDialogView` dostają nowe propsy, a przykładowy tekst ponaglenia jest renderowany z pełnym profilem.

#### 6. README

**File**: `README.md`

**Intent**: Dokumentacja nowej migracji, opisu `/settings` i grupy smoke.

**Contract**:

- Akapit o `create_sender_profiles` w sekcji migracji.
- Wiersz `/settings` w tabeli tras wspomina dane nadawcy.
- Zdanie w sekcji Smoke test: grupa `senderProfileSteps` wymaga `create_sender_profiles`.

### Success Criteria:

#### Automated Verification:

- Typy i Astro przechodzą: `npx astro check`
- Lint przechodzi (w tym zakaz kolorów literalnych): `npm run lint`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`
- Smoke przechodzi w całości: `npm run smoke`

#### Manual Verification:

- Na `/settings` zapis pełnego profilu pokazuje „Zapisano dane nadawcy”, pola mają znormalizowane wartości, a formularz reguły eskalacji jest nietknięty
- Błędny NIP i błędny numer konta pokazują komunikaty pod właściwymi polami, bez zapisu
- Ponaglenie z pełnym profilem ma blok nadawcy pod „Z poważaniem” i rachunek w zdaniu o terminie; kopia do schowka zawiera dokładnie ten tekst
- Po wyczyszczeniu wszystkich pól ponaglenie kończy się na „Z poważaniem”, a okno pokazuje podpowiedź z działającym linkiem do `/settings`
- `/dev/ui` pokazuje nowe stany formularza i okna, a oba motywy (jasny i ciemny) wyglądają poprawnie

**Implementation Note**: Po tej fazie i zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- `iban.test.ts`: normalizacja (prefiks `PL`, spacje, myślniki), mod-97 (poprawny, zmieniona cyfra), zła długość, formatowanie w grupach.
- `sender-profile.test.ts`: `isSenderProfileEmpty` (wszystkie `null` → `true`, jedno pole → `false`), `senderBlock` (kolejność, pomijanie braków, linie adresu bez pustych), `bankAccountClause`.
- `sender-profile-schemas.test.ts`: puste → `null`, normalizacja, błędy pod kluczami, limity długości.
- `reminder.test.ts`: tekst bez profilu niezmieniony; pełny i częściowy profil; brak ponownego podstawiania; brak nawiasów klamrowych.

### Integration Tests:

- `npm run smoke`, grupa `senderProfileSteps`: 401, walidacja 400, normalizacja zapisu, izolacja A/B, czyszczenie profilu.

### Manual Testing Steps:

1. Zapisz pełny profil na `/settings`, w tym konto z prefiksem `PL` i spacjami, i sprawdź znormalizowane pola po zapisie.
2. Na `/` otwórz ponaglenie klienta na etapie 4 i sprawdź blok nadawcy oraz zdanie z rachunkiem, a potem skopiuj do schowka.
3. Usuń tylko numer konta i sprawdź, że zdanie o terminie wróciło do dzisiejszej postaci, a blok nadawcy został.
4. Wyczyść wszystkie pola, otwórz ponaglenie i sprawdź podpowiedź z linkiem oraz tekst kończący się na „Z poważaniem”.

## Performance Considerations

Jedno dodatkowe zapytanie po kluczu głównym na `/` i `/settings`, wykonywane równolegle z istniejącymi w `Promise.all`. Bez znaczenia.

## Migration Notes

Nowa tabela, bez zmian w istniejących danych. Lokalnie stosuj `npx supabase migration up`, nie `db reset` (lessons.md). Na produkcję trafia przez potok po merge PR-a. Rollback wymaga nowej migracji z `drop table`.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-13)
- Wzorzec tabeli, serwisu, API i formularza: `context/archive/2026-10-10-escalation-settings/plan.md`, `supabase/migrations/20261010120000_create_user_settings.sql`, `src/lib/services/settings.ts`, `src/pages/api/settings.ts`, `src/components/settings/SettingsForm.tsx`
- Render ponaglenia: `src/lib/reminder.ts:122-137`, `src/lib/reminder-templates.ts`
- Walidacja NIP: `src/lib/nip.ts`, `src/lib/client-schemas.ts:10`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dane i API profilu nadawcy

#### Automated

- [x] 1.1 Migracja stosuje się lokalnie bez utraty danych: `npx supabase migration up` — 9964b67
- [x] 1.2 Typy i Astro przechodzą: `npx astro check` — 9964b67
- [x] 1.3 Lint przechodzi: `npm run lint` — 9964b67
- [x] 1.4 Testy jednostkowe przechodzą, w tym `iban.test.ts`, `sender-profile.test.ts` i `sender-profile-schemas.test.ts`: `npm test` — 9964b67
- [x] 1.5 Build przechodzi: `npm run build` — 9964b67
- [x] 1.6 Smoke przechodzi, łącznie z grupą `senderProfileSteps`: `npm run smoke` — 9964b67

#### Manual

- [x] 1.7 W Supabase Studio wiersz `sender_profiles` z NIP-em innym niż 10 cyfr albo kontem innym niż 26 cyfr jest odrzucany przez check — 9964b67

### Phase 2: Dane nadawcy w tekście ponaglenia

#### Automated

- [x] 2.1 Testy jednostkowe przechodzą, w tym nowe przypadki `renderReminder`: `npm test`
- [x] 2.2 Typy i Astro przechodzą: `npx astro check`
- [x] 2.3 Lint przechodzi: `npm run lint`

### Phase 3: Formularz na `/settings` i profil w oknie ponaglenia

#### Automated

- [ ] 3.1 Typy i Astro przechodzą: `npx astro check`
- [ ] 3.2 Lint przechodzi (w tym zakaz kolorów literalnych): `npm run lint`
- [ ] 3.3 Testy jednostkowe przechodzą: `npm test`
- [ ] 3.4 Build przechodzi: `npm run build`
- [ ] 3.5 Smoke przechodzi w całości: `npm run smoke`

#### Manual

- [ ] 3.6 Na `/settings` zapis pełnego profilu pokazuje „Zapisano dane nadawcy”, pola mają znormalizowane wartości, a formularz reguły eskalacji jest nietknięty
- [ ] 3.7 Błędny NIP i błędny numer konta pokazują komunikaty pod właściwymi polami, bez zapisu
- [ ] 3.8 Ponaglenie z pełnym profilem ma blok nadawcy pod „Z poważaniem” i rachunek w zdaniu o terminie; kopia do schowka zawiera dokładnie ten tekst
- [ ] 3.9 Po wyczyszczeniu wszystkich pól ponaglenie kończy się na „Z poważaniem”, a okno pokazuje podpowiedź z działającym linkiem do `/settings`
- [ ] 3.10 `/dev/ui` pokazuje nowe stany formularza i okna, a oba motywy (jasny i ciemny) wyglądają poprawnie
