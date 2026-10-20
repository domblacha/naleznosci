---
change_id: remove-confirm-email-screen
title: Usunięcie ekranu confirm-email — po rejestracji prosto na stronę główną
status: implementing
created: 2026-10-20
updated: 2026-10-20
archived_at: null
---

## Notes

— wariant A: po rejestracji (potwierdzanie maila wyłączone) przekierować od razu na "/" gdy signUp zwraca sesję, w przeciwnym razie na /auth/signin?info=check_email; usunąć src/pages/auth/confirm-email.astro, zaktualizować scripts/smoke.mjs (linie 95, 674), README i CLAUDE.md.
