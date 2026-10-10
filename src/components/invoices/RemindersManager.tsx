import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { RemindersSection } from "@/components/invoices/RemindersSection";
import { useReloadOnBfcacheRestore } from "@/components/hooks/use-reload-on-bfcache-restore";
import { chargeSettingsFrom } from "@/lib/charges";
import { buildClientReminders } from "@/lib/reminder";
import type { EscalationSettings, Invoice, SenderProfile } from "@/types";

interface Props {
  invoices: Invoice[];
  /** Whether the user has any active client. */
  hasClients: boolean;
  /** YYYY-MM-DD, "today" in Poland, computed on the server. */
  today: string;
  /** User's escalation settings, read on the server. */
  settings: EscalationSettings;
  /** User's sender profile, read on the server; goes into the reminder text. */
  sender: SenderProfile;
}

export function RemindersManager({ invoices, hasClients, today, settings, sender }: Props) {
  useReloadOnBfcacheRestore();

  const reminders = useMemo(
    () => buildClientReminders(invoices, today, settings.thresholds, chargeSettingsFrom(settings)),
    [invoices, today, settings],
  );

  if (!hasClients) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-muted-foreground">Najpierw dodaj klienta</p>
        <Button asChild>
          <a href="/clients">Przejdź do klientów</a>
        </Button>
      </div>
    );
  }

  if (reminders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-muted-foreground text-sm">Żaden klient nie ma faktur na etapach 1–4.</p>
        <Button asChild variant="link">
          <a href="/invoices">Przejdź do faktur</a>
        </Button>
      </div>
    );
  }

  return <RemindersSection reminders={reminders} today={today} sender={sender} />;
}
