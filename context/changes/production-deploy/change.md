---
change_id: production-deploy
title: Deployment produkcyjny — GitHub + Cloudflare Workers Builds + Supabase
status: implementing
created: 2026-09-23
updated: 2026-09-24
archived_at: null
---

## Notes

Najprostszy setup: prywatne repo GitHub, ręczny pierwszy `wrangler deploy` z sekretami, potem Workers Builds auto-deploy z `main`, produkcyjny projekt Supabase. Bez CI i runbooków. Stan: `## Progress` w plan.md + dowody w deployment-log.md.
