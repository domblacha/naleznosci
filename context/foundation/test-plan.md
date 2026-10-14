# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-14

## 1. Strategy

Testy w tym projekcie podlegają trzem nienegocjowalnym zasadom:

1. **Koszt × sygnał.** Wygrywa najtańszy test, który daje prawdziwy sygnał
   dla danego ryzyka. Nie promuj testu do e2e, bo e2e „wydaje się
   bezpieczniejsze”. Nie dokładaj modelu wizyjnego do deterministycznego
   porównania, które już łapie regresję.
2. **Obawy użytkownika są pełnoprawnym dowodem.** Ryzyka zakotwiczone w
   „właściciel obawia się X, a awaria ujawniłaby się w obszarze Y” ważą
   tyle samo co linie PRD czy dane o churnie.
3. **Ryzyka to scenariusze, nie miejsca w kodzie.** Ten plan opisuje, *co
   może się zepsuć* i *dlaczego uważamy to za prawdopodobne* — na podstawie
   dokumentów, wywiadu i *sygnału* z kodu (churn, struktura, baza testów).
   NIE twierdzi, że wie, która linia odpowiada za awarię. Tę wiedzę
   wytwarza `/10x-research` w każdej fazie wdrożenia. Jeśli plan i research
   różnią się co do miejsca awarii, prawdą jest research.

Zasada wyroczni: oczekiwana wartość w teście pochodzi z PRD, z ręcznie
policzonego przykładu albo z wywiadu — nigdy z kodu, który test sprawdza.

Zakres hot-spotów użyty do oceny prawdopodobieństwa: `src/`,
`supabase/migrations/`, `scripts/` (46 commitów w ostatnich 30 dniach).

## 2. Risk Map

Najważniejsze scenariusze awarii, uporządkowane wg wpływ × prawdopodobieństwo.
Kolumna Source cytuje *dowód, który wyniósł ryzyko na listę* — nigdy plik
jako „miejsce awarii” (patrz §1, zasada 3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Faktura trafia do złego etapu eskalacji: granica dnia wg czasu polskiego, progi włączne, progi z ustawień użytkownika zamiast domyślnych, przeskok etapu po wznowieniu wstrzymanej faktury | High | High | interview Q1, Q3; PRD Guardrails, FR-005, FR-013, NFR (czas polski); hot-spot dir `src/lib` (62 commits/30d) |
| 2 | Ponaglenie niezgodne z listą: obejmuje faktury wstrzymane, sprzed pierwszego progu lub zamknięte (zapłacone, anulowane), ma ton innego etapu niż najwyższy u klienta albo suma różni się od sumy pozycji | High | High | interview Q1, Q4; PRD FR-008, FR-011, US-01, US-02; hot-spot dir `src/components/invoices` (37 commits/30d) |
| 3 | Błędne odsetki lub rekompensata: zaokrąglenie do grosza, odsetki rosnące po dacie wpłaty, zmiana ustawień przeliczająca historię zapłaconych faktur, wstrzymanie zatrzymujące odsetki, rekompensata naliczona klientowi z wyłączonym przełącznikiem | High | Medium | interview Q3; PRD Guardrails, FR-007, FR-009; `archive/2026-10-10-escalation-settings` (migawka stopy i rekompensaty przy wpłacie) |
| 4 | API przejść stanu faktury przyjmuje niedozwoloną kombinację albo zostawia niespójny stan: zapłata faktury anulowanej, edycja kwoty lub terminu po terminie bez wstrzymania, cofnięcie wpłaty bez wyczyszczenia migawki, przywrócenie anulowanej z zajętym numerem, otwarcie faktury u usuniętego klienta, usunięcie klienta z otwartą fakturą | High | High | interview Q3, Q4; PRD FR-002, FR-003, FR-004, FR-013; hot-spot dirs `src/pages/api` (17 commits/30d), `src/lib/services` (20 commits/30d); warstwa API bez testów automatycznych (profil bazy testów) |
| 5 | **Nadużycie (IDOR):** użytkownik B odczytuje lub zmienia klienta, fakturę, ustawienia albo profil nadawcy użytkownika A, podając cudze id | High | Medium | PRD NFR (izolacja danych), Access Control; roadmap S-02 Risk (wzorzec izolacji powielany w każdym wycinku); izolację sprawdza tylko `npm run smoke`, poza CI |
| 6 | **Nadużycie (walidacja po stronie serwera):** wywołanie API z pominięciem formularza zapisuje wartości spoza zakresu (ujemna lub zerowa kwota, progi niemonotoniczne, ujemna stopa, data wpłaty sprzed wystawienia) i psuje etapy lub kwoty wszystkich faktur | High | Low | PRD FR-009, FR-004; CLAUDE.md (zod w każdym endpoincie — zasada, nie dowód egzekucji) |

Awaria Cloudflare lub Supabase (High × Low) należy do observability, nie do
testów — poza tą mapą.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| #1 | Etap jest poprawny na granicach: dzień terminu (bieżąca), próg−1 i próg, po ostatnim progu (etap 4), północ czasu polskiego przy runtime w UTC, niestandardowe progi z ustawień, wznowienie po długim wstrzymaniu przeskakuje kilka etapów | „Reguła w lib ma testy, więc każdy widok liczy etap tak samo” | Skąd widoki biorą „dziś” i ustawienia użytkownika; czy istnieją ścieżki liczące etap poza wspólną regułą; które przypadki brzegowe już są pokryte | unit (uzupełnienie istniejących testów) | Oczekiwany etap wyliczony tym samym kodem albo przepisany z wyniku implementacji |
| #2 | Dla klienta z mieszanką faktur (etapy 1–4, wstrzymane, sprzed progu, zapłacone, anulowane) ponaglenie zawiera dokładnie faktury z etapów 1–4 widoczne na liście, ton najwyższego etapu i sumę równą sumie pozycji; dane nadawcy pojawiają się tylko, gdy są uzupełnione | „Grupy listy i filtr ponaglenia pochodzą z tych samych danych” | Jak lista i ponaglenie dostają dane i ustawienia; czy mogą się rozjechać (np. inne ustawienia, inne „dziś”); co jest liczone w przeglądarce, a co na serwerze | unit kompozycji; integration tylko jeśli dane składa strona | Snapshot całej treści bez asercji na pozycje, ton i sumę |
| #3 | Kwoty zgodne z ręcznie policzonymi przykładami (wzór z PRD, połowa w górę), łącznie z progami rekompensaty na granicach kwot; zapłacona faktura zachowuje kwoty po zmianie ustawień; wstrzymanie nie zatrzymuje odsetek | „Zgodność z obecnym wynikiem oznacza poprawność” | Gdzie powstaje i jest czytana migawka przy wpłacie; jak cofnięcie wpłaty obchodzi się z migawką; jednostki (grosze, punkty bazowe) | unit; integration dla migawki | Wyrocznia skopiowana z kodu produkcyjnego zamiast z PRD |
| #4 | Macierz stan × akcja: każde niedozwolone przejście zwraca 4xx i nie zmienia wiersza w bazie; każde dozwolone zostawia spójny wiersz (daty stanu, migawka, blokada edycji) | „Kod 409 z API oznacza, że baza też to blokuje” — i odwrotnie | Kontrakt endpointów (kody, ciała błędów), constrainty i triggery w migracjach, tłumaczenie błędów bazy na odpowiedzi | integration na lokalnym Supabase (prawdziwe RLS, constrainty, triggery) | Mockowanie klienta Supabase; testowanie tylko ścieżki sukcesu |
| #5 | Drugi zalogowany użytkownik dostaje 404/403 (lub pusty wynik) na każdym endpointcie z `[id]` i na odczytach, a dane właściciela pozostają niezmienione | „Zalogowany = właściciel zasobu” | Polityki RLS per operacja, sposób ustalania właściciela w API, złożony klucz obcy klient–właściciel | integration z dwoma kontami | Test wyłącznie na danych jednego użytkownika |
| #6 | Wartości spoza zakresu wysłane bezpośrednio do API są odrzucane z 400, a stan w bazie nie zmienia się | „Formularz waliduje, więc API też” | Które schematy walidują które endpointy; czy schemat serwera = schemat formularza; reguły niemonotonicznych progów | unit schematów + pojedynczy integration na endpoint | Testowanie samego formularza w UI |

## 3. Phased Rollout

Każdy wiersz to osobna faza wdrożenia z własnym folderem zmiany
(`/10x-new`). Status przechodzi od lewej do prawej; orkiestrator aktualizuje
go, gdy na dysku pojawiają się artefakty.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Reguły domenowe: etap, kwoty, ponaglenie | Dowieść, że etap, kwoty i treść ponaglenia są poprawne na granicach wg niezależnych wyroczni i że ponaglenie zgadza się z listą | #1, #2, #3 | unit | complete | testing-domain-rules |
| 2 | Przejścia stanu i izolacja przez API | Dowieść, że niedozwolone przejścia, cudze id i wartości spoza zakresu są odrzucane bez zmiany w bazie; ponaglenie i lista nie obejmują faktur zapłaconych ani anulowanych (filtr `listOpenInvoices`) | #4, #5, #6 | integration (Vitest + lokalny Supabase) | change opened | testing-api-state-and-isolation |
| 3 | Bramki jakości | Uruchamiać testy integracyjne w CI na PR i dać agentowi szybki sygnał po edycji | cross-cutting | CI gate + post-edit hook | not started | — |

Kolejność: faza 1 jest najtańsza i trafia w główną obawę (Q1); faza 2
wymaga infrastruktury testowej z bazą; faza 3 utrwala poziom dopiero, gdy
jest co uruchamiać. E2E pominięte świadomie — wraca tylko, jeśli research
fazy 1 lub 2 wykaże, że zgodności listy z ponagleniem nie da się sprawdzić
taniej.

## 4. Stack

Profil bazy testów: **sparse** — Vitest skonfigurowany (`environment:
node`, `src/**/*.test.ts`), 12 plików testów, wszystkie w `src/lib/`
(czysta logika); API, middleware, RLS, triggery i UI pokrywa wyłącznie
ręczny `npm run smoke` (HTTP), który nie działa w CI.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit | Vitest | 5.0.3 | Istniejący runner; `npm test` działa w CI |
| integration (API + baza) | Vitest (projekt `integration`) + lokalny Supabase (CLI) | 5.0.3 / 2.117.0 | `npm run test:integration`; wymaga działającego `npx supabase start`; prawdziwa baza zamiast mocków, pliki `*.int.test.ts` |
| HTTP smoke | `scripts/smoke.mjs` | n/a | Ręczny, przeciw działającemu serwerowi; poza CI |
| e2e | none | — | Świadomie pominięte (patrz §3) |
| accessibility | none | — | Poza zakresem (§7: wygląd UI) |

**Stack grounding tools (current session):**
- Docs: Context7 — dostępny; do weryfikacji API Vitest 5 i uruchamiania Supabase CLI w GitHub Actions w fazach 2–3; checked: 2026-10-13
- Search: Exa.ai — dostępny; nieużyty przy pisaniu planu; checked: 2026-10-13
- Runtime/browser: Claude in Chrome — dostępny; nieużyty (brak warstwy e2e); Playwright MCP not available in current session; checked: 2026-10-13
- Provider/platform: WebStorm MCP (DB, inspekcje) — dostępny; możliwy podgląd lokalnej bazy podczas researchu fazy 2; GitHub/Cloudflare/Supabase MCP not available in current session; checked: 2026-10-13

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + astro check | local (lint-staged) + CI | required | dryf składni i typów |
| unit (`npm test`) | CI na PR i przed deploy | required | regresje reguł domenowych; wzmocnione po §3 Phase 1 |
| integration (API + lokalny Supabase) | CI na PR | required after §3 Phase 3 | niedozwolone przejścia stanu, IDOR, brak walidacji serwera |
| post-edit hook (lint + powiązane testy) | local (pętla agenta) | recommended after §3 Phase 3 | regresje w momencie edycji |
| HTTP smoke | ręcznie przed/po aktualizacji zależności | optional | awarie środowiskowe auth i podstawowych przepływów |

## 6. Cookbook Patterns

Jak dodawać nowe testy w tym projekcie. Każda podsekcja wypełnia się, gdy
odpowiednia faza zostanie dowieziona.

### 6.1 Test reguły domenowej (etap, kwoty)

- Oczekiwana wartość to literał policzony wzorem z PRD (`kwota × bp × dni /
  3 650 000`, połowa w górę) skryptem poza `src/`. Nigdy wynik funkcji
  produkcyjnej ani `DEFAULT_*` w roli oczekiwania (jako wejście wolno).
- Granice: próg−1 i próg (progi są włączne), a dla kwot także granice progów
  rekompensaty (art. 10 ust. 1 ustawy, PRD Guardrails).
- Osobno progi niestandardowe i ich przekazywanie przez `groupInvoices`.
- Gdy literał z planu nie zgadza się z kodem, to znalezisko do zgłoszenia, a nie
  powód do poprawienia literału.
- Przykłady: `src/lib/escalation.test.ts`, `src/lib/charges.test.ts`.

### 6.2 Test zgodności ponaglenia z listą

- Fixture jednego klienta z fakturami w różnych stanach (etapy 1–4, wstrzymana,
  sprzed progu, bieżąca) i drugiego bez rekompensaty.
- Asercje na pozycje (kolejność, odsetki, rekompensata), ton najwyższego etapu,
  sumy oraz brak „rekompensat” w tekście. Bez snapshotu całej treści.
- Suma = suma pozycji po zaokrągleniu (przypadek, w którym zaokrąglenie sumy
  dałoby inny wynik).
- Wybór szablonu sprawdzamy na własnych szablonach-znacznikach przekazanych do
  `renderReminder`, bez kopiowania `REMINDER_TEMPLATES`.
- Przykład: `src/lib/reminder.test.ts`.

### 6.3 Test przejścia stanu przez API

- Macierz stan × akcja jako `it.each`: każdy przypadek asertuje status, kod
  błędu w ciele i pełny wiersz przez `readRow` przed i po wywołaniu.
- Fixtures stanów wstawiamy klientem właściciela przez PostgREST
  (`insertClient`, `insertInvoice` z `src/test/integration/harness.ts`), a samo
  testowane przejście zawsze idzie przez handler (`callRoute`).
- Daty daleko od „dziś” (`DATES`), wyrocznie z wartości zapisanych przez test.
- Przykład: `src/lib/services/invoice-transitions.int.test.ts`.

### 6.4 Test izolacji i walidacji nowego endpointu

- Nowy endpoint: konto B woła go na zasobie A będącym w stanie, w którym ta
  sama akcja A by się udała (inaczej 404 wynika ze stanu, nie z własności);
  oczekiwane 404 i wiersz A bez zmian. Dodaj też trasę do listy „bez sesji”
  (401).
- Walidacja: jeden przypadek 400 na endpoint z ciałem — `error:"invalid_input"`,
  `fieldErrors` ze wskazanym polem i stan (wiersz lub liczba wierszy) bez zmian.
  Granice schematów zostają w testach unit.
- Przykłady: `src/lib/services/isolation.int.test.ts`,
  `src/lib/services/validation.int.test.ts`.

### 6.5 Per-rollout-phase notes

- Faza 1 (`testing-domain-rules`): wyrocznie z literałów, luki etapu i kwot
  uzupełnione, a `/invoices` i ponaglenie liczą kwoty przez `chargesAsOf`.
  Wykluczenie faktur zapłaconych i anulowanych z ponaglenia gwarantuje tylko SQL
  w `listOpenInvoices`, więc sprawdza je faza 2 na prawdziwej bazie.
- Faza 2 (`testing-api-state-and-isolation`): niedozwolone przejście stanu
  zwraca 404 `not_found` (nie 409) i testy utrwalają ten kontrakt; 409 dotyczy
  tylko `locked`, `duplicate_*`, `client_inactive`, `has_open_invoices`. Luki
  bazy, które `src/lib/services/db-gaps.int.test.ts` dowodzi testami `it.fails`
  (zmiana kwoty zapłaconej i anulowanej faktury, zmiana terminu faktury po
  terminie bez wstrzymania, `paid_on` w przyszłości), są kandydatem na osobną
  zmianę (trigger blokady / check daty); po załataniu luki test zaczerwieni się
  i trzeba zdjąć `.fails`. Reguły „wpłata przed wystawieniem” nie ma w schemacie
  (brak daty wystawienia), więc nie jest testowana.

## 7. What We Deliberately Don't Test

- **`/dev/ui` (kitchen sink)** — narzędzie deweloperskie, nie produkt.
  Re-evaluate, jeśli trafi do produkcyjnej nawigacji. (Source: Phase 2
  interview Q5.)
- **Wygląd UI (snapshoty, porównania wizualne, menu mobilne)** — łatwo
  sprawdzić ręcznie, testy byłyby kruche. Re-evaluate, jeśli regresja
  wizualna dotrze do produkcji. (Source: Phase 2 interview Q5.)
- **Auth ze startera (formularze, rejestracja, logowanie)** — obsługuje
  Supabase, a `npm run smoke` wystarcza. Re-evaluate przy zmianie
  dostawcy auth lub dodaniu resetu hasła. Uwaga: izolacja danych
  (Risk #5) jest testowana — to nie jest auth ze startera. (Source: Phase 2
  interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-13
- Stack versions last verified: 2026-10-13
- AI-native tool references last verified: 2026-10-13

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
