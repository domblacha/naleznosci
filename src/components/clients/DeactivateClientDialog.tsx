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
import { useDeactivateClient } from "@/components/hooks/use-deactivate-client";
import type { Client } from "@/types";

export const DEACTIVATE_DESCRIPTION =
  "Klient zniknie z wyboru przy nowych fakturach. Historia jego faktur zostaje, a klienta możesz przywrócić.";

export function deactivateTitle(name: string): string {
  return `Usunąć klienta ${name}?`;
}

interface DeactivateClientViewProps {
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
export function DeactivateClientView({
  title,
  description,
  pending,
  error,
  standalone,
  onConfirm,
}: DeactivateClientViewProps) {
  const confirmContent = (
    <>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      Usuń klienta
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

function DeactivateClientContent({
  client,
  onDeactivated,
}: {
  client: Client;
  onDeactivated: (client: Client) => void;
}) {
  const { deactivate, pending, error } = useDeactivateClient({ onDeactivated });
  return (
    <DeactivateClientView
      title={<AlertDialogTitle>{deactivateTitle(client.name)}</AlertDialogTitle>}
      description={<AlertDialogDescription>{DEACTIVATE_DESCRIPTION}</AlertDialogDescription>}
      pending={pending}
      error={error}
      onConfirm={() => void deactivate(client.id)}
    />
  );
}

interface DeactivateClientDialogProps {
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeactivated: (client: Client) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

export function DeactivateClientDialog({
  client,
  open,
  onOpenChange,
  onDeactivated,
  onCloseAutoFocus,
}: DeactivateClientDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        {/* Mounted only while open, so the pending and error state reset on every opening. */}
        {client ? <DeactivateClientContent key={client.id} client={client} onDeactivated={onDeactivated} /> : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}
