---
date: 2026-10-10T10:01:15+0200
researcher: Claude Opus 5.5 (sesja Dominika Blachy)
git_commit: 2373e42
branch: main
repository: 10x-kurs
topic: "UX: komponent tabs na czterech stronach, kolejność menu, dwuwierszowy header na mobile"
tags: [research, codebase, tabs, topbar, invoices, clients, history, settings, radix-ui]
status: complete
last_updated: 2026-10-10
last_updated_by: Claude Opus 5.5
---

# Research: UX — taby, kolejność menu, header na mobile

**Date**: 2026-10-10T10:01:15+0200
**Researcher**: Claude Opus 5.5 (sesja Dominika Blachy)
**Git Commit**: 2373e42
**Branch**: main
**Repository**: 10x-kurs

## Research Question

Z `change.md`: dodać komponent obsługujący taby i podzielić strony:

- Faktury (`/`): Eskalacja · Ponaglenia · Wstrzymane
- Klienci (`/clients`): Aktywni · Nieaktywni (usunięci)
- Historia (`/history`): Zapłacone · Anulowane
- Ustawienia (`/settings`): Dane nadawcy · Reguła eskalacji

Ponadto kolejność menu: Faktury, Historia, Klienci, Ustawienia; na mobile header w dwóch wierszach (góra: login + Wyloguj, dół: pozycje menu).

Pytanie badawcze: jak te widoki są dziś zbudowane i co podział na taby oraz zmiana headera dotkną.

## Summary

1. **Prymityw tabs jest dostępny bez nowej zależności.** `radix-ui` ^1.6.7 eksportuje `Tabs` (`node_modules/radix-ui/dist/index.d.ts:57-58`), zainstalowany `@radix-ui/react-tabs` 1.1.21. `src/components/ui/tabs.tsx` nie istnieje — dodaje się go `npx shadcn@latest add tabs` (styl `radix-lyra`, `components.json`).
2. **Radix odmontowuje nieaktywny panel**, chyba że `TabsContent` dostanie `forceMount` — wtedy panel zostaje w DOM z atrybutem `hidden` (`node_modules/@radix-ui/react-tabs/dist/index.mjs:163-170`). To decyzja kluczowa dla trzech z czterech stron (fokus, stan formularzy).
3. **Granice wysp determinują, gdzie mogą żyć taby:**
   - `/` — jedna wyspa `InvoicesManager`, jeden stan `invoices`, z którego liczone są i grupy eskalacji, i ponaglenia; „Wstrzymane” to grupa `paused` z tego samego `groupInvoices`. Taby muszą być wewnątrz `InvoicesManager`.
   - `/clients` — jedna wyspa `ClientsManager`, jedna tablica klientów (aktywni i usunięci); usunięcie/przywrócenie przenosi pozycję między listami lokalnie. Taby wewnątrz `ClientsManager`.
   - `/history` — dwie niezależne wyspy bez wspólnego stanu. Taby wymagają nowej wyspy-wrappera (Astro nie współdzieli stanu klienta między wyspami).
   - `/settings` — dwie niezależne wyspy (`SenderProfileForm`, `SettingsForm`) z nagłówkiem Astro „Reguła eskalacji” pomiędzy. Taby wymagają wrappera.
4. **Ryzyka przy odmontowywaniu paneli** (bez `forceMount`): utrata niezapisanych zmian w formularzach ustawień i powrót do nieaktualnych wartości po zapisie; fokus po usunięciu/przywróceniu klienta, przywróceniu faktury z historii i po anulowaniu faktury trafia w element, którego może nie być w DOM.
5. **Teksty zależne od układu sekcji:** komunikaty 409 dla klientów odsyłają do „sekcji „Usunięci klienci”” (`src/lib/client-errors.ts:6,8`); README opisuje sekcje stron.
6. **Header:** `Topbar.astro` to jeden wiersz `flex justify-between` bez klas responsywnych, z tablicą linków w kolejności Faktury, Klienci, Historia, Ustawienia (`src/components/Topbar.astro:7-12,15`). Zmiana kolejności to przestawienie tablicy; dwa wiersze na mobile to zmiana markupu/klas w tym jednym pliku (używany na 4 stronach).
7. **Testy nie blokują zmiany:** `scripts/smoke.mjs` sprawdza tylko statusy/przekierowania stron i JSON API, nie HTML; testy jednostkowe są tylko w `src/lib/*.test.ts`.
8. Brak jakiejkolwiek obsługi stanu w URL (`?tab=`/hash) — jedyne `searchParams` to `?error=` na stronach auth (`src/pages/auth/signin.astro:7`, `signup.astro:7`).

## Detailed Findings

### Komponent Tabs i reguły UI

- `radix-ui` w `package.json:32`; eksport `Tabs` w `node_modules/radix-ui/dist/index.d.ts:57-58`; wersja `@radix-ui/react-tabs` 1.1.21.
- Istniejące komponenty ui importują z pakietu zbiorczego, np. `import { Switch as SwitchPrimitive } from "radix-ui"` (`src/components/ui/switch.tsx:3`), analogicznie `dialog.tsx:3`, `select.tsx:3`.
- `TabsContent`: `Presence present={forceMount || isSelected}` i `hidden: !present` (`node_modules/@radix-ui/react-tabs/dist/index.mjs:153-170`) — bez `forceMount` treść nieaktywnego taba jest odmontowana.
- Tokeny w `src/styles/global.css` (`:root` :11-44, `.dark` :46-78, `@theme inline` :80-116): `--muted`, `--accent` (ta sama wartość co muted), `--border`, `--ring`, `--radius: 0rem`. Brak tokenów specyficznych dla tabs/nav — prawdopodobnie niepotrzebne, shadcn tabs używa ról muted/background/foreground.
- ESLint `no-restricted-syntax` (`eslint.config.js:73-97`) zabrania w widokach hexów, `rgb/hsl/oklch(`, wartości arbitralnych `-[Npx|rem]` i klas palety Tailwind; `src/components/ui/**` jest wyłączone z reguły (`:90`). Warianty typu `data-[state=active]:` nie są łapane.
- `CLAUDE.md`: nie nadpisywać kolorów komponentów `ui` przez `className`; rozszerzać `/dev/ui` przy dodaniu komponentu formularza.
- Kitchen sink: `src/pages/dev/ui.astro:18` montuje `KitchenSinkForms` (`client:load`); sekcje przez helper `Section` (`src/components/dev/KitchenSinkForms.tsx:126-133`). Renderuje też całe managery — `ClientsManager` (:252-257), `InvoicesManager` (:685-693) — więc taby wewnątrz managerów pojawią się tam automatycznie. `SenderProfileFormView` i `SettingsFormView` renderowane bezpośrednio (:506-630).

### `/` — Faktury (Eskalacja · Ponaglenia · Wstrzymane)

- `src/pages/index.astro:51-58`: jedna wyspa `<InvoicesManager … client:load />`, propsy `initialInvoices`, `clients`, `today`, `settings`, `sender` (ładowane :28-33). `h1` „Faktury” w Astro (:45).
- Stan: `const [invoices, setInvoices] = useState(initialInvoices)` (`src/components/invoices/InvoicesManager.tsx:37`); `groups = groupInvoices(invoices, today, settings.thresholds)` (:49-52).
- Kolejność renderu w stanie niepustym (:145-222): przycisk „Dodaj fakturę” → `<RemindersSection invoices={invoices} …>` (h2 „Ponaglenia”, `RemindersSection.tsx:39`) → `groups.map` z sekcją na grupę i nagłówkiem `{label} ({count})`.
- Grupy w kolejności `GROUP_ORDER` (`src/lib/escalation.ts:7-15`): `stage_4…stage_1`, `pre_threshold`, `current`, `paused`; puste grupy pomijane (`escalation.ts:71-74`).
  - Wniosek mapowania: tab „Eskalacja” = wszystkie grupy poza `paused` (w tym „Bieżące” i „Po terminie, przed etapem 1” — to nie są etapy eskalacji, nazwa taba jest więc decyzją produktową); tab „Wstrzymane” = grupa `paused`.
- Ponaglenia liczone z tego samego `invoices` przez `buildClientReminders` (`RemindersSection.tsx:21-24`), który bierze tylko `stage_1…stage_4` (`src/lib/reminder.ts:42-43`).
- Wstrzymanie/wznowienie tylko w dialogu edycji (`InvoiceFormDialog.tsx:183-190`), przez `useInvoicePause` → `handlePauseChanged` podmienia fakturę w stanie (`InvoicesManager.tsx:89-92`); faktura przechodzi między grupami bez przeładowania. Pozostałe mutacje stanu: dodanie (:62-65), zapłata (:73-76), edycja (:84-87), anulowanie (:94-99).
- Fokus: powrót na otwierający element, jeśli `isConnected`, inaczej na `addButtonRef` (:101-105, :233-248); po anulowaniu na `addButtonRef` (:268-274). Przycisk „Dodaj fakturę” i dialogi (:225-275) powinny zostać poza panelami tabów.
- Stany puste: brak klientów → „Najpierw dodaj klienta” (:109-118) zastępuje całą wyspę; brak otwartych faktur → „Nie masz otwartych faktur” (:134-143) zastępuje wszystko łącznie z ponagleniami. Ponaglenia mają własny pusty stan „Żaden klient nie ma faktur na etapach 1–4.” (`RemindersSection.tsx:40-41`); grupy eskalacji nie mają pustego stanu (są pomijane), więc pusty tab „Eskalacja”/„Wstrzymane” potrzebuje nowego tekstu.
- Liczniki: grupy mają `({items.length})`; ponaglenia nie mają licznika w nagłówku, a lista ponagleń jest liczona wewnątrz `RemindersSection` — licznik na tabie wymagałby wyniesienia `buildClientReminders` wyżej.

### `/clients` — Klienci (Aktywni · Nieaktywni)

- `src/pages/clients.astro:36`: jedna wyspa `<ClientsManager initialClients={clients} client:load />`; `clients` z `listClients` zawiera aktywnych i usuniętych (:19).
- `ClientsManager.tsx:24` jeden stan; listy z `useMemo`: aktywni po nazwie (:36-39), usunięci od najnowszego usunięcia (:17-21, :40). Usunięcie (:55-60) i przywrócenie (:62-82) podmieniają pozycję w tablicy, więc przenoszą ją między listami.
- Sekcja aktywnych: pusty stan „Nie masz aktywnych klientów” / „Nie masz jeszcze klientów” + „Dodaj klienta” (:86-100); tabela z akcjami Edytuj/Usuń (:114-158).
- Sekcja usuniętych renderowana tylko przy `deactivated.length > 0` (:161), `h2` „Usunięci klienci ({n})” z `tabIndex={-1}` i `deletedHeadingRef` (:163-164). Z tabami panel „Nieaktywni” potrzebuje pustego stanu.
- Fokus zależny od układu: po usunięciu → `deletedHeadingRef` (:210-215), po przywróceniu → `addButtonRef` w `requestAnimationFrame` (:72-73). Oba cele są w drugim panelu względem miejsca akcji; przy odmontowanym panelu `ref` jest `null` i fokus ginie.
- Komunikaty błędów `duplicate_nip_inactive` / `duplicate_name_inactive`: „Przywróć go w sekcji „Usunięci klienci”.” (`src/lib/client-errors.ts:6,8`) — do zmiany pod nazwę taba.

### `/history` — Historia (Zapłacone · Anulowane)

- `src/pages/history.astro:41-42`: dwie wyspy `client:load` — `PaidInvoicesManager` i `CancelledInvoicesSection`, dane z `listPaidInvoices`/`listCancelledInvoices` (:22).
- Brak wspólnego stanu: każda ma własny `useState` (`PaidInvoicesManager.tsx:26`, `CancelledInvoicesSection.tsx:23`); przywrócenie usuwa wiersz z własnej listy (faktura wraca na `/`), nie przenosi go do drugiej.
- Nagłówki `h2` „Zapłacone faktury ({n})” (`PaidInvoicesManager.tsx:69-71`) i „Anulowane faktury ({n})” (`CancelledInvoicesSection.tsx:55-57`), oba z `tabIndex={-1}` — po przywróceniu fokus idzie na nagłówek (:54-55 / :35-36). Akcja i cel fokusu są w tym samym panelu.
- Puste stany: „Brak zapłaconych faktur” (:78), „Brak anulowanych faktur” (:64).
- Liczniki na tabach: przy wrapperze z dwoma niezależnymi komponentami licznik z propsów serwera zestarzeje się po przywróceniu; aktualny licznik wymaga podniesienia stanu do wrappera.

### `/settings` — Ustawienia (Dane nadawcy · Reguła eskalacji)

- `src/pages/settings.astro:40-42`: `<SenderProfileForm initialProfile={…} client:load />`, Astro-owe `<h2>Reguła eskalacji</h2>`, `<SettingsForm initialSettings={…} client:load />`.
- Każdy formularz ma własny `<form>`, hook i endpoint: `PUT /api/sender-profile` (`use-sender-profile-form.ts:72`), `PUT /api/settings` (`use-settings-form.ts:87`).
- Stan wyłącznie lokalny w hookach (`values`, `errors`, `serverError`, `pending`, `saved`: `use-sender-profile-form.ts:45-49`, `use-settings-form.ts:52-56`), inicjalizowany z propsów, które po zapisie się nie zmieniają. Brak śledzenia „dirty” i `beforeunload`. „Przywróć domyślne” tylko wypełnia pola (`use-settings-form.ts:64-70`).
- Konsekwencja: odmontowanie panelu przy przełączeniu taba gubi niezapisane zmiany i komunikat „Zapisano…”, a po zapisie i powrocie formularz pokaże stare wartości z serwera. Rozwiązania: `forceMount` (panele ukryte, zamontowane) albo podniesienie ostatnio zapisanych wartości do wrappera.

### Header (`Topbar.astro`)

- Linki w tablicy `links` (`src/components/Topbar.astro:7-12`): Faktury, Klienci, Historia, Ustawienia → docelowo Faktury, Historia, Klienci, Ustawienia.
- Kontener: `div.mb-4.flex.items-center.justify-between.rounded-xl.border.bg-card.px-4.py-2` z trzema dziećmi: `nav`, `span` z e-mailem, `form` z `Button variant="link"` „Wyloguj” (:15-36). Brak klas responsywnych i `flex-wrap`.
- Aktywny link: `aria-current="page"`, `/` dopasowane dokładnie, reszta `startsWith` (:18) — `?tab=` lub hash nie psuje dopasowania.
- `Topbar` używany na `index.astro:43`, `clients.astro:28`, `history.astro:32`, `settings.astro:31`, zawsze nad `<main>` w `div.min-h-screen.p-4`; header ma pełną szerokość, `main` ma `max-w-5xl`/`max-w-3xl`.
- Uwaga poboczna: `Layout.astro:17` ma `<meta name="viewport" content="width=device-width" />` bez `initial-scale=1` — nie blokuje zmiany, ale warto sprawdzić przy weryfikacji na telefonie.

### Testy

- `scripts/smoke.mjs` sprawdza tylko `status`, `location` i funkcje `check` na JSON API (:698-703); kroki stron to wyłącznie statusy/redirecty (:650-694). `/settings` nie jest żądane jako strona.
- Brak testów UI (Playwright/komponentowych); testy jednostkowe tylko w `src/lib/*.test.ts`.

## Code References

- `src/components/Topbar.astro:7-12` — tablica linków (kolejność menu)
- `src/components/Topbar.astro:15-36` — jednowierszowy układ headera
- `src/components/invoices/InvoicesManager.tsx:37,49-52` — jeden stan faktur i grupowanie
- `src/components/invoices/InvoicesManager.tsx:145-222` — kolejność: przycisk, Ponaglenia, grupy
- `src/lib/escalation.ts:7-15` — `GROUP_ORDER` z `paused` na końcu
- `src/lib/reminder.ts:42-43` — ponaglenia tylko z etapów 1–4
- `src/components/clients/ClientsManager.tsx:24,36-40` — jeden stan, dwie listy
- `src/components/clients/ClientsManager.tsx:72-73,210-215` — fokus po przywróceniu/usunięciu
- `src/lib/client-errors.ts:6,8` — komunikaty odsyłające do sekcji „Usunięci klienci”
- `src/pages/history.astro:41-42` — dwie wyspy historii
- `src/pages/settings.astro:40-42` — dwie wyspy ustawień
- `src/components/hooks/use-settings-form.ts:52-56`, `use-sender-profile-form.ts:45-49` — lokalny stan formularzy
- `node_modules/@radix-ui/react-tabs/dist/index.mjs:153-170` — `forceMount` / `hidden`
- `eslint.config.js:73-97` — reguła tokenów w widokach
- `src/components/dev/KitchenSinkForms.tsx:126-133` — helper `Section` kitchen sinka

## Architecture Insights

- Wzorzec projektu: strona Astro ładuje dane i montuje jedną wyspę-managera, która trzyma lokalny stan i mutuje go po odpowiedzi API, bez przeładowań. Taby wpisują się w ten wzorzec najprościej jako element wewnątrz managera (`/`, `/clients`) albo nowa wyspa-wrapper (`/history`, `/settings`).
- Fokus po akcjach usuwających wiersz jest świadomie projektowany (nagłówki z `tabIndex={-1}`, `addButtonRef`) — wymóg dostępności, który taby muszą zachować.
- `forceMount` na wszystkich `TabsContent` rozwiązuje jednocześnie problem fokusu (cele istnieją w DOM; nadal trzeba przełączyć aktywny tab, jeśli cel jest w ukrytym panelu, bo element z `hidden` nie przyjmie fokusu) i stanu formularzy.
- Jeden wspólny komponent (`ui/tabs.tsx` z shadcn) wystarcza dla wszystkich czterech stron; ewentualna synchronizacja z URL to osobna, opcjonalna warstwa.

## Historical Context (from prior changes)

- `context/archive/2026-10-03-add-and-edit-clients/plan.md:272-278` — kontrakt Topbara: aktywny link z `aria-current="page"` i tokenami `text-foreground`/`text-muted-foreground`; `:304` — Topbar ma wyglądać poprawnie na szerokości telefonu (dziś bez klas responsywnych).
- `context/archive/2026-10-07-mark-invoice-paid/plan-brief.md:25` — historia jako osobna strona `/history` zgodnie z FR-010.
- `context/archive/2026-10-10-escalation-settings/plan.md:262` — „Ustawienia” po „Historia” w Topbarze.
- `context/archive/2026-10-06-collective-reminder/plan-brief.md:22` — sekcja „Ponaglenia” nad listą na `/`, „od razu widać, komu wysłać ponaglenie” — taby chowają ją za kliknięciem, co zmienia tę decyzję.
- `context/archive/2026-10-08-pause-and-resume-escalation/plan.md:5` — „Wstrzymane” jako grupa na końcu listy, poza ponagleniami.
- `context/archive/2026-10-07-invoice-edit-and-cancel/plan.md:24` — „Anulowane faktury” jako druga sekcja pod „Zapłacone faktury”.
- `context/archive/2026-10-09-client-deactivate-restore/plan.md:21,53,126-127,205` — sekcja „Usunięci klienci” pod aktywnymi, renderowana przy n > 0, reguły fokusu i treść 409 odsyłająca do sekcji.
- `context/foundation/prd.md:126` (FR-010) — lista otwartych faktur pogrupowana na bieżące, po terminie przed progiem, etapy 1–4 i wstrzymane; taby nie łamią FR-010, o ile grupy w tabie „Eskalacja” pozostają.
- `context/foundation/roadmap.md` — brak pozycji dla tej zmiany (wszystkie wycinki `done`; zaparkowane FR-014 i FR-015).
- Brak wcześniejszych decyzji o stanie widoku w URL ani o tabach.

## Related Research

- Nie dotyczy — w `context/changes/` brak innych badań o nawigacji lub tabach.

## Open Questions

Decyzje produktowe/projektowe dla `/10x-plan`:

1. **Montowanie paneli:** `forceMount` wszędzie (rekomendowane — chroni formularze ustawień i cele fokusu) czy odmontowywanie z podniesionym stanem?
2. **Stan taba w URL** (`?tab=` czytany na serwerze i przekazany jako prop, żeby SSR nie mrugał) czy tylko stan lokalny? Wpływa na linki „Zobacz historię”/„Przejdź do klientów” i na możliwość linkowania z komunikatu 409 do taba „Nieaktywni”.
3. **Tab domyślny na `/`:** „Eskalacja” czy „Ponaglenia” (archiwum: ponaglenia miały być widoczne od razu)?
4. **Zawartość taba „Eskalacja”:** czy obejmuje „Bieżące” i „Po terminie, przed etapem 1” (nie są etapami eskalacji)?
5. **Liczniki na tabach:** jeśli tak, ponaglenia wymagają wyniesienia `buildClientReminders` do `InvoicesManager`, a historia — podniesienia stanu obu list do wrappera.
6. **Stany puste:** globalny „Nie masz otwartych faktur” zostaje bez tabów czy staje się per-tab? Nowe teksty dla pustych „Eskalacja”, „Wstrzymane”, „Nieaktywni”.
7. **Przełączanie taba po akcji:** po usunięciu klienta przejść na „Nieaktywni” (jak dziś fokus na sekcję), czy zostać na „Aktywni” z fokusem na „Dodaj klienta”? Analogicznie po wstrzymaniu faktury.
8. **Breakpoint headera** dla dwóch wierszy (np. `sm:`) i czy dodać `initial-scale=1` do viewportu.
