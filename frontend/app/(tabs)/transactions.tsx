import { MenuHub } from "@/src/components/menu-hub";

export default function TransactionsHub() {
  return (
    <MenuHub
      title="Transaksi"
      subtitle="Penjualan, pembelian, kas & bank"
      items={[
        { title: "Penjualan", subtitle: "Faktur, tunai, kredit & penerimaan piutang", icon: "cart-outline", route: "/sales", module: "sales" },
        { title: "Pembelian", subtitle: "Faktur pemasok & pembayaran utang", icon: "bag-handle-outline", route: "/purchases", module: "purchases" },
        { title: "Kas & Bank", subtitle: "Kas masuk/keluar, transfer, mutasi", icon: "wallet-outline", route: "/cash", module: "cash" },
        { title: "Pelanggan", subtitle: "Data pelanggan BUMKam", icon: "people-outline", route: "/customers", module: "sales" },
        { title: "Pemasok", subtitle: "Data pemasok / vendor", icon: "business-outline", route: "/suppliers", module: "purchases" },
      ]}
    />
  );
}
