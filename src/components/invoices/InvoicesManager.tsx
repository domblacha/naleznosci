import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CancelInvoiceDialog } from "@/components/invoices/CancelInvoiceDialog";
import { InvoiceFormDialog } from "@/components/invoices/InvoiceFormDialog";
import { PaymentDialog } from "@/components/invoices/PaymentDialog";
import { RemindersSection } from "@/components/invoices/RemindersSection";
import { chargeSettingsFrom, compensationGrosze, interestGrosze } from "@/lib/charges";
import { groupInvoices, type EscalationGroup, type EscalationThresholds } from "@/lib/escalation";
import { formatAmount, formatDate } from "@/lib/format";
import type { Client, EscalationSettings, Invoice, SenderProfile } from "@/types";

interface Props {
  initialInvoices: Invoice[];
  clients: Client[];
  /** YYYY-MM-DD, "today" in Poland, computed on the server. */
  today: string;
  /** User's escalation settings, read on the server. */
  settings: EscalationSettings;
  /** User's sender profile, read on the server; goes into the reminder text. */
  sender: SenderProfile;
}

function groupLabels([t1, t2, t3, t4]: EscalationThresholds): Record<EscalationGroup, string> {
  return {
    stage_4: `Etap 4 · od ${t4} dni po terminie`,
    stage_3: `Etap 3 · od ${t3} dni po terminie`,
    stage_2: `Etap 2 · od ${t2} dni po terminie`,
    stage_1: `Etap 1 · od ${t1} dni po terminie`,
    pre_threshold: "Po terminie, przed etapem 1",
    current: "Bieżące",
    paused: "Wstrzymane",
  };
}

export function InvoicesManager({ initialInvoices, clients, today, settings, sender }: Props) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [open, setOpen] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  // Kept after the dialog closes so its content does not flip to the add form during the close animation.
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const cancelledRef = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);

  const groups = useMemo(
    () => groupInvoices(invoices, today, settings.thresholds),
    [invoices, today, settings.thresholds],
  );
  const labels = useMemo(() => groupLabels(settings.thresholds), [settings.thresholds]);
  const chargeSettings = useMemo(() => chargeSettingsFrom(settings), [settings]);

  function openDialog(opener: HTMLElement) {
    openerRef.current = opener;
    setOpen(true);
  }

  function handleSaved(saved: Invoice) {
    setInvoices((prev) => [...prev, saved]);
    setOpen(false);
  }

  function openPayDialog(invoiceId: string, opener: HTMLElement) {
    openerRef.current = opener;
    setPayingId(invoiceId);
    setPayOpen(true);
  }

  function handlePaid(saved: Invoice) {
    setInvoices((prev) => prev.filter((i) => i.id !== saved.id));
    setPayOpen(false);
  }

  function openEditDialog(invoice: Invoice, opener: HTMLElement) {
    openerRef.current = opener;
    setEditing(invoice);
    setEditOpen(true);
  }

  function handleEdited(saved: Invoice) {
    setInvoices((prev) => prev.map((i) => (i.id === saved.id ? saved : i)));
    setEditOpen(false);
  }

  function handlePauseChanged(changed: Invoice) {
    setInvoices((prev) => prev.map((i) => (i.id === changed.id ? changed : i)));
    setEditing((prev) => (prev?.id === changed.id ? changed : prev));
  }

  function handleCancelled(saved: Invoice) {
    cancelledRef.current = true;
    setInvoices((prev) => prev.filter((i) => i.id !== saved.id));
    setCancelOpen(false);
    setEditOpen(false);
  }

  function focusOpenerOrAdd() {
    // The row can be gone or moved to another group after a save, so fall back to the "Dodaj fakturę" button.
    if (openerRef.current?.isConnected) openerRef.current.focus();
    else addButtonRef.current?.focus();
  }

  const paying = invoices.find((i) => i.id === payingId) ?? null;

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
      ref={addButtonRef}
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
          <p className="text-muted-foreground">Nie masz otwartych faktur</p>
          <div className="flex items-center gap-4">
            {addButton}
            <Button asChild variant="link">
              <a href="/history">Zobacz historię</a>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-end">{addButton}</div>
          <RemindersSection invoices={invoices} today={today} settings={settings} sender={sender} />
          {groups.map(({ group, items }) => (
            <section key={group} className="space-y-2">
              <h2 className="text-foreground text-sm font-semibold">
                {labels[group]} <span className="text-muted-foreground font-normal">({items.length})</span>
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
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>{invoice.clientName}</TableCell>
                      <TableCell>{invoice.number}</TableCell>
                      <TableCell className="text-right">{formatAmount(invoice.amountGrosze)}</TableCell>
                      <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                      <TableCell className="text-right">
                        {invoice.daysOverdue <= 0 ? "—" : invoice.daysOverdue}
                      </TableCell>
                      <TableCell className="text-right">
                        {invoice.daysOverdue <= 0
                          ? "—"
                          : formatAmount(
                              interestGrosze(invoice.amountGrosze, invoice.daysOverdue, chargeSettings.annualRateBp),
                            )}
                      </TableCell>
                      <TableCell className="text-right">
                        {invoice.daysOverdue <= 0
                          ? "—"
                          : formatAmount(
                              compensationGrosze(
                                invoice.amountGrosze,
                                invoice.daysOverdue,
                                invoice.clientChargesCompensation,
                                chargeSettings.compensationTiers,
                              ),
                            )}
                      </TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Edytuj fakturę ${invoice.number}`}
                          onClick={(e) => {
                            openEditDialog(invoice, e.currentTarget);
                          }}
                        >
                          Edytuj
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Oznacz fakturę ${invoice.number} jako zapłaconą`}
                          onClick={(e) => {
                            openPayDialog(invoice.id, e.currentTarget);
                          }}
                        >
                          Zapłacona
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          ))}
        </>
      )}
      <PaymentDialog
        invoice={paying}
        today={today}
        mode="mark"
        settings={settings}
        open={payOpen}
        onOpenChange={setPayOpen}
        onSaved={handlePaid}
        onCloseAutoFocus={() => {
          // The row disappears after a save, so fall back to the "Dodaj fakturę" button.
          if (openerRef.current?.isConnected) openerRef.current.focus();
          else addButtonRef.current?.focus();
        }}
      />
      <InvoiceFormDialog
        open={open}
        onOpenChange={setOpen}
        clients={clients}
        today={today}
        onSaved={handleSaved}
        onCloseAutoFocus={() => {
          // The dialog has no DialogTrigger, so Radix cannot restore focus on its own.
          if (openerRef.current?.isConnected) openerRef.current.focus();
        }}
      />
      <InvoiceFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        clients={clients}
        invoice={editing}
        today={today}
        onSaved={handleEdited}
        onPauseChanged={handlePauseChanged}
        onCancelRequest={() => {
          setCancelOpen(true);
        }}
        onCloseAutoFocus={focusOpenerOrAdd}
      />
      <CancelInvoiceDialog
        invoice={editing}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onCancelled={handleCancelled}
        onCloseAutoFocus={(e) => {
          // After a successful cancel both dialogs close; "Wróć" keeps the edit dialog open and Radix restores focus into it.
          if (!cancelledRef.current) return;
          cancelledRef.current = false;
          e.preventDefault();
          addButtonRef.current?.focus();
        }}
      />
    </div>
  );
}
