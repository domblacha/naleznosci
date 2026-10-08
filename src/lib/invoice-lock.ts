import { daysOverdue } from "@/lib/escalation";
import type { Invoice, InvoiceInput } from "@/types";

/**
 * From the day after the due date the client, amount and due date can no longer be changed,
 * unless the escalation is paused (a paused invoice is never locked).
 */
export function isInvoiceLocked(invoice: { dueDate: string; pausedOn: string | null }, today: string): boolean {
  return invoice.pausedOn === null && daysOverdue(invoice.dueDate, today) >= 1;
}

/** True when the input changes any field guarded by `isInvoiceLocked` (the number is not one of them). */
export function lockedFieldsChanged(
  current: Pick<Invoice, "clientId" | "amountGrosze" | "dueDate">,
  input: InvoiceInput,
): boolean {
  return (
    current.clientId !== input.clientId ||
    current.amountGrosze !== input.amountGrosze ||
    current.dueDate !== input.dueDate
  );
}
