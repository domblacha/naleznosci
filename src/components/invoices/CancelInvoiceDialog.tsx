import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { useCancelInvoice } from "@/components/hooks/use-cancel-invoice";
import type { Invoice } from "@/types";

export const CANCEL_DESCRIPTION =
  "Faktura zniknie z listy i z ponagleń i trafi do historii. Możesz ją stamtąd przywrócić.";

export function cancelTitle(number: string): string {
  return `Anulować fakturę ${number}?`;
}

interface CancelInvoiceViewProps {
  /** Title and description are slots: the real dialog passes Radix parts, the kitchen sink plain text. */
  title: ReactNode;
  description: ReactNode;
  pending: boolean;
  error?: string | null;
  /** Renders plain buttons: Radix dialog parts need a dialog context, which `/dev/ui` does not have. */
  standalone?: boolean;
  onConfirm: () => void;
}

/** Content of the confirmation, rendered inside `AlertDialogContent` (or standalone in `/dev/ui`). */
export function CancelInvoiceView({
  title,
  description,
  pending,
  error,
  standalone,
  onConfirm,
}: CancelInvoiceViewProps) {
  const confirmContent = (
    <>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      Anuluj fakturę
    </>
  );
  return (
    <>
      <AlertDialogHeader>
        {title}
        {description}
      </AlertDialogHeader>
      <ServerError message={error} />
      <AlertDialogFooter>
        {standalone ? (
          <>
            <Button variant="outline" disabled={pending}>
              Wróć
            </Button>
            <Button variant="destructive" disabled={pending} onClick={onConfirm}>
              {confirmContent}
            </Button>
          </>
        ) : (
          <>
            <AlertDialogCancel disabled={pending}>Wróć</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                // Keep the dialog open until the request settles.
                e.preventDefault();
                onConfirm();
              }}
            >
              {confirmContent}
            </AlertDialogAction>
          </>
        )}
      </AlertDialogFooter>
    </>
  );
}

function CancelInvoiceContent({ invoice, onCancelled }: { invoice: Invoice; onCancelled: (invoice: Invoice) => void }) {
  const { cancel, pending, error } = useCancelInvoice({ onCancelled });
  return (
    <CancelInvoiceView
      title={<AlertDialogTitle>{cancelTitle(invoice.number)}</AlertDialogTitle>}
      description={<AlertDialogDescription>{CANCEL_DESCRIPTION}</AlertDialogDescription>}
      pending={pending}
      error={error}
      onConfirm={() => void cancel(invoice.id)}
    />
  );
}

interface CancelInvoiceDialogProps {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled: (invoice: Invoice) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

export function CancelInvoiceDialog({
  invoice,
  open,
  onOpenChange,
  onCancelled,
  onCloseAutoFocus,
}: CancelInvoiceDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        {/* Mounted only while open, so the pending and error state reset on every opening. */}
        {invoice ? <CancelInvoiceContent key={invoice.id} invoice={invoice} onCancelled={onCancelled} /> : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}
