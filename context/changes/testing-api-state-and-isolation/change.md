---
change_id: testing-api-state-and-isolation
title: Testy integracyjne przejść stanu, izolacji użytkowników i walidacji API
status: implemented
created: 2026-10-14
updated: 2026-10-14
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Przejścia stanu i izolacja przez API".
Risks covered: #4 (API przejść stanu faktury przyjmuje niedozwoloną kombinację albo zostawia niespójny stan), #5 (Nadużycie IDOR — użytkownik B odczytuje lub zmienia zasoby użytkownika A), #6 (Nadużycie — walidacja po stronie serwera przepuszcza wartości spoza zakresu). Test types planned: integration (Vitest + lokalny Supabase).
Risk response intent:
- #4: macierz stan × akcja — każde niedozwolone przejście zwraca 4xx i nie zmienia wiersza w bazie; każde dozwolone zostawia spójny wiersz (daty stanu, migawka, blokada edycji); ponaglenie i lista nie obejmują faktur zapłaconych ani anulowanych.
- #5: drugi zalogowany użytkownik dostaje 404/403 (lub pusty wynik) na każdym endpointcie z [id] i na odczytach, a dane właściciela pozostają niezmienione.
- #6: wartości spoza zakresu wysłane bezpośrednio do API są odrzucane z 400, a stan w bazie się nie zmienia.
After creating the folder, follow the downstream continuation rule.
