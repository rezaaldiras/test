import { MenuHub } from "@/src/components/menu-hub";

export default function AccountingHub() {
  return (
    <MenuHub
      title="Akuntansi"
      subtitle="Buku besar & jurnal"
      items={[
        { title: "Bagan Akun", subtitle: "Chart of Accounts (COA)", icon: "list-outline", route: "/accounts", module: "accounting" },
        { title: "Jurnal Umum", subtitle: "Jurnal otomatis & manual", icon: "create-outline", route: "/journals", module: "accounting" },
        { title: "Buku Besar", subtitle: "Mutasi & saldo per akun", icon: "book-outline", route: "/ledger", module: "reports" },
        { title: "Neraca Saldo", subtitle: "Trial balance (Debit = Kredit)", icon: "scale-outline", route: "/reports/trial-balance", module: "reports" },
        { title: "Periode Akuntansi", subtitle: "Buka / tutup periode pembukuan", icon: "lock-closed-outline", route: "/settings/periods", module: "accounting" },
      ]}
    />
  );
}
