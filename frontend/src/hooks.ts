// Arunika — hooks data bersama (React Query).
import { useQuery } from "@tanstack/react-query";

import { api, qs } from "@/src/api";
import { useAuth } from "@/src/auth-context";

export type Unit = { id: string; name: string; description?: string; is_active: boolean };
export type Account = {
  id: string; code: string; name: string; type: string; subtype: string;
  normal_balance: string; is_active: boolean; balance: number;
};
export type CashAccount = {
  id: string; name: string; type: string; account_code: string;
  bank_name?: string; account_number?: string; balance: number; is_active: boolean;
};
export type Party = { id: string; code: string; name: string; phone?: string; is_active: boolean };

export function useUnits() {
  return useQuery({
    queryKey: ["units"],
    queryFn: () => api<{ items: Unit[] }>("/business-units").then((r) => r.items),
  });
}

export function useAccounts(params: { q?: string; type?: string } = {}) {
  return useQuery({
    queryKey: ["accounts", params],
    queryFn: () => api<{ items: Account[] }>(`/accounts${qs(params)}`).then((r) => r.items),
  });
}

export function useCashAccounts() {
  return useQuery({
    queryKey: ["cash-accounts"],
    queryFn: () => api<{ items: CashAccount[] }>("/cash-accounts").then((r) => r.items),
  });
}

export function useCustomers(q = "") {
  return useQuery({
    queryKey: ["customers", q],
    queryFn: () => api<{ items: Party[] }>(`/customers${qs({ q })}`).then((r) => r.items),
  });
}

export function useSuppliers(q = "") {
  return useQuery({
    queryKey: ["suppliers", q],
    queryFn: () => api<{ items: Party[] }>(`/suppliers${qs({ q })}`).then((r) => r.items),
  });
}

export function useUnitParam() {
  const { activeUnit } = useAuth();
  return activeUnit || undefined;
}
