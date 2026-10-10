import { useMemo, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { INACTIVE_PANEL, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientFormDialog } from "@/components/clients/ClientFormDialog";
import { DeactivateClientDialog } from "@/components/clients/DeactivateClientDialog";
import { clientErrorMessage } from "@/lib/client-errors";
import { formatDate } from "@/lib/format";
import type { Client } from "@/types";

interface Props {
  initialClients: Client[];
}

/** Latest deletion first, then by name so equal dates keep a stable order. */
function sortDeactivated(clients: Client[]): Client[] {
  return [...clients].sort(
    (a, b) => (b.deactivatedOn ?? "").localeCompare(a.deactivatedOn ?? "") || a.name.localeCompare(b.name, "pl"),
  );
}

export function ClientsManager({ initialClients }: Props) {
  const [clients, setClients] = useState(initialClients);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [deactivating, setDeactivating] = useState<Client | null>(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const deactivatedRef = useRef(false);

  const sorted = useMemo(
    () => clients.filter((c) => !c.deactivatedOn).sort((a, b) => a.name.localeCompare(b.name, "pl")),
    [clients],
  );
  const deactivated = useMemo(() => sortDeactivated(clients.filter((c) => c.deactivatedOn)), [clients]);

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

  function handleDeactivated(saved: Client) {
    setClients((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    setRestoreError(null);
    deactivatedRef.current = true;
    setDeactivateOpen(false);
  }

  async function restore(client: Client) {
    if (restoringId) return;
    setRestoreError(null);
    setRestoringId(client.id);
    try {
      const response = await fetch(`/api/clients/${client.id}/deactivation`, { method: "DELETE" });
      const body = (await response.json().catch(() => ({}))) as { error?: string; client?: Client };
      if (response.ok && body.client) {
        const restored = body.client;
        setClients((prev) => prev.map((c) => (c.id === restored.id ? restored : c)));
        // The "Dodaj klienta" button is rendered in both the empty and the filled state.
        requestAnimationFrame(() => addButtonRef.current?.focus());
        return;
      }
      setRestoreError(clientErrorMessage(body.error ?? "unknown"));
    } catch {
      setRestoreError(clientErrorMessage("unknown"));
    } finally {
      setRestoringId(null);
    }
  }

  const addButton = (
    <Button
      ref={addButtonRef}
      onClick={(e) => {
        openDialog(null, e.currentTarget);
      }}
    >
      <Plus className="size-4" />
      Dodaj klienta
    </Button>
  );

  return (
    <div className="space-y-4">
      {clients.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-muted-foreground">Nie masz jeszcze klientów</p>
          {addButton}
        </div>
      ) : (
        <>
          <div className="flex justify-end">{addButton}</div>
          <Tabs defaultValue="active">
            <TabsList>
              <TabsTrigger value="active">Aktywni ({sorted.length})</TabsTrigger>
              <TabsTrigger value="inactive">Nieaktywni ({deactivated.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="active" forceMount className="space-y-4">
              {sorted.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nie masz aktywnych klientów</p>
              ) : (
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
                        <TableCell className="space-x-2 text-right whitespace-nowrap">
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              openerRef.current = e.currentTarget;
                              setDeactivating(client);
                              setDeactivateOpen(true);
                            }}
                          >
                            <Trash2 className="size-3.5" />
                            Usuń
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
            <TabsContent value="inactive" forceMount className="space-y-4">
              {restoreError ? (
                <Alert variant="destructive">
                  <AlertDescription>{restoreError}</AlertDescription>
                </Alert>
              ) : null}
              {deactivated.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nie masz usuniętych klientów</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nazwa</TableHead>
                      <TableHead>NIP</TableHead>
                      <TableHead>Data usunięcia</TableHead>
                      <TableHead>
                        <span className="sr-only">Akcje</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deactivated.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell>{client.name}</TableCell>
                        <TableCell>{client.nip ?? "—"}</TableCell>
                        <TableCell>{client.deactivatedOn ? formatDate(client.deactivatedOn) : "—"}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={restoringId === client.id}
                            aria-label={`Przywróć klienta ${client.name}`}
                            onClick={() => void restore(client)}
                          >
                            Przywróć
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
      <DeactivateClientDialog
        client={deactivating}
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        onDeactivated={handleDeactivated}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (deactivatedRef.current) {
            // The row is gone, so focus moves to the "Dodaj klienta" button.
            deactivatedRef.current = false;
            addButtonRef.current?.focus();
          } else if (openerRef.current?.isConnected && !openerRef.current.closest(INACTIVE_PANEL)) {
            openerRef.current.focus();
          }
        }}
      />
      <ClientFormDialog
        open={open}
        onOpenChange={setOpen}
        client={editing}
        onSaved={handleSaved}
        onCloseAutoFocus={() => {
          // The dialog has no DialogTrigger, so Radix cannot restore focus on its own.
          const opener = openerRef.current;
          if (opener?.isConnected && !opener.closest(INACTIVE_PANEL)) opener.focus();
          else addButtonRef.current?.focus();
        }}
      />
    </div>
  );
}
