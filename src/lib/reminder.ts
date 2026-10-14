import { chargesAsOf, DEFAULT_CHARGE_SETTINGS, type ChargeSettings } from "@/lib/charges";
import { DEFAULT_THRESHOLDS, groupInvoices, type EscalationThresholds } from "@/lib/escalation";
import { formatAmount, formatDate } from "@/lib/format";
import { bankAccountClause, EMPTY_SENDER_PROFILE, senderBlock } from "@/lib/sender-profile";
import { PAYMENT_DEADLINE_DAYS, REMINDER_TEMPLATES, type ReminderStage } from "@/lib/reminder-templates";
import type { Invoice, SenderProfile } from "@/types";

export type { ReminderStage };

export interface ReminderItem {
  number: string;
  amountGrosze: number;
  dueDate: string;
  daysOverdue: number;
  interestGrosze: number;
  compensationGrosze: number;
}

export interface ClientReminder {
  clientId: string;
  clientName: string;
  chargesCompensation: boolean;
  stage: ReminderStage;
  items: ReminderItem[];
  principalGrosze: number;
  interestGrosze: number;
  compensationGrosze: number;
  totalGrosze: number;
}

const STAGE_BY_GROUP = { stage_1: 1, stage_2: 2, stage_3: 3, stage_4: 4 } as const;

export function buildClientReminders(
  invoices: Invoice[],
  today: string,
  thresholds: EscalationThresholds = DEFAULT_THRESHOLDS,
  settings: ChargeSettings = DEFAULT_CHARGE_SETTINGS,
): ClientReminder[] {
  const byClient = new Map<string, ClientReminder>();

  // groupInvoices sortuje po terminie, potem po numerze, więc pozycje trafiają w tej kolejności.
  for (const { group, items } of groupInvoices(invoices, today, thresholds)) {
    if (!(group in STAGE_BY_GROUP)) continue;
    const stage = STAGE_BY_GROUP[group as keyof typeof STAGE_BY_GROUP];
    for (const invoice of items) {
      const { interestGrosze: interest, compensationGrosze: compensation } = chargesAsOf(invoice, today, settings);
      const reminder = byClient.get(invoice.clientId) ?? {
        clientId: invoice.clientId,
        clientName: invoice.clientName,
        chargesCompensation: invoice.clientChargesCompensation,
        stage,
        items: [],
        principalGrosze: 0,
        interestGrosze: 0,
        compensationGrosze: 0,
        totalGrosze: 0,
      };
      reminder.stage = Math.max(reminder.stage, stage) as ReminderStage;
      reminder.items.push({
        number: invoice.number,
        amountGrosze: invoice.amountGrosze,
        dueDate: invoice.dueDate,
        daysOverdue: invoice.daysOverdue,
        interestGrosze: interest,
        compensationGrosze: compensation,
      });
      reminder.principalGrosze += invoice.amountGrosze;
      reminder.interestGrosze += interest;
      reminder.compensationGrosze += compensation;
      reminder.totalGrosze += invoice.amountGrosze + interest + compensation;
      byClient.set(invoice.clientId, reminder);
    }
  }

  // groupInvoices zwraca grupy od najwyższego etapu, więc kolejność pozycji w kliencie
  // musi być przywrócona do terminu i numeru.
  const result = [...byClient.values()];
  for (const reminder of result) {
    reminder.items.sort(
      (a, b) => a.dueDate.localeCompare(b.dueDate) || a.number.localeCompare(b.number, "pl", { numeric: true }),
    );
  }
  return result.sort((a, b) => b.stage - a.stage || a.clientName.localeCompare(b.clientName, "pl"));
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${mm}-${dd}`;
}

function formatItem(reminder: ClientReminder, item: ReminderItem, index: number): string {
  const unit = item.daysOverdue === 1 ? "dzień" : "dni";
  let line =
    `${index + 1}. Faktura ${item.number} — kwota ${formatAmount(item.amountGrosze)}, ` +
    `termin płatności ${formatDate(item.dueDate)}, ${item.daysOverdue} ${unit} po terminie, ` +
    `odsetki ${formatAmount(item.interestGrosze)}`;
  if (reminder.chargesCompensation) line += `, rekompensata ${formatAmount(item.compensationGrosze)}`;
  return line;
}

function formatSummary(reminder: ClientReminder): string {
  const lines = [
    `Należność główna: ${formatAmount(reminder.principalGrosze)}`,
    `Odsetki: ${formatAmount(reminder.interestGrosze)}`,
  ];
  if (reminder.chargesCompensation) lines.push(`Rekompensata: ${formatAmount(reminder.compensationGrosze)}`);
  lines.push(`Razem do zapłaty: ${formatAmount(reminder.totalGrosze)}`);
  return lines.join("\n");
}

export function renderReminder(
  reminder: ClientReminder,
  today: string,
  sender: SenderProfile = EMPTY_SENDER_PROFILE,
  templates: Record<ReminderStage, string> = REMINDER_TEMPLATES,
): string {
  const fields: Record<string, string> = {
    data: formatDate(today),
    klient: reminder.clientName,
    pozycje: reminder.items.map((item, i) => formatItem(reminder, item, i)).join("\n"),
    podsumowanie: formatSummary(reminder),
    termin_zapłaty: formatDate(addDays(today, PAYMENT_DEADLINE_DAYS)),
    nadawca: senderBlock(sender),
    konto: bankAccountClause(sender),
  };
  // Jedno przejście: wartość pola (np. nazwa klienta z "{data}") nie jest podstawiana ponownie.
  // trimEnd: pusty blok nadawcy nie zostawia pustej linii na końcu.
  return templates[reminder.stage]
    .replace(/\{([^{}]+)\}/gu, (match, name: string) => (Object.hasOwn(fields, name) ? fields[name] : match))
    .trimEnd();
}
