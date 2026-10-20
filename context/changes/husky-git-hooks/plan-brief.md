# Aktywacja husky: pre-commit i pre-push — Plan Brief

> Full plan: `context/changes/husky-git-hooks/plan.md`

## What & Why

Lokalna bramka commita, na którą powołują się `test-plan.md` §5 i hook agenta `end-of-turn.sh`, w praktyce nie działa: husky jest zainstalowany, ale git nie wywołuje jego hooków. Włączamy go, żeby lint i typy były sprawdzane przy commicie, a testy jednostkowe przed pushem, a nie dopiero w CI.

## Starting Point

`husky@9.1.7`, lint-staged i `.husky/pre-commit` (`npx lint-staged`) są w repo, ale brakuje skryptu `prepare`, więc `core.hooksPath` jest puste. lint-staged obejmuje tylko `ts/tsx/astro` (eslint) i `json/css/md` (prettier). Hooka pre-push nie ma.

## Desired End State

Po `npm install` pre-commit uruchamia lint-staged (eslint `--fix` na `js/jsx/mjs/ts/tsx/astro`, prettier na `json/css/md`), a potem `astro check`. Pre-push uruchamia `npm test`. Błąd na którymkolwiek kroku blokuje commit lub push, a dokumentacja opisuje to zgodnie ze stanem faktycznym.

## Key Decisions Made

| Decision            | Choice                                                 | Why (1 sentence)                                                                              |
| ------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Kiedy `astro check` | Zawsze, w `.husky/pre-commit` po `npx lint-staged`     | Najprostsze; konfiguracja zostaje w `package.json`, koszt ok. 5 s na commit jest akceptowany. |
| Prettier dla kodu   | Realizuje go `eslint --fix` (`eslint-plugin-prettier`) | Osobne wywołanie prettiera na `js/ts` byłoby zbędne.                                          |
| Husky w CI          | Bez zmian, domyślny `"prepare": "husky"`               | W CI husky tylko ustawia `hooksPath`; zmiany w `ci.yml` nic by nie dały.                      |
| Weryfikacja         | Ręczny dowód: błąd ESLint, błąd typu, padający test    | Sprawdza prawdziwy git bez wolnego i kruchego testu automatycznego.                           |
| Pre-push            | Tylko `npm test`                                       | Integracja wymaga lokalnego Supabase i zostaje w CI.                                          |

## Scope

**In scope:**

- `prepare: husky`, rozszerzone globy lint-staged, `astro check` w pre-commit, nowy `.husky/pre-push`
- `test-plan.md` §5, akapit w README, odnośnik w CLAUDE.md

**Out of scope:**

- Warunkowy `astro check` (`lint-staged.config.mjs`), `HUSKY=0` w CI
- Automatyczny test git hooków, integracja w pre-push
- Zmiany w hookach agenta (`.claude/hooks/`)

## Architecture / Approach

`npm install` → `prepare` → `husky` ustawia `core.hooksPath=.husky/_`. Git przy commicie uruchamia `.husky/pre-commit` (`npx lint-staged` → `npx astro check`), a przy pushu `.husky/pre-push` (`npm test`). Cała konfiguracja jest w `package.json` i `.husky/`.

## Phases at a Glance

| Phase                   | What it delivers                                              | Key risk                                                              |
| ----------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Aktywacja git hooków | Działające pre-commit i pre-push, udowodnione ręcznie         | `astro check` blokuje commit także przez błąd w niezastagowanym pliku |
| 2. Dokumentacja bramek  | §5 test-planu, README i CLAUDE.md zgodne ze stanem faktycznym | Rozjazd opisu z treścią `.husky/*`                                    |

**Prerequisites:** świeży branch `feat/husky-git-hooks` z aktualnego `main`, node z `.nvmrc`.
**Estimated effort:** ok. 1 sesja, 2 krótkie fazy.

## Open Risks & Assumptions

- `astro check` sprawdza drzewo robocze, nie stan zastagowany. Niezastagowany błąd typu zablokuje commit, a obejściem jest `--no-verify`.
- Commity z GUI IDE przy nvm mogą nie znaleźć `npx`. Rozwiązaniem jest `~/.config/husky/init.sh`, opisany w README.
- Istniejące klony dostaną hooki dopiero po najbliższym `npm install`.

## Success Criteria (Summary)

- Commit z błędem ESLint lub błędem typu jest odrzucony lokalnie.
- Push z padającym testem jednostkowym jest odrzucony lokalnie.
- §5 w `test-plan.md` opisuje bramki, które faktycznie działają.
