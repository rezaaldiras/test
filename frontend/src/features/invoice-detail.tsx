// Arunika — Detail Faktur (Penjualan/Pembelian): rincian, jurnal, pembayaran, void.
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ScreenHeader, VoidSheet } from "@/src/components/header";
import { Button, Card, Divider, ErrorState, KeyValue, Loading, StatusPill } from "@/src/components/ui";
import { Field, RupiahField, DateField, Select, Sheet } from "@/src/components/form";
import { useToast } from "@/src/components/toast";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useCashAccounts } from "@/src/hooks";
import { fmtDate, fmtRp, todayISO } from "@/src/format";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";

type Kind = "sales" | "purchase";
const cfg = {
  sales: { path: "/sales-invoices", module: "sales", title: "Faktur Penjualan", party: "Pelanggan", partyName: "customer_name", payType: "RECEIVE", payLabel: "Terima Pembayaran" },
  purchase: { path: "/purchase-invoices", module: "purchases", title: "Faktur Pembelian", party: "Pemasok", partyName: "supplier_name", payType: "PAY", payLabel: "Bayar Utang" },
};

export function InvoiceDetailScreen({ kind }: { kind: Kind }) {
  const c = cfg[kind];
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useAuth();
  const { data: cashAccounts } = useCashAccounts();
  const [showPay, setShowPay] = useState(false);
  const [showVoid, setShowVoid] = useState(false);
  const [payDate, setPayDate] = useState(todayISO());
  const [payAmount, setPayAmount] = useState(0);
  const [payCash, setPayCash] = useState("");

  const { data: inv, isLoading, isError, error, refetch } = useQuery({
    queryKey: [kind, "detail", id],
    queryFn: () => api<any>(`${c.path}/${id}`),
  });

  const canWrite = can(c.module, "write");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [kind] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["cash-accounts"] });
    refetch();
  };

  const payMutation = useMutation({
    mutationFn: (body: any) => api("/payments", { method: "POST", body }),
    onSuccess: () => { toast.show("Pembayaran dicatat & jurnal dibuat.", "success"); setShowPay(false); setPayAmount(0); setPayCash(""); invalidate(); },
    onError: (e: any) => toast.show(e?.message || "Gagal mencatat pembayaran.", "error"),
  });

  const voidInvoice = async (reason: string) => {
    try {
      await api(`${c.path}/${id}/void`, { method: "POST", body: { reason } });
      toast.show("Faktur dibatalkan dengan jurnal penyeimbang.", "success");
      invalidate();
    } catch (e: any) {
      toast.show(e?.message || "Gagal membatalkan.", "error");
      throw e;
    }
  };

  const voidPayment = async (paymentId: string, reason: string) => {
    try {
      await api(`/payments/${paymentId}/void`, { method: "POST", body: { reason } });
      toast.show("Pembayaran dibatalkan.", "success");
      invalidate();
    } catch (e: any) {
      toast.show(e?.message || "Gagal membatalkan pembayaran.", "error");
    }
  };

  if (isLoading) return <View style={{ flex: 1, backgroundColor: colors.surface }}><ScreenHeader title={c.title} back /><Loading /></View>;
  if (isError || !inv) return <View style={{ flex: 1, backgroundColor: colors.surface }}><ScreenHeader title={c.title} back /><ErrorState message={(error as Error)?.message || "Tidak ditemukan"} onRetry={refetch} /></View>;

  const remaining = inv.total - (inv.paid_amount || 0);
  const canPay = canWrite && inv.status !== "VOID" && remaining > 0 && can("cash", "write");

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={inv.number} back subtitle={c.title} right={<StatusPill status={inv.status} />} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }}>
        <Card>
          <Text style={styles.party}>{inv[c.partyName]}</Text>
          <Divider />
          <KeyValue label="Tanggal" value={fmtDate(inv.date, true)} />
          <KeyValue label="Jatuh Tempo" value={fmtDate(inv.due_date, true)} />
          <KeyValue label="Pembayaran" value={inv.payment_type === "CASH" ? "Tunai" : "Kredit"} />
          {inv.cash_account_name ? <KeyValue label="Kas/Bank" value={inv.cash_account_name} /> : null}
          <KeyValue label="No. Jurnal" value={inv.journal_number || "-"} />
          {inv.notes ? <KeyValue label="Catatan" value={inv.notes} /> : null}
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Rincian</Text>
          {inv.lines.map((l: any, i: number) => (
            <View key={i} style={styles.lineRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineDesc}>{l.description}</Text>
                <Text style={styles.lineMeta}>{l.qty} × {fmtRp(l.price)} · {l.account_name}</Text>
              </View>
              <Text style={styles.lineAmount}>{fmtRp(l.amount)}</Text>
            </View>
          ))}
          <Divider />
          <KeyValue label="Subtotal" value={fmtRp(inv.subtotal)} />
          {inv.tax_amount > 0 ? <KeyValue label={`Pajak (${inv.tax_rate}%)`} value={fmtRp(inv.tax_amount)} /> : null}
          <KeyValue label="Total" value={fmtRp(inv.total)} strong />
          <KeyValue label="Dibayar" value={fmtRp(inv.paid_amount || 0)} valueColor={colors.success} />
          <KeyValue label="Sisa" value={fmtRp(remaining)} valueColor={remaining > 0 ? colors.error : colors.muted} strong />
        </Card>

        {inv.payments?.length ? (
          <Card>
            <Text style={styles.sectionTitle}>Riwayat Pembayaran</Text>
            {inv.payments.map((p: any) => (
              <View key={p.id} style={styles.payRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineDesc}>{p.number} · {fmtRp(p.amount)}</Text>
                  <Text style={styles.lineMeta}>{fmtDate(p.date)} · {p.cash_account_name}</Text>
                </View>
                {p.status === "VOID" ? <StatusPill status="VOID" size="sm" /> : (
                  canWrite ? <Button label="Batal" variant="ghost" small onPress={() => voidPayment(p.id, "Dibatalkan dari detail faktur")} testID={`void-pay-${p.number}`} /> : null
                )}
              </View>
            ))}
          </Card>
        ) : null}

        {inv.status !== "VOID" ? (
          <View style={{ gap: spacing.sm }}>
            {canPay ? <Button label={c.payLabel} icon="cash-outline" onPress={() => { setPayAmount(remaining); setShowPay(true); }} testID="invoice-pay" /> : null}
            {canWrite && (inv.paid_amount || 0) === 0 ? (
              <Button label="Batalkan Faktur" icon="close-circle-outline" variant="outline" onPress={() => setShowVoid(true)} testID="invoice-void" />
            ) : null}
          </View>
        ) : (
          <Card><Text style={{ color: colors.muted }}>Faktur ini telah dibatalkan. Alasan: {inv.void_reason || "-"}</Text></Card>
        )}
      </ScrollView>

      <Sheet visible={showPay} onClose={() => setShowPay(false)} title={c.payLabel}
        footer={<Button label="Simpan Pembayaran" icon="checkmark" loading={payMutation.isPending}
          onPress={() => {
            if (!payCash) return toast.show("Pilih akun kas/bank.", "error");
            if (payAmount <= 0) return toast.show("Nominal harus lebih dari nol.", "error");
            payMutation.mutate({ type: c.payType, invoice_id: id, date: payDate, cash_account_id: payCash, amount: payAmount });
          }} testID="payment-submit" />}>
        <Field label="Tanggal" required><DateField value={payDate} onChange={setPayDate} testID="payment-date" /></Field>
        <Field label="Kas / Bank" required>
          <Select value={payCash} onChange={setPayCash} placeholder="Pilih kas/bank" testID="payment-cash"
            options={(cashAccounts || []).map((a) => ({ value: a.id, label: a.name, sublabel: a.type === "BANK" ? "Bank" : "Kas" }))} />
        </Field>
        <Field label="Nominal" required hint={`Sisa tagihan: ${fmtRp(remaining)}`}>
          <RupiahField value={payAmount} onChangeValue={setPayAmount} testID="payment-amount" />
        </Field>
      </Sheet>

      <VoidSheet visible={showVoid} onClose={() => setShowVoid(false)} onConfirm={voidInvoice}
        title="Batalkan Faktur" message="Faktur yang dibatalkan akan menghasilkan jurnal penyeimbang. Data asli tetap tersimpan untuk audit." />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  party: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface, fontWeight: "700" },
  sectionTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.onSurface, fontWeight: "700", marginBottom: spacing.sm },
  lineRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.divider },
  lineDesc: { fontSize: 14, color: colors.onSurface, fontWeight: "600" },
  lineMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  lineAmount: { fontSize: 14, color: colors.onSurface, fontWeight: "700" },
  payRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.divider },
}));
