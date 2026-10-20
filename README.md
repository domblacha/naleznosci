# 10x Astro Starter

![](./public/template.png)

A modern, opinionated starter template for building fast, accessible web applications.

## Tech Stack

- [Astro](https://astro.build/) v7 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v6 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v24.21.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/przeprogramowani/10x-astro-starter.git
cd 10x-astro-starter
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier
- `npm test` - Run unit tests (no database needed)
- `npm run test:integration` - Run API integration tests against the local Supabase (requires `npx supabase start`; creates and deletes `int-*@example.com` accounts, does not reset the database)
- `npm run smoke` - Smoke test the auth flow against a running server (`BASE_URL`, defaults to `http://localhost:4321`)

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

3. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

4. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

Schema changes live in `supabase/migrations/`. Apply them to the local database with:

```bash
npx supabase db reset       # recreate the local DB from scratch and apply all migrations
npx supabase migration up   # apply only new migrations, keeping local data
```

The `public.clients` table (with RLS) comes from the `create_clients` migration.
The `public.invoices` table (with RLS, a composite foreign key to `clients` and a per-account unique invoice number) comes from the `create_invoices` migration. The `add_invoice_paid_on` migration adds the nullable `paid_on` date: an invoice with a payment date is paid and lives in the history. The `add_invoice_cancelled_on` migration adds the nullable `cancelled_on` date: a cancelled invoice leaves the open list and lives in the "Anulowane" tab of the history. The `add_invoice_paused_on` migration adds the nullable `paused_on` date: an open invoice with it set has its escalation paused and sits in the "Wstrzymane" tab of `/invoices`. The `add_client_deactivated_on` migration adds the nullable `deactivated_on` date to `clients` (a client with it set is deleted, shown in the "Nieaktywni" tab of `/clients` and restorable) plus two triggers: deleting a client with an open invoice (paused ones included) is rejected, and so is opening an invoice for a deleted client.
The `public.user_settings` table (with RLS, one row per user) comes from the `create_user_settings` migration: escalation thresholds, the annual interest rate and the three compensation amounts edited on `/settings`; a user without a row gets the statutory defaults from code. The `add_invoice_payment_snapshot` migration adds the nullable `paid_rate_bp` and `paid_compensation_grosze` columns to `invoices`: marking an invoice as paid stores the rate and compensation in force on that day, so the history stays frozen at those values even after the settings change.
The `public.sender_profiles` table (with RLS, one row per user) comes from the `create_sender_profiles` migration: the company name, NIP, address and bank account edited in the "Dane nadawcy" card on `/settings`; every field is optional. The reminder text puts the name, address and NIP under the signature and the account number in the payment deadline sentence, and the reminder dialog on `/` prompts to fill the profile in when it is empty.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `/auth/signup`        | Email/password sign-up form                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `/`                   | Protected list of clients with reminders due (stages 1–4); "Generuj ponaglenie" copies a collective reminder for a client to the clipboard (redirects to `/auth/signin` if unauthenticated)                                                                                                                                                                                                                                                                                                   |
| `/invoices`           | Protected list of open invoices with interest and compensation per overdue invoice, with tabs Eskalacja · Wstrzymane; edit an open invoice (until it is overdue) or cancel it, pause and resume its escalation (paused invoices form the "Wstrzymane" tab, keep accruing interest and unlock the fields) (redirects to `/auth/signin` if unauthenticated)                                                                                                                                     |
| `/history`            | Protected list of paid invoices with days overdue, interest and compensation as of the payment date; change the payment date or reopen an invoice, with tabs Zapłacone · Anulowane; the "Anulowane" tab is where an invoice can be restored to the open list (redirects to `/auth/signin` if unauthenticated)                                                                                                                                                                                 |
| `/settings`           | Protected settings with tabs Dane nadawcy · Reguła eskalacji: the "Dane nadawcy" tab (company name, NIP, address and bank account inserted into reminders; all optional, saved separately) and the "Reguła eskalacji" tab, the escalation settings form: stage 1–4 thresholds (days overdue), annual interest rate and compensation per invoice amount tier, with "Przywróć domyślne"; saved values apply to `/` and `/invoices` immediately (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. `/` is protected with an exact match; add further paths (prefix-matched) to the `PROTECTED_ROUTES` array there to require authentication. Signed-in users visiting `/auth/signin` or `/auth/signup` are redirected to `/`.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/) as the `naleznosci` Worker (`https://naleznosci.domblacha.workers.dev`).

Deployment runs in GitHub Actions (`.github/workflows/ci.yml`). Workers Builds is disconnected, so the workflow is the only thing that deploys.

| Event          | Jobs                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Pull request   | `checks`: `astro sync` → lint → `astro check` → `npm test` → build; `integration`: `supabase start` → `npm run test:integration`            |
| Push to `main` | `checks` and `integration` in parallel, then `deploy` once both are green: build → `supabase link` + `supabase db push` → `wrangler deploy` |

`deploy` runs in strict order: a broken build or a red integration test never touches the database, and code never ships ahead of the schema it needs. Runs are serialized (`concurrency: production`, no cancellation), so a second merge waits for a migration in progress.

**Work on a branch and merge through a PR — never push to `main` directly.** Branch protection is not available on the free plan for private repos, so this is a convention. Review migration SQL on the PR: merging applies it to production.

### Repository secrets

Used only by the `deploy` job (Settings → Secrets and variables → Actions → _Repository secrets_):

| Secret                  | Where to get it                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare → My Profile → API Tokens, template "Edit Cloudflare Workers"                                                 |
| `CLOUDFLARE_ACCOUNT_ID` | `npx wrangler whoami`, or the Workers dashboard sidebar                                                                  |
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens; scope to the production project, Read on Project Settings, API Keys, API Key Secrets |
| `SUPABASE_DB_PASSWORD`  | Supabase → Project Settings → Database (reset there if lost)                                                             |
| `SUPABASE_PROJECT_REF`  | Supabase → Project Settings → General → Project ID                                                                       |

### Manual (fallback) deploy

From a clean, up-to-date `main` — migrations first, then code:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
npm run build
npx wrangler deploy
```

Do not pass `--config`: `astro build` generates `dist/server/wrangler.json` and Wrangler picks it up via `.wrangler/deploy/config.json`.

### Worker secrets

`SUPABASE_URL` and `SUPABASE_KEY` (the `sb_publishable_…` key) exist only as Worker secrets — never in the repo, GitHub, or as dashboard build variables. Set them with the interactive prompt so the values do not end up in shell history:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

The production Supabase project has **email confirmation disabled** (the built-in SMTP only delivers to organization members, and the app has no confirmation route).

### Migracje

Migracje stosuje potok: nowy plik w `supabase/migrations/` trafia na produkcję w jobie `deploy` po merge PR-a, zawsze przed wdrożeniem kodu. Nie uruchamiaj `db push` ręcznie przed merge.

Diagnostyka (porównanie stanu lokalnego i zdalnego):

```bash
npx supabase link --project-ref <ref>   # jednorazowo
npx supabase migration list
```

Gdy `deploy` padnie:

- **Na `supabase db push`** — kod się nie wdraża, produkcja zostaje na starym schemacie i starym kodzie. Napraw migrację nową migracją przez PR (nie edytuj już zastosowanego pliku).
- **Na `wrangler deploy` po udanym `db push`** — produkcja ma nowy schemat i stary kod. Actions → przebieg → **Re-run failed jobs**: `db push` jest idempotentny (zastosowane migracje są pomijane), więc ponowienie tylko dokończy wdrożenie.

Rollback Workera **nie cofa schematu**. Wycofanie zmiany w bazie wymaga nowej migracji (np. `drop table`), wdrożonej przez PR.

### Rollback

Dashboard → Workers & Pages → `naleznosci` → Deployments → roll back to a previous version, then revert the offending commit in a PR and merge it — otherwise the next merge redeploys the bug.

## Smoke test

`scripts/smoke.mjs` is a dependency-free Node script that walks the whole auth flow (sign-up, sign-in, protected page, sign-out) over HTTP. Run it against the dev server or the production preview after dependency upgrades:

```bash
npm run dev            # or: npm run build && npm run preview
BASE_URL=http://localhost:4321 npm run smoke
```

It needs a reachable Supabase instance (local or cloud) with email confirmation disabled. The client steps (create/edit, duplicates, isolation between two users) additionally require the `create_clients` migration to be applied on that instance; the invoice steps (including marking an invoice as paid and reopening it) require `create_invoices` and `add_invoice_paid_on`; the edit and cancel steps additionally require `add_invoice_cancelled_on`; the pause and resume steps require `add_invoice_paused_on`; the delete and restore client steps require `add_client_deactivated_on`; the `settingsSteps` group requires `create_user_settings`, and the `snapshotSteps` group requires both `create_user_settings` and `add_invoice_payment_snapshot`, and the `senderProfileSteps` group requires `create_sender_profiles`.

> **Note:** this script exists primarily to guard the development of the starter itself — it is a fast sanity check that dependency upgrades did not break the build, the Cloudflare adapter or the Supabase auth flow. It is **not** a substitute for a real test suite. Once you build your own product on top of this starter, add proper tests (unit, integration, end-to-end) suited to your application.

## License

MIT
