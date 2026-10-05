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
