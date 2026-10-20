---
change_id: rebrand-naleznosci
title: Usunięcie śladów 10x Astro Starter i opisanie aplikacji jako Należności
status: implemented
created: 2026-10-20
updated: 2026-10-20
archived_at: null
---

## Notes

Usunięcie odwołań do 10x Astro Starter i opisanie aplikacji jako Należności. Podmiana favicony 10x na prosty SVG.

Zakres (z weryfikacji repo):

- `src/lib/config-status.ts:16` — `docsUrl` banera Supabase wskazuje `przeprogramowani/10x-astro-starter`; zmienić na `https://github.com/domblacha/naleznosci#supabase-configuration`.
- `public/favicon.png` (ikona 10x) → nowy `public/favicon.svg`; w `src/layouts/Layout.astro:18` `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`; usunąć `favicon.png`.
- `package.json` `name`: `10x-astro-starter` → `naleznosci`; odświeżyć `package-lock.json` (`npm install`).
- `README.md`: tytuł `# Należności`, usunąć `![](./public/template.png)` i plik `public/template.png`, nowy opis aplikacji, `git clone https://github.com/domblacha/naleznosci.git` / `cd naleznosci`, przeredagować lub usunąć notatkę o smoke teście „guard the development of the starter itself”.
- Poza zakresem: `.claude/skills/10x-*` i `context/` (narzędzia kursu i archiwum).
