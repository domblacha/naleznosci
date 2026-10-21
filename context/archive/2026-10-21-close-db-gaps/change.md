---
change_id: close-db-gaps
title: Przeniesienie reguł edycji faktur do bazy, by zamknąć luki PostgREST
status: archived
created: 2026-10-21
updated: 2026-10-21
archived_at: 2026-10-21T12:34:20Z
---

## Notes

Zamknięcie luk w bazie dostępnych przez PostgREST, udokumentowanych w src/lib/services/db-gaps.int.test.ts (it.fails).
Reguły egzekwowane dziś tylko w serwisie src/lib/services/invoices.ts trzeba przenieść do bazy (trigger/constraint w nowej migracji):

- zakaz zmiany amount_grosze faktury zapłaconej (paid_on) i anulowanej (cancelled_on);
- zakaz zmiany due_date faktury przeterminowanej i niewstrzymanej (paused_on is null);
- zakaz paid_on w przyszłości.
- Testy control: muszą dalej przechodzić; po załataniu zdjąć .fails z odpowiednich testów.
