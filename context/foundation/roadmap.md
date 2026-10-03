---
project: Należności
version: 1
status: draft
created: 2026-09-25
updated: 2026-10-03
prd_version: 1
main_goal: speed
top_blocker: none
milestone_id: overdue-invoice-to-reminder-mvp
milestone_seq: 1
milestone_status: open
---

# Roadmap: Należności

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: MVP — od przeterminowanej faktury do ponaglenia** — Status: open

- **Intent:** Właściciel JDG może założyć konto, wprowadzić klientów i faktury, widzieć je w deterministycznych etapach eskalacji z poprawnie wyliczonymi odsetkami i rekompensatą, wygenerować jedno zbiorcze ponaglenie per klient oraz zamykać faktury (zapłata, anulowanie, wstrzymanie) — pełny zakres wymagań koniecznych PRD.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every S-NN below is `done`.
- **Scope anchors:** FR-001 – FR-011, FR-013, FR-014 (wszystkie must-have); US-01 – US-03. FR-012 (nice-to-have) jest odłożony — patrz `## Parked`.

## Vision recap

Właściciel jednoosobowej działalności ręcznie pilnuje przeterminowanych faktur: liczy odsetki i rekompensatę, decyduje, jak mocno naciskać na klienta, i pisze ponaglenia — niekonsekwentnie i z błędami. Należności stosują stałą, konfigurowalną regułę eskalacji (progi dni po terminie), same wyliczają kwoty i generują jedno zbiorcze ponaglenie per klient w tonie najwyższego etapu — czego arkusz kalkulacyjny ani pamięć użytkownika nie zapewniają.

## North star

**S-03: Użytkownik dodaje fakturę i widzi ją w grupie właściwego etapu eskalacji na liście** — to pierwszy wycinek, który sprawdza sedno produktu: deterministyczną klasyfikację faktury wg dni po terminie (czas polski) i progów. Wszystko dalej (odsetki, ponaglenie, zapłata, wstrzymanie) buduje na tej regule.

> „Gwiazda przewodnia” (north star) oznacza tu najmniejszy wycinek od początku do końca, którego dowiezienie udowadnia, że produkt działa — dlatego stoi tak wcześnie, jak pozwalają zależności.

## At a glance

| ID   | Change ID                   | Outcome (user can …)                                                                   | Prerequisites | PRD refs                    | Status   |
| ---- | --------------------------- | -------------------------------------------------------------------------------------- | ------------- | --------------------------- | -------- |
| S-01 | polish-auth-shell           | zarejestrować się, zalogować i wylogować w polskim interfejsie i trafić na pusty ekran główny | —             | FR-001                      | done        |
| S-02 | add-and-edit-clients        | dodać i edytować klienta, a duplikat zostaje odrzucony                                 | S-01          | FR-002                      | proposed |
| S-03 | invoice-escalation-list     | dodać fakturę i zobaczyć ją w grupie właściwego etapu na liście otwartych faktur       | S-02          | US-01, FR-003, FR-005, FR-010 | proposed |
| S-04 | interest-and-compensation   | zobaczyć odsetki i rekompensatę każdej przeterminowanej faktury, do grosza             | S-03          | US-01, FR-007               | proposed |
| S-05 | collective-reminder         | wygenerować jedno zbiorcze ponaglenie dla klienta i skopiować je do schowka            | S-04          | US-01, FR-008, FR-011       | proposed |
| S-06 | mark-invoice-paid           | oznaczyć fakturę jako zapłaconą z datą wpłaty i zobaczyć ją w historii                 | S-04          | US-02, FR-004, FR-006, FR-010 | proposed |
| S-07 | invoice-edit-and-cancel     | edytować fakturę (z blokadą po terminie) i anulować ją z zachowaniem historii          | S-03, S-06    | FR-003                      | proposed |
| S-08 | pause-and-resume-escalation | wstrzymać i wznowić eskalację faktury                                                  | S-04, S-07    | US-03, FR-013, FR-003       | proposed |
| S-09 | client-deactivate-restore   | dezaktywować i przywrócić klienta                                                      | S-03          | FR-002                      | proposed |
| S-10 | escalation-settings         | skonfigurować progi dni, stopę odsetek i progi rekompensaty                            | S-04          | FR-009                      | proposed |
| S-11 | invoice-list-filter-sort    | filtrować listę po kliencie i sortować po dniach po terminie lub kwocie                | S-03          | FR-010                      | proposed |
| S-12 | editable-reminder-templates | edytować 4 szablony treści ponagleń                                                    | S-05          | FR-014                      | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                    | Chain                                              | Note                                                                                   |
| ------ | ------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A      | Od konta do ponaglenia   | `S-01` → `S-02` → `S-03` → `S-04` → `S-05` → `S-12` | Ścieżka wymagań koniecznych do głównego kryterium sukcesu; `S-12` jest pierwszy do cięcia. |
| B      | Cykl życia faktury       | `S-06` → `S-07` → `S-08`                           | Dołącza do A przy `S-04`; może iść równolegle z `S-05`.                                |
| C      | Porządek w klientach     | `S-09`                                             | Dołącza do A przy `S-03`; niezależny od reszty.                                        |
| D      | Konfiguracja reguły      | `S-10`                                             | Dołącza do A przy `S-04`; do tego czasu działają wartości domyślne.                    |
| E      | Wygoda listy             | `S-11`                                             | Dołącza do A przy `S-03`; sortowanie PRD wskazuje jako drugie do cięcia.               |

## Baseline

What's already in place in the codebase as of `2026-09-25` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — framework skonfigurowany (Astro + React + Tailwind + shadcn, `src/layouts/Layout.astro`), ale strony startera (Welcome, Banner, index) to boilerplate do usunięcia; brak widoków produktu; interfejs po angielsku (`lang="en"`).
- **Backend / API:** partial — istnieją tylko endpointy auth (`src/pages/api/auth/*`); brak API domenowego.
- **Data:** absent — klient Supabase jest (`src/lib/supabase.ts`), ale brak migracji, tabel i polityk RLS.
- **Auth:** present — rejestracja, logowanie, wylogowanie i middleware chroniący trasy (`src/middleware.ts`); formularze po angielsku.
- **Deploy / infra:** present — Cloudflare Workers z auto-deployem z `main` przez Workers Builds; produkcyjny projekt Supabase (README §Deployment).
- **Observability:** partial — włączone observability Workers (`wrangler.jsonc`); brak śledzenia błędów.

## Foundations

Brak. Każdy element techniczny wchodzi w pierwszy wycinek, który go potrzebuje: pierwsza tabela z izolacją danych właściciela — w S-02, reguła etapu i jej automatyczna weryfikacja — w S-03. Auth i deploy są już obecne (patrz `## Baseline`).

## Slices

### S-01: Polski interfejs konta i pusty ekran główny

- **Outcome:** Użytkownik może zarejestrować się, zalogować i wylogować w polskim interfejsie, a po zalogowaniu trafia na chroniony, pusty ekran główny aplikacji (bez boilerplate'u startera).
- **Change ID:** polish-auth-shell
- **PRD refs:** FR-001, NFR (interfejs po polsku), Access Control
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Auth już działa, więc to głównie tłumaczenie i sprzątanie — stoi pierwszy, bo każdy kolejny widok potrzebuje polskiej powłoki i chronionego ekranu głównego.
- **Status:** done

### S-02: Dodawanie i edycja klientów

- **Outcome:** Użytkownik może dodać klienta (opcjonalny NIP, przełącznik „naliczaj rekompensatę” domyślnie włączony), edytować go i widzi listę swoich klientów; duplikat (po NIP, a bez NIP po nazwie bez rozróżniania wielkości liter) zostaje odrzucony.
- **Change ID:** add-and-edit-clients
- **PRD refs:** FR-002, NFR (dane widoczne wyłącznie dla właściciela)
- **Prerequisites:** S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Czy NIP normalizować (spacje, myślniki, prefiks PL) przed wykrywaniem duplikatów? — Owner: user. Block: no.
- **Risk:** Pierwsza tabela domenowa — tu ustala się wzorzec izolacji danych właściciela, który powtarzają wszystkie następne wycinki; błąd tu przecieka wszędzie.
- **Status:** proposed

### S-03: Faktura w grupie właściwego etapu na liście

- **Outcome:** Użytkownik może dodać fakturę (numer, kwota, termin) do klienta i widzi ją na liście otwartych faktur w grupie: bieżące, po terminie przed pierwszym progiem albo etap 1–4 — wg dni po terminie liczonych w czasie polskim i domyślnych progów +3/+7/+14/+30.
- **Change ID:** invoice-escalation-list
- **PRD refs:** US-01, FR-003, FR-005, FR-010, NFR (granica dnia wg czasu polskiego), NFR (kwoty do grosza)
- **Prerequisites:** S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Czy próg „+3” oznacza etap 1 od 3. dnia po terminie włącznie (i analogicznie dla pozostałych progów)? — Owner: user. Block: no.
- **Risk:** Gwiazda przewodnia — reguła etapu musi być deterministyczna (wymóg z Kryteriów sukcesu), więc ten wycinek wprowadza też automatyczną weryfikację reguły na przypadkach brzegowych (dzień terminu, północ czasu polskiego, etap 4 jako końcowy).
- **Status:** proposed

### S-04: Odsetki i rekompensata na liście

- **Outcome:** Użytkownik widzi przy każdej przeterminowanej fakturze odsetki proste (kwota × stopa × dni po terminie / 365) i rekompensatę z progu kwotowego (0 dla klienta z wyłączonym przełącznikiem), zaokrąglone do grosza (połowa w górę), liczone z domyślnych ustawień.
- **Change ID:** interest-and-compensation
- **PRD refs:** US-01, FR-007, NFR (kwoty do grosza)
- **Prerequisites:** S-03
- **Parallel with:** S-09, S-11
- **Blockers:** —
- **Unknowns:**
  - Jakie są domyślne wartości rocznej stopy odsetek i 3 progów kwotowych rekompensaty w PLN (przed zbudowaniem ustawień w S-10)? — Owner: user. Block: no.
- **Risk:** Wymóg poprawności wyliczeń z Kryteriów sukcesu — zaokrąglenia i precyzja kwot to najłatwiejsze miejsce na cichy błąd, dlatego wycinek stoi przed ponagleniem, które te kwoty konsumuje.
- **Status:** proposed

### S-05: Zbiorcze ponaglenie do schowka

- **Outcome:** Użytkownik może wygenerować dla klienta jedno zbiorcze ponaglenie obejmujące jego faktury na etapach 1–4 (bez wstrzymanych i sprzed pierwszego progu), w tonie najwyższego etapu, z pozycjami (numer, kwota, termin, dni po terminie, odsetki, rekompensata) i sumą, oraz skopiować je do schowka.
- **Change ID:** collective-reminder
- **PRD refs:** US-01, FR-008, FR-011, NFR (treści ponagleń po polsku)
- **Prerequisites:** S-04
- **Parallel with:** S-06, S-07, S-08, S-09, S-10, S-11
- **Blockers:** —
- **Unknowns:**
  - Jakie domyślne treści mają 4 szablony tonów (etap 1–4)? — Owner: user. Block: no.
- **Risk:** Zamyka główne kryterium sukcesu; szablony są na razie stałe, żeby edytowalność (S-12) dało się uciąć bez ruszania ponaglenia.
- **Status:** proposed

### S-06: Oznaczenie faktury jako zapłaconej

- **Outcome:** Użytkownik może oznaczyć fakturę jako zapłaconą w całości z datą wpłaty; faktura natychmiast znika z listy otwartych faktur i z ponagleń, a w widoku historii widać ją z odsetkami naliczonymi do dnia wpłaty.
- **Change ID:** mark-invoice-paid
- **PRD refs:** US-02, FR-004, FR-006, FR-010
- **Prerequisites:** S-04
- **Parallel with:** S-05, S-09, S-10, S-11, S-12
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Wprowadza widok historii, z którego korzysta S-07; odsetki muszą się zamrozić na dacie wpłaty, nie na „dziś”.
- **Status:** proposed

### S-07: Edycja i anulowanie faktury

- **Outcome:** Użytkownik może edytować fakturę (termin i kwota zablokowane od dnia po terminie) i anulować ją — anulowana faktura znika z eskalacji, ponagleń i trafia do historii.
- **Change ID:** invoice-edit-and-cancel
- **PRD refs:** FR-003
- **Prerequisites:** S-03, S-06
- **Parallel with:** S-05, S-09, S-10, S-11, S-12
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Blokada edycji chroni poprawność wyliczeń; musi powstać przed wstrzymaniem (S-08), które wprowadza od niej wyjątek.
- **Status:** proposed

### S-08: Wstrzymanie i wznowienie eskalacji

- **Outcome:** Użytkownik może wstrzymać eskalację faktury (trafia do grupy „wstrzymane”, poza ponaglenia, odsetki rosną dalej, termin i kwotę można edytować) i ją wznowić — faktura wraca na etap wynikający z aktualnej liczby dni po terminie.
- **Change ID:** pause-and-resume-escalation
- **PRD refs:** US-03, FR-013, FR-003
- **Prerequisites:** S-04, S-07
- **Parallel with:** S-05, S-09, S-10, S-11, S-12
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Dotyka trzech reguł naraz (etap, odsetki, blokada edycji), więc stoi po nich wszystkich — wznowienie może „przeskoczyć” kilka etapów i to trzeba zweryfikować.
- **Status:** proposed

### S-09: Dezaktywacja i przywracanie klienta

- **Outcome:** Użytkownik może usunąć klienta (oznaczenie jako nieaktywny z zachowaniem historii, zablokowane, dopóki klient ma nieopłacone faktury) i go przywrócić; duplikaty są wykrywane także wśród klientów nieaktywnych.
- **Change ID:** client-deactivate-restore
- **PRD refs:** FR-002
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-05, S-06, S-07, S-08, S-10, S-11, S-12
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Wymaga istnienia faktur (reguła blokady), dlatego oddzielony od S-02; niski wpływ na resztę.
- **Status:** proposed

### S-10: Ustawienia reguły eskalacji

- **Outcome:** Użytkownik może skonfigurować dni 4 progów eskalacji, roczną stopę odsetek i 3 progi kwotowe rekompensaty w PLN; zmiana natychmiast wpływa na etapy i kwoty wszystkich otwartych faktur.
- **Change ID:** escalation-settings
- **PRD refs:** FR-009
- **Prerequisites:** S-04
- **Parallel with:** S-05, S-06, S-07, S-08, S-09, S-11, S-12
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Do tego czasu reguła działa na wartościach domyślnych, więc ustawienia nie blokują gwiazdy przewodniej; ryzyko to niespójność, gdy zmiana progów nie odświeża wszystkich wyliczeń.
- **Status:** proposed

### S-11: Filtrowanie i sortowanie listy faktur

- **Outcome:** Użytkownik może filtrować listę otwartych faktur po kliencie i sortować po liczbie dni po terminie lub kwocie.
- **Change ID:** invoice-list-filter-sort
- **PRD refs:** FR-010
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-05, S-06, S-07, S-08, S-09, S-10, S-12
- **Blockers:** —
- **Unknowns:** —
- **Risk:** PRD wskazuje sortowanie jako drugie do cięcia przy opóźnieniu — dlatego stoi na końcu ścieżki.
- **Status:** proposed

### S-12: Edytowalne szablony ponagleń

- **Outcome:** Użytkownik może edytować 4 szablony treści ponagleń (po jednym na ton etapu), a generowane ponaglenia używają jego wersji.
- **Change ID:** editable-reminder-templates
- **PRD refs:** FR-014
- **Prerequisites:** S-05
- **Parallel with:** S-06, S-07, S-08, S-09, S-10, S-11
- **Blockers:** —
- **Unknowns:** —
- **Risk:** PRD wskazuje FR-014 jako pierwsze do cięcia przy opóźnieniu — ostatni na ścieżce, a S-05 działa bez niego na szablonach domyślnych.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                   | Suggested issue title                                        | Ready for `/10x-plan` | Notes                                  |
| ---------- | --------------------------- | ------------------------------------------------------------ | --------------------- | -------------------------------------- |
| S-01       | polish-auth-shell           | Polski interfejs konta i pusty ekran główny                  | yes                   | Run `/10x-plan polish-auth-shell`      |
| S-02       | add-and-edit-clients        | Dodawanie i edycja klientów z wykrywaniem duplikatów         | no                    | Czeka na S-01                          |
| S-03       | invoice-escalation-list     | Lista otwartych faktur pogrupowana po etapach eskalacji      | no                    | Czeka na S-02; gwiazda przewodnia      |
| S-04       | interest-and-compensation   | Odsetki i rekompensata przy przeterminowanych fakturach      | no                    | Czeka na S-03                          |
| S-05       | collective-reminder         | Zbiorcze ponaglenie per klient do schowka                    | no                    | Czeka na S-04                          |
| S-06       | mark-invoice-paid           | Oznaczanie faktury jako zapłaconej + widok historii          | no                    | Czeka na S-04                          |
| S-07       | invoice-edit-and-cancel     | Edycja (z blokadą po terminie) i anulowanie faktury          | no                    | Czeka na S-03, S-06                    |
| S-08       | pause-and-resume-escalation | Wstrzymanie i wznowienie eskalacji faktury                   | no                    | Czeka na S-04, S-07                    |
| S-09       | client-deactivate-restore   | Dezaktywacja i przywracanie klienta                          | no                    | Czeka na S-03                          |
| S-10       | escalation-settings         | Ustawienia progów, stopy odsetek i rekompensaty              | no                    | Czeka na S-04                          |
| S-11       | invoice-list-filter-sort    | Filtrowanie i sortowanie listy faktur                        | no                    | Czeka na S-03; kandydat do cięcia      |
| S-12       | editable-reminder-templates | Edytowalne szablony ponagleń                                 | no                    | Czeka na S-05; pierwszy do cięcia      |

## Open Roadmap Questions

1. **Czy zakres MVP zmieści się w budżecie 3 tygodni po godzinach?** — 13 wymagań koniecznych przy budżecie 3 tygodni po godzinach to ciasny zakres; przy opóźnieniu pierwsze do ograniczenia są FR-014 (S-12) i sortowanie z FR-010 (S-11). Owner: user. Block: roadmap-wide (no — nie blokuje planowania).

## Parked

- **Dashboard z prognozą wpływów na 30 dni (FR-012)** — Why parked: nice-to-have (Secondary Success Criteria); cel kolejności to szybkie dowiezienie wymagań koniecznych — kandydat na kolejny kamień milowy.
- **Integracje z systemami księgowymi i import CSV** — Why parked: PRD §Non-Goals.
- **Faktyczna wysyłka e-mail/SMS** — Why parked: PRD §Non-Goals; aplikacja generuje treść do skopiowania.
- **PDF, VAT, wiele walut** — Why parked: PRD §Non-Goals.
- **Zespoły i role (multi-tenant)** — Why parked: PRD §Non-Goals.
- **Częściowe wpłaty** — Why parked: PRD §Non-Goals.
- **Historia zmian stopy ustawowej** — Why parked: PRD §Non-Goals.
- **Reset hasła** — Why parked: PRD §Non-Goals; wymaga wysyłki e-mail.

## Milestone History

## Done

- **S-01: Użytkownik może zarejestrować się, zalogować i wylogować w polskim interfejsie, a po zalogowaniu trafia na chroniony, pusty ekran główny aplikacji (bez boilerplate'u startera).** — Archived 2026-09-29 → `context/archive/2026-09-29-polish-auth-shell/`. Lesson: —.
- **Zmiana poza wycinkami: Ekrany konta i powłoka na tokenach kolorów i komponentach shadcn (paleta stone + amber, ostre rogi, styl lyra, stany i dostępność, reguła ESLint + blok UI w `CLAUDE.md`)** — Archived 2026-10-03 → `context/archive/2026-09-29-theme-and-auth-tokens/`. Zrobione przed S-02 (`add-and-edit-clients`), żeby formularz klienta odziedziczył tokeny i komponenty; brak pozycji w roadmapie (Change ID `theme-and-auth-tokens`). Lesson: `className` zamiast `class` na komponentach React w `.astro` (`context/foundation/lessons.md`).
