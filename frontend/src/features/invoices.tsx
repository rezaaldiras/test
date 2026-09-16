// Arunika — Fitur Faktur bersama (Penjualan & Pembelian).
import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Icon from "@/src/components/icon";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, EmptyState, ErrorState, Loading, StatusPill } from "@/src/components/ui";
import { DateField, Field, RupiahField, Segmented, Select, Sheet, TextField } from "@/src/components/form";
import { useToast } from "@/src/components/toast";
import { api, qs } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useCashAccounts, useCustomers, useSuppliers, useUnits, useUnitParam } from "@/src/hooks";
import { fmtDate, fmtRp, todayISO } from "@/src/format";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Kind = "sales" | "purchase";
const cfg = {
  sales: { path: "/sales-invoices", module: "sales", title: "Penjualan", party: "Pelanggan", partyName: "customer_name", cta: "Faktur Penjualan" },
  purchase: { path: "/purchase-invoices", module: "purchases", title: "Pembelian", party: "Pemasok", partyName: "supplier_name", cta: "Faktur Pembelian" },
};

export function InvoiceListScreen({ kind }: { kind: Kind }) {
  const c = cfg[kind];
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { can, activeUnit } = useAuth();
  const unit = useUnitParam();
  const [status, setStatus] = useState("ALL");
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: [kind, "list", status, q, activeUnit],
    queryFn: () => api<any>(`${c.path}${qs({ status, q, unit_id: unit, limit: 50 })}`),
  });

  const items = data?.items || [];
  const canWrite = can(c.module, "write");

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={c.title} back subtitle={`${data?.total ?? 0} faktur`} />
      <View style={styles.filters}>
        <View style={styles.searchWrap}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextField value={q} onChangeText={setQ} placeholder={`Cari no. faktur / ${c.party.toLowerCase()}`} testID="invoice-search" />
        </View>
        <Segmented value={status} onChange={setStatus} testID="invoice-status-filter"
          options={[{ value: "ALL", label: "Semua" }, { value: "UNPAID", label: "Belum" }, { value: "PARTIAL", label: "Sebagian" }, { value: "PAID", label: "Lunas" }]} />
      </View>

      {isLoading ? <Loading /> : isError ? (
        <ErrorState message={(error as Error)?.message} onRetry={refetch} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96, gap: spacing.md }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <EmptyState icon="receipt-outline" title="Belum ada faktur"
              subtitle={canWrite ? `Ketuk tombol + untuk membuat ${c.cta.toLowerCase()}.` : "Belum ada data."} testID="invoice-empty" />
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`${c.path === "/sales-invoices" ? "/sales" : "/purchases"}/${item.id}` as any)} testID={`invoice-${item.number}`}>
              <Card>
                <View style={styles.rowTop}>
                  <Text style={styles.number}>{item.number}</Text>
                  <StatusPill status={item.status} />
                </View>
                <Text style={styles.party} numberOfLines={1}>{item[c.partyName] || "-"}</Text>
                <View style={styles.rowBottom}>
                  <Text style={styles.date}>{fmtDate(item.date)} · {item.payment_type === "CASH" ? "Tunai" : "Kredit"}</Text>
                  <Text style={styles.total}>{fmtRp(item.total)}</Text>
                </View>
                {item.status === "PARTIAL" ? (
                  <Text style={styles.paid}>Dibayar {fmtRp(item.paid_amount)} · Sisa {fmtRp(item.total - item.paid_amount)}</Text>
                ) : null}
              </Card>
            </Pressable>
          )}
        />
      )}

      {canWrite ? (
        <Pressable style={[styles.fab, { bottom: insets.bottom + spacing.lg }]} onPress={() => setShowForm(true)} testID="invoice-add">
          <Icon name="add" size={28} color={colors.onBrandPrimary} />
        </Pressable>
      ) : null}

      <InvoiceForm kind={kind} visible={showForm} onClose={() => setShowForm(false)} />
    </View>
  );
}

type Line = { description: string; qty: string; price: number };

function InvoiceForm({ kind, visible, onClose }: { kind: Kind; visible: boolean; onClose: () => void }) {
  const c = cfg[kind];
  const { colors } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: units } = useUnits();
  const { data: cashAccounts } = useCashAccounts();
  const customers = useCustomers();
  const suppliers = useSuppliers();
  const parties = kind === "sales" ? customers.data : suppliers.data;

  const [date, setDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState("");
  const [partyId, setPartyId] = useState("");
  const [paymentType, setPaymentType] = useState("CASH");
  const [cashId, setCashId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [lines, setLines] = useState<Line[]>([{ description: "", qty: "1", price: 0 }]);
  const [notes, setNotes] = useState("");

  const reset = () => {
    setDate(todayISO()); setDueDate(""); setPartyId(""); setPaymentType("CASH");
    setCashId(""); setUnitId(""); setLines([{ description: "", qty: "1", price: 0 }]); setNotes("");
  };

  const total = useMemo(() => lines.reduce((s, l) => s + (parseFloat(l.qty || "0") * (l.price || 0)), 0), [lines]);

  const mutation = useMutation({
    mutationFn: (body: any) => api(c.path, { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [kind] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.show(`${c.cta} berhasil dibuat & jurnal otomatis dibuat.`, "success");
      reset(); onClose();
    },
    onError: (e: any) => toast.show(e?.message || "Gagal menyimpan faktur.", "error"),
  });

  const submit = () => {
    if (!partyId) return toast.show(`Pilih ${c.party.toLowerCase()} terlebih dahulu.`, "error");
    if (paymentType === "CASH" && !cashId) return toast.show("Pilih akun kas/bank untuk transaksi tunai.", "error");
    const validLines = lines.filter((l) => parseFloat(l.qty || "0") > 0 && l.price > 0);
    if (!validLines.length) return toast.show("Tambahkan minimal satu baris dengan jumlah & harga.", "error");
    mutation.mutate({
      date, due_date: dueDate || undefined,
      [kind === "sales" ? "customer_id" : "supplier_id"]: partyId,
      payment_type: paymentType, cash_account_id: cashId || undefined, unit_id: unitId || undefined,
      notes: notes || undefined,
      lines: validLines.map((l) => ({ description: l.description || "-", qty: parseFloat(l.qty), price: l.price })),
    });
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={c.cta} testID="invoice-form"
      footer={<Button label={`Simpan · ${fmtRp(total)}`} icon="checkmark" onPress={submit} loading={mutation.isPending} testID="invoice-submit" />}>
      <Field label={c.party} required>
        <Select value={partyId} onChange={setPartyId} searchable testID="invoice-party"
          placeholder={`Pilih ${c.party.toLowerCase()}`}
          options={(parties || []).map((p) => ({ value: p.id, label: p.name, sublabel: p.code }))} />
      </Field>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}><Field label="Tanggal" required><DateField value={date} onChange={setDate} testID="invoice-date" /></Field></View>
        <View style={{ flex: 1 }}><Field label="Pembayaran"><Segmented value={paymentType} onChange={setPaymentType}
          options={[{ value: "CASH", label: "Tunai" }, { value: "CREDIT", label: "Kredit" }]} testID="invoice-payment-type" /></Field></View>
      </View>
      {paymentType === "CASH" ? (
        <Field label="Kas / Bank" required>
          <Select value={cashId} onChange={setCashId} placeholder="Pilih kas/bank" testID="invoice-cash"
            options={(cashAccounts || []).map((a) => ({ value: a.id, label: a.name, sublabel: a.type === "BANK" ? "Bank" : "Kas" }))} />
        </Field>
      ) : (
        <Field label="Jatuh Tempo" hint="Kosongkan untuk 30 hari dari tanggal faktur."><DateField value={dueDate} onChange={setDueDate} testID="invoice-due" /></Field>
      )}
      {units && units.length ? (
        <Field label="Unit Usaha">
          <Select value={unitId} onChange={setUnitId} placeholder="Opsional — pilih unit"
            options={[{ value: "", label: "Tanpa unit" }, ...units.map((u) => ({ value: u.id, label: u.name }))]} testID="invoice-unit" />
        </Field>
      ) : null}

      <Text style={styles.linesTitle}>Rincian Barang / Jasa</Text>
      {lines.map((l, i) => (
        <View key={i} style={styles.lineCard}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.lineNo}>Baris {i + 1}</Text>
            {lines.length > 1 ? (
              <Pressable onPress={() => setLines(lines.filter((_, x) => x !== i))} hitSlop={8} testID={`line-remove-${i}`}>
                <Icon name="trash-outline" size={18} color={colors.error} />
              </Pressable>
            ) : null}
          </View>
          <TextField value={l.description} onChangeText={(t) => setLines(lines.map((x, xi) => xi === i ? { ...x, description: t } : x))}
            placeholder="Nama barang / jasa" testID={`line-desc-${i}`} />
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <View style={{ width: 90 }}>
              <TextField value={l.qty} onChangeText={(t) => setLines(lines.map((x, xi) => xi === i ? { ...x, qty: t.replace(/[^\d.]/g, "") } : x))}
                placeholder="Qty" keyboardType="decimal-pad" testID={`line-qty-${i}`} />
            </View>
            <View style={{ flex: 1 }}>
              <RupiahField value={l.price} onChangeValue={(n) => setLines(lines.map((x, xi) => xi === i ? { ...x, price: n } : x))} testID={`line-price-${i}`} />
            </View>
          </View>
          <Text style={styles.lineSubtotal}>Subtotal: {fmtRp(parseFloat(l.qty || "0") * (l.price || 0))}</Text>
        </View>
      ))}
      <Button label="Tambah Baris" icon="add" variant="outline" small onPress={() => setLines([...lines, { description: "", qty: "1", price: 0 }])} style={{ marginTop: spacing.sm }} testID="line-add" />
      <Field label="Catatan (opsional)"><TextField value={notes} onChangeText={setNotes} placeholder="Keterangan tambahan" testID="invoice-notes" /></Field>
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  filters: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingLeft: spacing.md, borderWidth: 1, borderColor: colors.border },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  number: { fontFamily: fonts.mono, fontSize: 13, color: colors.brandPrimary, fontWeight: "700" },
  party: { fontSize: 16, color: colors.onSurface, fontWeight: "700", marginTop: 4 },
  rowBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  date: { fontSize: 13, color: colors.muted },
  total: { fontSize: 16, color: colors.onSurface, fontWeight: "800", fontFamily: fonts.display },
  paid: { fontSize: 12, color: colors.warning, marginTop: 4 },
  fab: { position: "absolute", right: spacing.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  linesTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface, marginTop: spacing.sm, marginBottom: spacing.sm },
  lineCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  lineNo: { fontSize: 12, color: colors.muted, fontWeight: "700", marginBottom: 6 },
  lineSubtotal: { fontSize: 12, color: colors.onSurfaceSecondary, fontWeight: "600", marginTop: 6, textAlign: "right" },
}));
