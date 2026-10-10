import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCopyToClipboard, type CopyStatus } from "@/components/hooks/use-copy-to-clipboard";
import { formatAmount } from "@/lib/format";
import { renderReminder, type ClientReminder } from "@/lib/reminder";
import { isSenderProfileEmpty } from "@/lib/sender-profile";
import type { SenderProfile } from "@/types";

interface ReminderDialogViewProps {
  idPrefix: string;
  text: string;
  status: CopyStatus;
  onTextChange: (value: string) => void;
  onCopy: () => void;
  /** True when the sender profile is empty, so the text has no sender data. */
  senderMissing: boolean;
  onClose?: () => void;
}

export function ReminderDialogView({
  idPrefix,
  text,
  status,
  onTextChange,
  onCopy,
  senderMissing,
  onClose,
}: ReminderDialogViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = `${idPrefix}-text`;

  // On a failed copy keep the text selected so the user can copy it by hand.
  useEffect(() => {
    if (status === "error") textareaRef.current?.select();
  }, [status]);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={fieldId} className="mb-1">
          Treść ponaglenia
        </Label>
        <Textarea
          id={fieldId}
          ref={textareaRef}
          rows={18}
          className="field-sizing-fixed"
          value={text}
          onChange={(e) => {
            onTextChange(e.target.value);
          }}
        />
      </div>
      {senderMissing ? (
        <Alert>
          <AlertDescription>
            Ponaglenie nie zawiera danych nadawcy. Uzupełnij je w <a href="/settings">Ustawieniach</a>.
          </AlertDescription>
        </Alert>
      ) : null}
      {status === "error" ? (
        <Alert variant="destructive">
          <AlertDescription>
            Nie udało się skopiować do schowka. Zaznacz treść i skopiuj ją ręcznie (Ctrl+C lub ⌘C).
          </AlertDescription>
        </Alert>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {status === "copied" ? "Skopiowano do schowka" : ""}
      </span>
      <DialogFooter>
        <Button type="button" onClick={onCopy}>
          {status === "copied" ? (
            <>
              <Check className="size-4" />
              Skopiowano
            </>
          ) : (
            <>
              <Copy className="size-4" />
              Kopiuj do schowka
            </>
          )}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Zamknij
        </Button>
      </DialogFooter>
    </div>
  );
}

function ReminderContent({
  reminder,
  today,
  sender,
  onClose,
}: {
  reminder: ClientReminder;
  today: string;
  sender: SenderProfile;
  onClose: () => void;
}) {
  const [text, setText] = useState(() => renderReminder(reminder, today, sender));
  const { status, copy } = useCopyToClipboard();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Ponaglenie — {reminder.clientName}</DialogTitle>
        <DialogDescription>
          Etap {reminder.stage} · Faktury: {reminder.items.length} · Razem do zapłaty:{" "}
          {formatAmount(reminder.totalGrosze)}
        </DialogDescription>
      </DialogHeader>
      <ReminderDialogView
        idPrefix="reminder"
        text={text}
        status={status}
        onTextChange={setText}
        onCopy={() => void copy(text)}
        senderMissing={isSenderProfileEmpty(sender)}
        onClose={onClose}
      />
    </>
  );
}

interface ReminderDialogProps {
  reminder: ClientReminder | null;
  today: string;
  sender: SenderProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: () => void;
}

export function ReminderDialog({ reminder, today, sender, open, onOpenChange, onCloseAutoFocus }: ReminderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onCloseAutoFocus?.();
        }}
      >
        {/* Mounted only while open and keyed by client, so the text is regenerated on every opening. */}
        {reminder ? (
          <ReminderContent
            key={reminder.clientId}
            reminder={reminder}
            today={today}
            sender={sender}
            onClose={() => {
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
