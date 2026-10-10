import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReminderDialog } from "@/components/invoices/ReminderDialog";
import { formatAmount } from "@/lib/format";
import { chargeSettingsFrom } from "@/lib/charges";
import { buildClientReminders } from "@/lib/reminder";
import type { EscalationSettings, Invoice, SenderProfile } from "@/types";

interface Props {
  invoices: Invoice[];
  /** YYYY-MM-DD, "today" in Poland, computed on the server. */
  today: string;
  /** User's escalation settings: stage thresholds, interest rate and compensation amounts. */
  settings: EscalationSettings;
  /** User's sender profile; rendered into the reminder text. */
  sender: SenderProfile;
}

export function RemindersSection({ invoices, today, settings, sender }: Props) {
  const reminders = useMemo(
    () => buildClientReminders(invoices, today, settings.thresholds, chargeSettingsFrom(settings)),
    [invoices, today, settings],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);

  const selected = reminders.find((r) => r.clientId === selectedId) ?? null;

  function openDialog(clientId: string, opener: HTMLElement) {
    openerRef.current = opener;
    setSelectedId(clientId);
    setOpen(true);
  }

  return (
    <section className="space-y-2">
      <h2 className="text-foreground text-sm font-semibold">Ponaglenia</h2>
      {reminders.length === 0 ? (
        <p className="text-muted-foreground text-sm">Żaden klient nie ma faktur na etapach 1–4.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Klient</TableHead>
              <TableHead>Etap</TableHead>
              <TableHead className="text-right">Faktury</TableHead>
              <TableHead className="text-right">Razem do zapłaty</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {reminders.map((reminder) => (
              <TableRow key={reminder.clientId}>
                <TableCell>{reminder.clientName}</TableCell>
                <TableCell>Etap {reminder.stage}</TableCell>
                <TableCell className="text-right">{reminder.items.length}</TableCell>
                <TableCell className="text-right">{formatAmount(reminder.totalGrosze)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Generuj ponaglenie dla ${reminder.clientName}`}
                    onClick={(e) => {
                      openDialog(reminder.clientId, e.currentTarget);
                    }}
                  >
                    Generuj ponaglenie
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <ReminderDialog
        reminder={selected}
        today={today}
        sender={sender}
        open={open}
        onOpenChange={setOpen}
        onCloseAutoFocus={() => {
          // The dialog has no DialogTrigger, so Radix cannot restore focus on its own.
          if (openerRef.current?.isConnected) openerRef.current.focus();
        }}
      />
    </section>
  );
}
