---
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
---

## Why this stack

A solo developer building a receivables-tracking web app in 3 after-hours weeks needs an agent-friendly starter that ships auth, a relational database, and deployment out of the box. 10x-astro-starter is the recommended default for a JS web app and clears all four agent-friendly gates. Supabase covers email + password registration and login (FR-001) and Postgres row-level security enforces the per-owner data isolation the PRD requires. Escalation stages, interest, and compensation are computed on read from the Polish-time date, so no background jobs are needed and the edge runtime constraint does not bite; payments, realtime, and AI are out of scope. Bootstrapper confidence is first-class, so expect mostly smooth scaffolding with occasional manual steps. Deployment stays on the starter's default Cloudflare Pages, with GitHub Actions auto-deploying on merge to main.
