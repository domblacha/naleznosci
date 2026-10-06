import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceFormDialog } from "@/components/invoices/InvoiceFormDialog";
import { compensationGrosze, interestGrosze } from "@/lib/charges";
import { DEFAULT_THRESHOLDS, groupInvoices, type EscalationGroup } from "@/lib/escalation";
import { formatAmount, formatDate } from "@/lib/format";
import type { Client, Invoice } from "@/types";

interface Props {
  initialInvoices: Invoice[];
  clients: Client[];
  /** YYYY-MM-DD, "today" in Poland, computed on the server. */
  today: string;
}

const [T1, T2, T3, T4] = DEFAULT_THRESHOLDS;

const GROUP_LABELS: Record<EscalationGroup, string> = {
  stage_4: `Etap 4 · od ${T4} dni po terminie`,
  stage_3: `Etap 3 · od ${T3} dni po terminie`,
  stage_2: `Etap 2 · od ${T2} dni po terminie`,
  stage_1: `Etap 1 · od ${T1} dni po terminie`,
  pre_threshold: "Po terminie, przed etapem 1",
  current: "Bieżące",
};

export function InvoicesManager({ initialInvoices, clients, today }: Props) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);

  const groups = useMemo(() => groupInvoices(invoices, today), [invoices, today]);

  function openDialog(opener: HTMLElement) {
    openerRef.current = opener;
    setOpen(true);
  }

  function handleSaved(saved: Invoice) {
    setInvoices((prev) => [...prev, saved]);
    setOpen(false);
  }

  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-muted-foreground">Najpierw dodaj klienta</p>
        <Button asChild>
          <a href="/clients">Przejdź do klientów</a>
        </Button>
      </div>
    );
  }

  const addButton = (
    <Button
      onClick={(e) => {
        openDialog(e.currentTarget);
      }}
    >
      <Plus className="size-4" />
      Dodaj fakturę
    </Button>
  );

  return (
    <div className="space-y-4">
      {invoices.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-muted-foreground">Nie masz jeszcze faktur</p>
          {addButton}
        </div>
      ) : (
        <>
          <div className="flex justify-end">{addButton}</div>
          {groups.map(({ group, items }) => (
            <section key={group} className="space-y-2">
              <h2 className="text-foreground text-sm font-semibold">
                {GROUP_LABELS[group]} <span className="text-muted-foreground font-normal">({items.length})</span>
              </h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Klient</TableHead>
                    <TableHead>Numer</TableHead>
                    <TableHead className="text-right">Kwota</TableHead>
                    <TableHead>Termin</TableHead>
                    <TableHead className="text-right">Dni po terminie</TableHead>
                    <TableHead className="text-right">Odsetki</TableHead>
                    <TableHead className="text-right">Rekompensata</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>{invoice.clientName}</TableCell>
                      <TableCell>{invoice.number}</TableCell>
                      <TableCell className="text-right">{formatAmount(invoice.amountGrosze)}</TableCell>
                      <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                      <TableCell className="text-right">{group === "current" ? "—" : invoice.daysOverdue}</TableCell>
                      <TableCell className="text-right">
                        {group === "current"
                          ? "—"
                          : formatAmount(interestGrosze(invoice.amountGrosze, invoice.daysOverdue))}
                      </TableCell>
                      <TableCell className="text-right">
                        {group === "current"
                          ? "—"
                          : formatAmount(
                              compensationGrosze(
                                invoice.amountGrosze,
                                invoice.daysOverdue,
                                invoice.clientChargesCompensation,
                              ),
                            )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          ))}
        </>
      )}
      <InvoiceFormDialog
        open={open}
        onOpenChange={setOpen}
        clients={clients}
        onSaved={handleSaved}
        onCloseAutoFocus={() => {
          // The dialog has no DialogTrigger, so Radix cannot restore focus on its own.
          if (openerRef.current?.isConnected) openerRef.current.focus();
        }}
      />
    </div>
  );
}
