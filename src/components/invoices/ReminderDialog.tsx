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

interface ReminderDialogViewProps {
  idPrefix: string;
  text: string;
  status: CopyStatus;
  onTextChange: (value: string) => void;
  onCopy: () => void;
  onClose?: () => void;
}

export function ReminderDialogView({ idPrefix, text, status, onTextChange, onCopy, onClose }: ReminderDialogViewProps) {
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
  onClose,
}: {
  reminder: ClientReminder;
  today: string;
  onClose: () => void;
}) {
  const [text, setText] = useState(() => renderReminder(reminder, today));
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
        onClose={onClose}
      />
    </>
  );
}

interface ReminderDialogProps {
  reminder: ClientReminder | null;
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: () => void;
}

export function ReminderDialog({ reminder, today, open, onOpenChange, onCloseAutoFocus }: ReminderDialogProps) {
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
            onClose={() => {
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
