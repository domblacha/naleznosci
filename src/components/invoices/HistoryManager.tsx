import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CancelledInvoicesSection } from "@/components/invoices/CancelledInvoicesSection";
import { PaidInvoicesManager } from "@/components/invoices/PaidInvoicesManager";
import type { Invoice } from "@/types";

interface Props {
  initialPaid: Invoice[];
  initialCancelled: Invoice[];
  /** YYYY-MM-DD, "today" in Poland, computed on the server. */
  today: string;
}

/** Latest payment first, then by invoice number so equal dates keep a stable order. */
function sortPaid(invoices: Invoice[]): Invoice[] {
  return [...invoices].sort(
    (a, b) =>
      (b.paidOn ?? "").localeCompare(a.paidOn ?? "") || a.number.localeCompare(b.number, "pl", { numeric: true }),
  );
}

/** Latest cancellation first, then by invoice number so equal dates keep a stable order. */
function sortCancelled(invoices: Invoice[]): Invoice[] {
  return [...invoices].sort(
    (a, b) =>
      (b.cancelledOn ?? "").localeCompare(a.cancelledOn ?? "") ||
      a.number.localeCompare(b.number, "pl", { numeric: true }),
  );
}

export function HistoryManager({ initialPaid, initialCancelled, today }: Props) {
  const [paid, setPaid] = useState(() => sortPaid(initialPaid));
  const [cancelled, setCancelled] = useState(() => sortCancelled(initialCancelled));

  return (
    <Tabs defaultValue="paid">
      <TabsList>
        <TabsTrigger value="paid">Zapłacone ({paid.length})</TabsTrigger>
        <TabsTrigger value="cancelled">Anulowane ({cancelled.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="paid" forceMount>
        <PaidInvoicesManager
          invoices={paid}
          today={today}
          onSaved={(saved) => {
            setPaid((prev) => sortPaid(prev.map((i) => (i.id === saved.id ? saved : i))));
          }}
          onRestored={(id) => {
            setPaid((prev) => prev.filter((i) => i.id !== id));
          }}
        />
      </TabsContent>
      <TabsContent value="cancelled" forceMount>
        <CancelledInvoicesSection
          invoices={cancelled}
          onRestored={(id) => {
            setCancelled((prev) => prev.filter((i) => i.id !== id));
          }}
        />
      </TabsContent>
    </Tabs>
  );
}
