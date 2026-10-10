import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentDialog } from "@/components/invoices/PaymentDialog";
import { frozenChargesAsOf } from "@/lib/charges";
import { formatAmount, formatDate } from "@/lib/format";
import { invoiceErrorMessage } from "@/lib/invoice-errors";
import type { Invoice } from "@/types";

interface Props {
  initialInvoices: Invoice[];
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

export function PaidInvoicesManager({ initialInvoices, today }: Props) {
  const [invoices, setInvoices] = useState(() => sortPaid(initialInvoices));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const editing = invoices.find((i) => i.id === editingId) ?? null;

  function openEdit(invoiceId: string, opener: HTMLElement) {
    openerRef.current = opener;
    setEditingId(invoiceId);
    setEditOpen(true);
  }

  function handleSaved(saved: Invoice) {
    setInvoices((prev) => sortPaid(prev.map((i) => (i.id === saved.id ? saved : i))));
    setEditOpen(false);
  }

  async function restore(invoice: Invoice) {
    if (restoringId) return;
    setError(null);
    setRestoringId(invoice.id);
    try {
      const response = await fetch(`/api/invoices/${invoice.id}/payment`, { method: "DELETE" });
      if (response.ok) {
        setInvoices((prev) => prev.filter((i) => i.id !== invoice.id));
        headingRef.current?.focus();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(invoiceErrorMessage(body.error ?? "unknown"));
    } catch {
      setError(invoiceErrorMessage("unknown"));
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="space-y-4">
      <h2 ref={headingRef} tabIndex={-1} className="text-foreground text-sm font-semibold outline-none">
        Zapłacone faktury <span className="text-muted-foreground font-normal">({invoices.length})</span>
      </h2>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {invoices.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center">Brak zapłaconych faktur</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Klient</TableHead>
              <TableHead>Numer</TableHead>
              <TableHead className="text-right">Kwota</TableHead>
              <TableHead>Termin</TableHead>
              <TableHead>Data wpłaty</TableHead>
              <TableHead className="text-right">Dni opóźnienia</TableHead>
              <TableHead className="text-right">Odsetki</TableHead>
              <TableHead className="text-right">Rekompensata</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => {
              // Paid invoices always carry a snapshot (invoices_payment_snapshot_check).
              const charges = frozenChargesAsOf(
                invoice,
                { rateBp: invoice.paidRateBp ?? 0, compensationGrosze: invoice.paidCompensationGrosze ?? 0 },
                invoice.paidOn ?? today,
              );
              return (
                <TableRow key={invoice.id}>
                  <TableCell>{invoice.clientName}</TableCell>
                  <TableCell>{invoice.number}</TableCell>
                  <TableCell className="text-right">{formatAmount(invoice.amountGrosze)}</TableCell>
                  <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                  <TableCell>{invoice.paidOn ? formatDate(invoice.paidOn) : "—"}</TableCell>
                  <TableCell className="text-right">{charges.days}</TableCell>
                  <TableCell className="text-right">{formatAmount(charges.interestGrosze)}</TableCell>
                  <TableCell className="text-right">{formatAmount(charges.compensationGrosze)}</TableCell>
                  <TableCell className="space-x-2 text-right whitespace-nowrap">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Zmień datę wpłaty faktury ${invoice.number}`}
                      onClick={(e) => {
                        openEdit(invoice.id, e.currentTarget);
                      }}
                    >
                      Zmień datę
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={restoringId === invoice.id}
                      aria-label={`Przywróć fakturę ${invoice.number} do otwartych`}
                      onClick={() => void restore(invoice)}
                    >
                      Przywróć do otwartych
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <PaymentDialog
        invoice={editing}
        today={today}
        mode="edit"
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={handleSaved}
        onCloseAutoFocus={() => {
          // The dialog has no DialogTrigger, so Radix cannot restore focus on its own.
          if (openerRef.current?.isConnected) openerRef.current.focus();
        }}
      />
    </div>
  );
}
