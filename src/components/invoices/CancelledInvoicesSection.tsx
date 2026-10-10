import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount, formatDate } from "@/lib/format";
import { invoiceErrorMessage } from "@/lib/invoice-errors";
import type { Invoice } from "@/types";

interface Props {
  invoices: Invoice[];
  onRestored: (invoiceId: string) => void;
}

export function CancelledInvoicesSection({ invoices, onRestored }: Props) {
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  async function restore(invoice: Invoice) {
    if (restoringId) return;
    setError(null);
    setRestoringId(invoice.id);
    try {
      const response = await fetch(`/api/invoices/${invoice.id}/cancellation`, { method: "DELETE" });
      if (response.ok) {
        onRestored(invoice.id);
        headingRef.current?.focus();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      const code = body.error ?? "unknown";
      setError(
        code === "duplicate_number"
          ? "Nie można przywrócić: istnieje już faktura o tym numerze."
          : invoiceErrorMessage(code),
      );
    } catch {
      setError(invoiceErrorMessage("unknown"));
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="space-y-4">
      <h2 ref={headingRef} tabIndex={-1} className="text-foreground text-sm font-semibold outline-none">
        Anulowane faktury <span className="text-muted-foreground font-normal">({invoices.length})</span>
      </h2>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {invoices.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center">Brak anulowanych faktur</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Klient</TableHead>
              <TableHead>Numer</TableHead>
              <TableHead className="text-right">Kwota</TableHead>
              <TableHead>Termin</TableHead>
              <TableHead>Data anulowania</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>{invoice.clientName}</TableCell>
                <TableCell>{invoice.number}</TableCell>
                <TableCell className="text-right">{formatAmount(invoice.amountGrosze)}</TableCell>
                <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                <TableCell>{invoice.cancelledOn ? formatDate(invoice.cancelledOn) : "—"}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
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
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
