import { useMemo, useRef, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClientFormDialog } from "@/components/clients/ClientFormDialog";
import type { Client } from "@/types";

interface Props {
  initialClients: Client[];
}

export function ClientsManager({ initialClients }: Props) {
  const [clients, setClients] = useState(initialClients);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const sorted = useMemo(() => [...clients].sort((a, b) => a.name.localeCompare(b.name, "pl")), [clients]);

  function openDialog(client: Client | null, opener: HTMLElement) {
    openerRef.current = opener;
    setEditing(client);
    setOpen(true);
  }

  function handleSaved(saved: Client) {
    setClients((prev) =>
      prev.some((c) => c.id === saved.id) ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved],
    );
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-muted-foreground">Nie masz jeszcze klientów</p>
          <Button
            onClick={(e) => {
              openDialog(null, e.currentTarget);
            }}
          >
            <Plus className="size-4" />
            Dodaj klienta
          </Button>
        </div>
      ) : (
        <>
          <div className="flex justify-end">
            <Button
              onClick={(e) => {
                openDialog(null, e.currentTarget);
              }}
            >
              <Plus className="size-4" />
              Dodaj klienta
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwa</TableHead>
                <TableHead>NIP</TableHead>
                <TableHead>Rekompensata</TableHead>
                <TableHead>
                  <span className="sr-only">Akcje</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>{client.name}</TableCell>
                  <TableCell>{client.nip ?? "—"}</TableCell>
                  <TableCell>{client.chargeCompensation ? "Tak" : "Nie"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        openDialog(client, e.currentTarget);
                      }}
                    >
                      <Pencil className="size-3.5" />
                      Edytuj
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      <ClientFormDialog
        open={open}
        onOpenChange={setOpen}
        client={editing}
        onSaved={handleSaved}
        onCloseAutoFocus={() => {
          // The dialog has no DialogTrigger, so Radix cannot restore focus on its own.
          if (openerRef.current?.isConnected) openerRef.current.focus();
        }}
      />
    </div>
  );
}
