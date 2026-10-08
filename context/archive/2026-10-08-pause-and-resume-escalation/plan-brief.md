# Wstrzymanie i wznowienie eskalacji faktury — Plan Brief

> Full plan: `context/changes/pause-and-resume-escalation/plan.md`

## What & Why

S-08 z roadmapy (US-03, FR-013, wyjątek z FR-003). Gdy użytkownik negocjuje z klientem, faktura nie powinna eskalować ani trafiać do ponagleń, a termin i kwotę trzeba móc poprawić mimo blokady po terminie. Wznowienie nie resetuje licznika dni: faktura wraca na etap wynikający z aktualnej liczby dni po terminie.

## Starting Point

Stan faktury opisują daty `paid_on` i `cancelled_on` (S-06, S-07). Etap wylicza `groupInvoices`, ponaglenia biorą tylko grupy etapów 1–4, a blokadę edycji po terminie trzyma jedna funkcja `isInvoiceLocked`, używana przez serwer i dialog. Wstrzymania nie ma.

## Desired End State

W dialogu „Edytuj fakturę” jest przycisk „Wstrzymaj eskalację” / „Wznów eskalację”. Wstrzymana faktura jest w grupie „Wstrzymane” na końcu listy, poza ponagleniami, z rosnącymi odsetkami i odblokowanymi polami. Po wznowieniu od razu trafia na właściwy etap (np. faktura 40 dni po terminie od razu na etap 4) i znów jest zablokowana, jeśli jest po terminie.

## Key Decisions Made

| Decision                 | Choice                                                                              | Why (1 sentence)                                                                                 | Source |
| ------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------ |
| Co można wstrzymać       | Każdą otwartą fakturę, także bieżącą i sprzed etapu 1                               | Brak warunku czasowego (żadnego wyścigu o północy); można wstrzymać z wyprzedzeniem.             | Plan   |
| Zapłata/anulowanie       | Zamknięcie czyści `paused_on`; przywrócona faktura wraca niewstrzymana              | Zamknięta faktura nie niesie ukrytego stanu; constraint w bazie tego pilnuje.                    | Plan   |
| Odblokowane pola         | Klient, kwota i termin (cała blokada zdjęta)                                        | Jedna reguła „wstrzymana = niezablokowana” w `isInvoiceLocked`, bez blokady per pole.            | Plan   |
| Miejsce akcji            | Przełącznik w dialogu edycji, bez potwierdzenia; dialog zostaje otwarty             | Zgodne z S-07 (bez trzeciego przycisku w wierszu); akcja łatwo odwracalna.                       | Plan   |
| Model danych             | `paused_on date null`, datę ustawia serwer; check: tylko na fakturze otwartej       | Ten sam styl co `paid_on` i `cancelled_on`.                                                      | Plan   |
| Grupa na liście          | `paused` ostatnia, po „Bieżące”; wiersz pokazuje dni i odsetki, jeśli po terminie   | FR-010 wymienia grupę „wstrzymane”; odsetki rosną dalej (FR-007).                                 | PRD    |
| Wykluczenie z ponagleń   | Przez grupę `paused` (filtr `STAGE_BY_GROUP` już ją pomija) + jawny test            | Jedna reguła dla listy i ponagleń, bez osobnego filtra w `reminder.ts`.                          | Plan   |
| API                      | `PUT`/`DELETE /api/invoices/[id]/pause`; powtórzenie lub zamknięta faktura → 404     | Wzorzec `cancellation`; RLS bez nowych polityk.                                                  | Plan   |

## Scope

**In scope:** migracja `paused_on`, grupa `paused`, wyjątek blokady, czyszczenie przy zapłacie i anulowaniu, endpoint `pause`, przełącznik w dialogu, grupa „Wstrzymane” na `/`, testy jednostkowe, smoke, `/dev/ui`, README.

**Out of scope:** potwierdzenie akcji, przycisk w wierszu, wybór daty wstrzymania, historia wstrzymań, wstrzymanie w `/history`, automatyczne wznowienie, zatrzymanie odsetek, filtrowanie i sortowanie (S-11), konfigurowalne progi (S-10).

## Architecture / Approach

Trzecia data stanu `paused_on` obok `paid_on` i `cancelled_on`. Czysta reguła: `groupInvoices` kieruje wstrzymaną do `paused` przed liczeniem etapu, a `isInvoiceLocked` zwraca `false` dla wstrzymanej. Serwis edycji zapisuje warunkowo „termin nie minął albo wstrzymana”, więc wznowienie w trakcie edycji nie przepuści zmiany. UI podmienia fakturę w stanie wyspy, a grupy i ponaglenia przeliczają się same.

## Phases at a Glance

| Phase                      | What it delivers                                                    | Key risk                                                       |
| -------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Dane, reguła i API      | Migracja, reguła grupowania i blokady z testami, endpoint, smoke    | Warunek `.or(...)` w zapisie edycji (wyścig ze wznowieniem)     |
| 2. Wstrzymanie na liście   | Grupa „Wstrzymane”, przełącznik w dialogu, `/dev/ui`, README        | Reset formularza i fokus przy przełączaniu w otwartym dialogu  |

**Prerequisites:** S-04 i S-07 zrobione; lokalny Supabase z migracjami do `add_invoice_cancelled_on`.
**Estimated effort:** ~2 sesje, 2 fazy.

## Open Risks & Assumptions

- Rollback Workera bez cofnięcia migracji: stary kod nie czyści `paused_on`, więc constraint zablokuje zapłatę i anulowanie wstrzymanych faktur, a te wrócą na etapy.
- Rozszerzenie wobec PRD: wstrzymanie odblokowuje też klienta (PRD wymienia termin i kwotę); decyzja świadoma.

## Success Criteria (Summary)

- Wstrzymana faktura znika z etapów i z ponaglenia klienta, a jej odsetki rosną dalej.
- W czasie wstrzymania klient, kwota i termin są edytowalne także po terminie; po wznowieniu faktura od razu ma właściwy etap i blokadę.
- Zapłacona lub anulowana faktura nigdy nie jest wstrzymana, a po przywróceniu wraca niewstrzymana.
