---
change_id: testing-quality-gates
title: Bramki jakości — testy integracyjne w CI na PR i post-edit hook dla agenta
status: archived
created: 2026-10-20
updated: 2026-10-20
archived_at: 2026-10-20T10:00:36Z
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Bramki jakości".
Risks covered: cross-cutting (utrwala ochronę ryzyk #1–#6 z §2). Test types planned: CI gate + post-edit hook.
Risk response intent:
- #4, #5, #6: `npm run test:integration` (Vitest + lokalny Supabase) uruchamia się w CI na każdym PR i blokuje merge, gdy niedozwolone przejście stanu, cudze id albo wartość spoza zakresu przestanie być odrzucane — czerwony test ma zatrzymać PR, a nie tylko zostać zalogowany.
- #1, #2, #3: `npm test` pozostaje wymaganą bramką na PR i przed deploy; regresja etapu, kwot lub treści ponaglenia blokuje merge.
- Pętla agenta: post-edit hook daje szybki sygnał (lint + powiązane testy) w momencie edycji, bez uruchamiania pełnego zestawu integracyjnego przy każdej zmianie.
- Kontrakt `db-gaps.int.test.ts` (`it.fails`) nie może po cichu przejść na zielono ani zablokować CI fałszywie — bramka musi traktować oczekiwane porażki zgodnie z §6.5.
After creating the folder, follow the downstream continuation rule.
