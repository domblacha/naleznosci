# Dezaktywacja i przywracanie klienta — Plan Brief

> Full plan: `context/changes/client-deactivate-restore/plan.md`

## What & Why

S-09 z roadmapy (FR-002). Użytkownik może „usunąć” klienta, co oznacza go jako nieaktywnego z zachowaniem historii faktur, oraz przywrócić go. Celem jest porządek w liście klientów i w wyborze klienta przy fakturze bez utraty historii, a przy tym bez osieroconych otwartych należności.

## Starting Point

Tabela `clients` nie ma stanu, twarde usuwanie blokuje RLS, a indeksy duplikatów obejmują wszystkich klientów. Faktura jest otwarta, gdy nie ma `paid_on` ani `cancelled_on` (także wstrzymana). Do stanu otwartego prowadzą cztery ścieżki: dodanie, edycja klienta faktury, cofnięcie wpłaty i przywrócenie anulowanej.

## Desired End State

Na `/clients` każdy aktywny klient ma przycisk „Usuń” z potwierdzeniem. Usunięcie jest odrzucane z komunikatem, gdy klient ma otwartą fakturę. Usunięci klienci trafiają do sekcji „Usunięci klienci” z przyciskiem „Przywróć” i znikają z wyboru klienta w dialogu faktury. Żadna ścieżka nie zostawia otwartej faktury u usuniętego klienta (kod `client_inactive`). Duplikat usuniętego klienta wskazuje, gdzie go przywrócić.

## Key Decisions Made

| Decision                           | Choice                                                                             | Why (1 sentence)                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Co blokuje usunięcie               | Każda otwarta faktura (`paid_on` i `cancelled_on` null), także wstrzymana          | Ta sama definicja co lista na `/`, a wstrzymana nadal jest nieopłacona i nalicza odsetki.                  |
| Przywracanie faktury usuniętego    | Blokada: 409 `client_inactive` z komunikatem „przywróć klienta”                    | Niezmiennik „usunięty klient nie ma otwartych faktur” obowiązuje zawsze, bez ukrytych efektów ubocznych. |
| Egzekwowanie reguły                | Dwa triggery `BEFORE` w bazie (`clients` i `invoices`, z `FOR SHARE`)              | Atomowo, bez okna wyścigu, i jeden punkt dla wszystkich czterech ścieżek otwarcia faktury.                |
| Model stanu                        | `clients.deactivated_on date null`                                                 | Spójne z `paid_on`, `cancelled_on` i `paused_on`.                                                          |
| UI i nazewnictwo                   | „Usuń” z AlertDialog oraz sekcja „Usunięci klienci” z „Przywróć”; edycja usuniętego niedostępna | Język PRD i wzorzec „Anulowane faktury” z `/history`.                                       |
| Duplikat usuniętego klienta        | Kody `duplicate_nip_inactive` i `duplicate_name_inactive` z komunikatem o sekcji   | Użytkownik wie, gdzie szukać klienta niewidocznego na liście aktywnych.                                   |

## Scope

**In scope:**
- Migracja `add_client_deactivated_on` z kolumną i dwoma triggerami
- Serwis i endpoint `PUT`/`DELETE /api/clients/[id]/deactivation`, mapowanie `client_inactive` w fakturach
- `/clients`: przycisk „Usuń”, sekcja „Usunięci klienci” i komunikaty duplikatów; dialog faktury tylko z aktywnymi klientami
- Kroki smoke, `/dev/ui` i README

**Out of scope:**
- Twarde usuwanie, automatyczne przywracanie klienta przy przywracaniu faktury i wyjątek dla wstrzymanych
- Edycja usuniętego klienta, filtr „pokaż nieaktywnych” i wybór daty usunięcia

## Architecture / Approach

Stan klienta zależy od daty. Trigger na `clients` odrzuca dezaktywację przy otwartych fakturach (`client_has_open_invoices`). Trigger na `invoices` odrzuca otwartą fakturę u usuniętego klienta (`client_inactive`) i czyta klienta przez `FOR SHARE`, żeby zamknąć wyścig z równoległą dezaktywacją. Serwisy mapują treść wyjątku `P0001` na kody, tak jak dziś nazwy indeksów. API i UI powtarzają wzorce `cancellation` oraz `CancelInvoiceDialog` / `CancelledInvoicesSection`.

## Phases at a Glance

| Phase         | What it delivers                                                          | Key risk                                                              |
| ------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Dane i API | Migracja z triggerami, serwisy, endpoint, kody błędów, smoke              | Pierwsze triggery plpgsql w projekcie; kontrakt treści wyjątków       |
| 2. UI         | Usuwanie i przywracanie na `/clients`, komunikaty, `/dev/ui`, README       | Fokus po zniknięciu wiersza; czytelność komunikatów duplikatu         |

**Prerequisites:** S-03 (faktury) — gotowe; lokalny Supabase z zastosowanymi migracjami do `add_invoice_paused_on`.
**Estimated effort:** ~1–2 sesje w 2 fazach.

## Open Risks & Assumptions

- Mapowanie wyjątków po treści (`P0001` + tekst) jest kruche przy zmianie tekstu w migracji, dlatego oba miejsca muszą mieć komentarz o kontrakcie.
- Zakładamy, że PostgREST przekazuje `message` wyjątku z triggera w `error.message` (do potwierdzenia smoke'iem w fazie 1).

## Success Criteria (Summary)

- Klienta bez otwartych faktur można usunąć i przywrócić, a historia jego faktur zostaje nienaruszona.
- Klienta z otwartą (także wstrzymaną) fakturą nie da się usunąć, a usuniętemu żadna ścieżka nie otworzy faktury.
- Duplikat usuniętego klienta prowadzi użytkownika do jego przywrócenia.

## References

- Roadmapa S-09: `context/foundation/roadmap.md`; PRD FR-002: `context/foundation/prd.md`
- Wzorce: `src/pages/api/invoices/[id]/cancellation.ts`, `src/components/invoices/CancelInvoiceDialog.tsx`, `src/components/invoices/CancelledInvoicesSection.tsx`
