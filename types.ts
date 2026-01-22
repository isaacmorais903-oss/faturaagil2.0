export interface InvoiceItem {
  id: string;
  date: string;
  cargoType: string;
  driver: string;
  plate: string;
  cargoValue: number;
  icms: number;
  insuranceValue: number;
  totalExpense: number;
}

export interface SavedLists {
  clients: string[];
  cargoTypes: string[];
  drivers: string[];
  plates: string[];
}

export interface CompanyInfo {
  name: string;
  address: string;
  cnpj: string;
  logoUrl: string; // Using a placeholder or base64
}

// Gemini specific types
export interface SmartParseResult {
  date?: string;
  cargoType?: string;
  driver?: string;
  plate?: string;
  cargoValue?: number;
  icms?: number;
  insuranceValue?: number;
  totalExpense?: number;
}