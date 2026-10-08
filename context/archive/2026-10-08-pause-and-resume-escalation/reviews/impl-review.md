<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Wstrzymanie i wznowienie eskalacji faktury

- **Plan**: context/changes/pause-and-resume-escalation/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated checks (2026-10-08): `npm test` 103/103 passed, `npm run lint` clean, `npx astro check` 0 errors, `npm run build` passed, migration `20261008120000` applied locally (`supabase migration list --local`), `npm run smoke` all steps passed, including the 17 pause steps (port 4321 stopped before and after).

## Findings

### F1 — Stan hooka wstrzymania przeżywa zamknięcie dialogu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/invoices/InvoiceFormDialog.tsx:208, src/components/invoices/InvoicesManager.tsx:80-83
- **Detail**: `useInvoicePause` is called at the top of `InvoiceFormDialog`, and the edit dialog stays mounted in `InvoicesManager`, so `error` and `pending` are never reset. Three effects: (a) an error from invoice A shows when invoice B is opened; (b) if the dialog is closed during a request and B is opened, B's button shows "Zapisywanie..." and is disabled; (c) when A's response arrives, `handlePauseChanged` calls `setEditing(changed)` unconditionally, so the open dialog switches from B to A. The sibling `useCancelInvoice` avoids this because it lives in `CancelInvoiceDialog`.
- **Fix A ⭐ Recommended**: Move the hook into a component mounted only while the dialog is open (e.g. a container around `PauseEscalationControl` keyed by `editing.id`), and in `handlePauseChanged` use `setEditing(prev => prev?.id === changed.id ? changed : prev)`.
  - Strength: The state lives as long as the invoice in the dialog, which is the `CancelInvoiceDialog` pattern. Fixes (a), (b) and (c) together.
  - Tradeoff: One more small component; `PauseEscalationControl` stays a pure view for the kitchen sink.
  - Confidence: HIGH — the dialog content is unmounted when closed (Radix), and the key handles switching invoices.
  - Blind spot: An in-flight request after closing still updates the list (that is correct).
- **Fix B**: Add `reset()` to the hook, call it when the dialog opens, and guard `setEditing` by id.
  - Strength: Minimal change, the hook stays where it is.
  - Tradeoff: Reset is manual; (b) is fixed only if `pending` is reset too, and a late `finally` can still clear it.
  - Confidence: MED — depends on when the reset runs.
  - Blind spot: Responses that arrive after the reset.
- **Decision**: FIXED (Fix A) — `PauseEscalationToggle` keyed by `editing.id` in InvoiceFormDialog.tsx; guard by id in `handlePauseChanged`.

### F2 — `DELETE /payment` po cichu wznawia otwartą wstrzymaną fakturę

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/invoices.ts:107-113
- **Detail**: `setInvoicePayment` now always sets `paused_on: null`, and when `paidOn === null` its filter is only `id` + `cancelled_on is null`. `DELETE /api/invoices/[id]/payment` on an open, paused invoice therefore returns 200 and clears the pause. Before this change the call was a harmless no-op. The plan only intended to clear the pause when an invoice is closed. The UI calls DELETE only from `/history`, so the risk is limited to direct API calls and races.
- **Fix**: When `paidOn === null`, add `.not("paid_on", "is", null)` to the filter (reopen only a paid invoice; otherwise 404).
- **Decision**: FIXED — filter added in `setInvoicePayment`; smoke step "payment A: reopening an open invoice -> 404" added and passing.

### F3 — Fokus może spaść z przełącznika po `disabled={pending}`

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/components/invoices/InvoiceFormDialog.tsx:174
- **Detail**: The form `key` does not unmount the toggle (it is outside the keyed subtree), so that part is correct. However, the focused button gets `disabled` during the request, and browsers then move focus to `body`. Radix FocusScope does not restore it, so after the response focus may not return to the toggle. Manual criterion 2.11 is marked done; it is worth confirming it in a keyboard-only run (Space on the toggle → Tab).
- **Fix**: If it reproduces, use `aria-disabled` instead of `disabled` while pending (the hook already guards with `if (pending) return`).
- **Decision**: SKIPPED

### F4 — Równoległy zapis formularza i przełączenie mogą nadpisać stan na kliencie

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/invoices/InvoiceFormDialog.tsx:239-245, src/components/invoices/InvoicesManager.tsx:75-83
- **Detail**: The save and the toggle have separate `pending` flags. If both requests run, whichever response arrives last overwrites the list entry. A save response with the old `pausedOn` can leave the row in the wrong group until refresh. The server stays consistent.
- **Fix**: Disable the toggle while the form is saving (and the other way round), e.g. by lifting `pending` up to the dialog.
- **Decision**: SKIPPED

### F5 — 0 wierszy przy warunkowym update zawsze zwraca `not_found`

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/invoices.ts:145-149, 183-210
- **Detail**: An edit that loses a race with a resume, pausing an already paused invoice (second tab) and resuming an unpaused one all give "Nie znaleziono faktury. Odśwież stronę.". The plan chose this on purpose (spec: 404). "Odśwież" is the right action, but the message is misleading.
- **Fix**: Leave as is (consistent with the plan), or later add a `conflict` code with its own message.
- **Decision**: SKIPPED

## Triage summary

- Fixed: F1 (Fix A), F2
- Skipped: F3, F4, F5
