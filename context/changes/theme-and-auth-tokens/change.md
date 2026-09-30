---
change_id: theme-and-auth-tokens
title: Paleta kolorów w tokenach i ekrany konta oparte na tokenach
status: implementing
created: 2026-09-29
updated: 2026-09-30
archived_at: null
---

## Notes

UI change prowadzony przez `/10x-ui`.

- **Widok:** ekrany konta — `src/pages/auth/{signin,signup,confirm-email}.astro` + `src/components/auth/*` (z ich wspólną powłoką: `src/layouts/Layout.astro`, `src/components/Topbar.astro`, `src/components/Banner.astro`).
- **Źródło tokenów:** `src/styles/global.css` — wartości w `:root` / `.dark`, publikowane przez `@theme inline`.
- **Komponenty:** `src/components/ui/` (shadcn, styl `new-york`, `components.json` już jest — bez `shadcn init`; nowe przez `npx shadcn@latest add <nazwa>`).
- **Wariant kontraktu:** świeży starter z martwym plikiem tokenów — najpierw widoki czytają istniejące tokeny, dopiero potem nowe wartości palety.
- **Pre-audit (2026-09-29):** skan zahardkodowanych wartości — 37 trafień w 13 plikach (najwięcej: `Banner.astro` 9, `FormField.tsx` 5, strony auth po 4).
- **Dlaczego teraz:** przed S-02 (`add-and-edit-clients`), żeby formularz klienta odziedziczył tokeny, komponenty i regułę UI zamiast literałów. Pełny audyt 7 stanów głównego widoku — osobna zmiana po S-03 (`invoice-escalation-list`).
- **Motyw (2026-09-29):** paleta shadcn wybrana przez użytkownika — baza stone, akcent amber, `--radius: 0`; wartości dosłownie w `theme-values.css` w tym folderze.
- **Domyślny motyw (2026-09-29):** jasny (`:root`); `Layout.astro` bez klasy `dark`. Wartości `.dark` zostają w `global.css` na przyszły przełącznik, poza zakresem tej zmiany.
- **Zakres powłoki (2026-09-29):** `src/pages/index.astro` + `Topbar.astro` wchodzą minimalnie — tło, karta i Topbar na tokenach. Pełny audyt 7 stanów ekranu głównego nadal po S-03.
