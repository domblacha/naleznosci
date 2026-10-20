# Rebrand na Należności — Plan Brief

> Full plan: `context/changes/rebrand-naleznosci/plan.md`

## What & Why

Aplikacja powstała z szablonu 10x Astro Starter i wciąż nosi jego ślady: nazwę paczki, faviconę 10x, link w banerze Supabase do repo startera i README opisujące starter. Usuwamy je, żeby repo i aplikacja przedstawiały się jako Należności.

## Starting Point

Ślady startera są tylko w `README.md`, `package.json`/`package-lock.json`, `src/lib/config-status.ts:16` i `src/layouts/Layout.astro:18` (+ `public/favicon.png`, `public/template.png`). Worker (`naleznosci`), tytuł strony i `origin` są już przemianowane.

## Desired End State

Karta przeglądarki pokazuje pomarańczową ikonę z białym „N”, baner Supabase linkuje do README tego repo, paczka nazywa się `naleznosci`, a README zaczyna się od `# Należności` z opisem aplikacji. `git grep` poza `context/` i `.claude/skills/` nie znajduje śladów startera.

## Key Decisions Made

| Decision               | Choice                                                             | Why (1 sentence)                                                                                       | Source    |
| ---------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------- |
| Link w banerze         | `github.com/domblacha/naleznosci#supabase-configuration`           | Prowadzi do instrukcji tej aplikacji; prywatność repo nie przeszkadza, bo baner widzi tylko deweloper. | change.md |
| Favicona               | SVG 32×32: kwadrat `rx=6` w `#bb4d00` (primary), białe „N” ścieżką | Czytelna w 16px, spójna z kolorem aplikacji, bez zależności od fontu i motywu.                         | Plan      |
| Notatka o smoke teście | Przeredagować                                                      | Zachowuje wskazówkę, kiedy uruchamiać smoke i że nie zastępuje `npm test`/integracji.                  | Plan      |
| Licencja               | Usunąć sekcję `## License`                                         | Brak pliku `LICENSE`; MIT to pozostałość startera, nie świadoma decyzja.                               | Plan      |
| Język README           | Zostaje angielski                                                  | Spójność z resztą dokumentu; tłumaczenie poza zakresem.                                                | Plan      |

## Scope

**In scope:**

- `docsUrl` w `config-status.ts`, `favicon.svg` zamiast `favicon.png`, `<link rel="icon">` w layoucie
- `name` w `package.json` + odświeżony `package-lock.json`
- README: tytuł, opis, `git clone`/`cd`, notatka o smoke teście, usunięcie obrazka, `template.png` i sekcji licencji

**Out of scope:**

- `.claude/skills/10x-*` i `context/`
- Plik `LICENSE`, dodatkowe formaty ikon (`apple-touch-icon`, `.ico`, manifest)
- Tłumaczenie README na polski

## Architecture / Approach

Czysto kosmetyczna zmiana bez logiki: najpierw kod i zasoby (bramka: lint, `astro check`, `npm test`, build z `favicon.svg` w `dist/client`), potem README (bramka: `git grep` bez trafień i `prettier --check`).

## Phases at a Glance

| Phase           | What it delivers                            | Key risk                                              |
| --------------- | ------------------------------------------- | ----------------------------------------------------- |
| 1. Kod i zasoby | Nowa favicona, link w banerze, nazwa paczki | `npm install` zmieni w locku więcej niż `name`        |
| 2. README       | Dokumentacja Należności bez śladów startera | Pominięte wystąpienie „starter” — łapie je `git grep` |

**Prerequisites:** świeży branch `feat/rebrand-naleznosci` z aktualnego `main`.
**Estimated effort:** ~1 krótka sesja, 2 fazy.

## Open Risks & Assumptions

- Link w banerze działa tylko dla osób z dostępem do prywatnego repo — zaakceptowane.
- Kolor favicony jest skopiowany jako hex; zmiana `--primary` wymaga ręcznej aktualizacji SVG.

## Success Criteria (Summary)

- W karcie przeglądarki widać ikonę Należności, nie 10x.
- README i `package.json` opisują Należności; `git grep` nie znajduje śladów startera poza `context/` i `.claude/skills/`.
