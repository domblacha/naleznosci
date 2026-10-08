export interface Client {
  id: string;
  name: string;
  nip: string | null;
  chargeCompensation: boolean;
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
