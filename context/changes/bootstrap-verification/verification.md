---
bootstrapped_at: 2026-09-16T20:40:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: naleznosci
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: naleznosci
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

### Why this stack

A solo developer building a receivables-tracking web app in 3 after-hours weeks needs an agent-friendly starter that ships auth, a relational database, and deployment out of the box. 10x-astro-starter is the recommended default for a JS web app and clears all four agent-friendly gates. Supabase covers email + password registration and login (FR-001) and Postgres row-level security enforces the per-owner data isolation the PRD requires. Escalation stages, interest, and compensation are computed on read from the Polish-time date, so no background jobs are needed and the edge runtime constraint does not bite; payments, realtime, and AI are out of scope. Bootstrapper confidence is first-class, so expect mostly smooth scaffolding with occasional manual steps. Deployment stays on the starter's default Cloudflare Pages, with GitHub Actions auto-deploying on merge to main.

## Pre-scaffold verification

| Signal      | Value                                                        | Severity | Notes                                                  |
| ----------- | ------------------------------------------------------------ | -------- | ------------------------------------------------------ |
| npm package | not run                                                      | —        | cmd_template starts with `git clone`; no npm CLI to check |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-09-12T21:16:08Z | fresh    | from card.docs_url                                     |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 22 top-level entries (~50 files excluding `node_modules/`): `.env.example`, `.github/`, `.gitignore`, `.husky/`, `.nvmrc`, `.prettierrc.json`, `.vscode/`, `AGENTS.md`, `README.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules/`, `package-lock.json`, `package.json`, `public/`, `scripts/`, `src/`, `supabase/`, `tsconfig.json`, `wrangler.jsonc` (+ `CLAUDE.md` sidelined)
**Conflicts (.scaffold siblings)**: `CLAUDE.md` → `CLAUDE.md.scaffold`
**.gitignore handling**: moved silently (absent in cwd)
**.bootstrap-scaffold cleanup**: deleted (cloned `.git/` removed before move-up)

**npm install warnings (non-fatal)**:

- Peer override: `eslint-plugin-react@7.37.5` expects eslint `^3 … ^9.7`, project uses eslint `^10.10.0`.
- EBADENGINE: `astro-eslint-parser@3.1.0` and `eslint-plugin-astro@3.1.0` require node `^22.22.3 || ^24.16.0 || >=26.3.0`; local node is `v24.11.1` (npm 11.6.2). Starter's `.nvmrc` pins the expected version.

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW (0 INFO)
**Direct vs transitive**: 0/0/0/0 direct of total 0/0/0/0 (dependencies: 360 prod, 269 dev, 165 optional, 25 peer; 802 total)

#### CRITICAL findings

none

#### HIGH findings

none

#### MODERATE findings

none

#### LOW / INFO findings

none

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | false                |
| has_background_jobs     | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
