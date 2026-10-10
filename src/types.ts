import type { EscalationThresholds } from "@/lib/escalation";

export interface Client {
  id: string;
  name: string;
  nip: string | null;
  chargeCompensation: boolean;
  /** YYYY-MM-DD; null = klient aktywny */
  deactivatedOn: string | null;
  createdAt: string;
}

export interface ClientInput {
  name: string;
  nip: string | null;
  chargeCompensation: boolean;
}

export interface Invoice {
  id: string;
  clientId: string;
  clientName: string;
  clientChargesCompensation: boolean;
  number: string;
  amountGrosze: number;
  /** YYYY-MM-DD */
  dueDate: string;
  /** YYYY-MM-DD; null = faktura otwarta */
  paidOn: string | null;
  /** Annual rate (bp) frozen when the invoice was marked paid; null = invoice open. */
  paidRateBp: number | null;
  /** Compensation of the invoice's tier (grosze, 0 when the client doesn't charge it) frozen when marked paid; null = invoice open. */
  paidCompensationGrosze: number | null;
  /** YYYY-MM-DD; null = faktura nieanulowana */
  cancelledOn: string | null;
  /** YYYY-MM-DD; null = eskalacja niewstrzymana */
  pausedOn: string | null;
  createdAt: string;
}

export interface InvoiceInput {
  clientId: string;
  number: string;
  amountGrosze: number;
  /** YYYY-MM-DD */
  dueDate: string;
}

export interface PaymentInput {
  /** YYYY-MM-DD */
  paidOn: string;
}

/** User's escalation rule. All values are integers (days, basis points, grosze). */
export interface EscalationSettings {
  /** Days overdue that start stages 1–4, strictly increasing. */
  thresholds: EscalationThresholds;
  /** Annual interest rate in basis points (13,75% = 1375). */
  annualRateBp: number;
  /** Compensation for invoice amount ≤ 5 000 zł, > 5 000 zł and < 50 000 zł, ≥ 50 000 zł. */
  compensationGrosze: readonly [number, number, number];
}

/** Settings form/API input as typed text, parsed by `settingsInputSchema`. */
export interface EscalationSettingsInput {
  threshold1: string;
  threshold2: string;
  threshold3: string;
  threshold4: string;
  /** Percent, e.g. "13,75" */
  annualRate: string;
  /** Amounts in zł, e.g. "297,50" */
  compensation1: string;
  compensation2: string;
  compensation3: string;
}

/** Sender data inserted into reminders. NIP is 10 digits, bank account 26 digits without `PL`; null means missing. */
export interface SenderProfile {
  companyName: string | null;
  nip: string | null;
  address: string | null;
  bankAccount: string | null;
}

/** Sender profile form/API input as typed text, parsed by `senderProfileInputSchema`. */
export interface SenderProfileInput {
  companyName: string;
  nip: string;
  address: string;
  bankAccount: string;
}
