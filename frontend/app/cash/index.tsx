// Arunika — Kas & Bank: daftar akun, transaksi, kas masuk/keluar, transfer.
import { useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Icon from "@/src/components/icon";
import { ScreenHeader, VoidSheet } from "@/src/components/header";
import { Button, Card, EmptyState, Loading, StatusPill } from "@/src/components/ui";
import { DateField, Field, RupiahField, Segmented, Select, Sheet, TextField } from "@/src/components/form";
import { useToast } from "@/src/components/toast";
import { api, qs } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useAccounts, useCashAccounts } from "@/src/hooks";
import { fmtDate, fmtRp, todayISO } from "@/src/format";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type FormMode = null | "IN" | "OUT" | "TRANSFER" | "ACCOUNT";

export default function CashScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: accounts } = useCashAccounts();
  const [mode, setMode] = useState<FormMode>(null);
  const [voidId, setVoidId] = useState<string | null>(null);
  const canWrite = can("cash", "write");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["cash-txns"],
    queryFn: () => api<any>(`/cash-transactions${qs({ limit: 50 })}`),
  });

  const doVoid = async (reason: string) => {
    if (!voidId) return;
    try {
      await api(`/cash-transactions/${voidId}/void`, { method: "POST", body: { reason } });
      toast.show("Transaksi kas dibatalkan.", "success");
      qc.invalidateQueries({ queryKey: ["cash-txns"] });
      qc.invalidateQueries({ queryKey: ["cash-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) { toast.show(e?.message || "Gagal.", "error"); throw e; }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Kas & Bank" back />
      {isLoading ? <Loading /> : (
        <FlatList
          data={data?.items || []}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96 }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListHeaderComponent={
            <View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.md }}>
                {(accounts || []).map((a) => (
                  <View key={a.id} style={styles.acctCard}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Icon name={a.type === "BANK" ? "card-outline" : "cash-outline"} size={16} color={colors.onBrandPrimary} />
                      <Text style={styles.acctName} numberOfLines={1}>{a.name}</Text>
                    </View>
                    <Text style={styles.acctBalance}>{fmtRp(a.balance)}</Text>
                    <Text style={styles.acctMeta}>{a.type === "BANK" ? (a.bank_name || "Bank") : "Kas"}</Text>
                  </View>
                ))}
                {canWrite ? (
                  <Pressable style={styles.addAcct} onPress={() => setMode("ACCOUNT")} testID="add-cash-account">
                    <Icon name="add" size={22} color={colors.brandPrimary} />
                    <Text style={{ color: colors.brandPrimary, fontWeight: "700", fontSize: 12 }}>Tambah Akun</Text>
                  </Pressable>
                ) : null}
              </ScrollView>

              {canWrite ? (
                <View style={styles.quickRow}>
                  <QuickBtn icon="arrow-down-outline" label="Kas Masuk" onPress={() => setMode("IN")} testID="quick-in" />
                  <QuickBtn icon="arrow-up-outline" label="Kas Keluar" onPress={() => setMode("OUT")} testID="quick-out" />
                  <QuickBtn icon="swap-horizontal-outline" label="Transfer" onPress={() => setMode("TRANSFER")} testID="quick-transfer" />
                </View>
              ) : null}
              <Text style={styles.histTitle}>Mutasi Terakhir</Text>
            </View>
          }
          ListEmptyComponent={<EmptyState icon="wallet-outline" title="Belum ada transaksi kas" subtitle="Catat kas masuk, keluar, atau transfer." />}
          renderItem={({ item }) => {
            const isIn = item.kind === "IN" || item.kind === "TRANSFER";
            return (
              <Card style={{ marginBottom: spacing.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <View style={[styles.txnIcon, { backgroundColor: (item.kind === "OUT" ? colors.error : colors.success) + "1A" }]}>
                    <Icon name={item.kind === "TRANSFER" ? "swap-horizontal" : item.kind === "IN" ? "arrow-down" : "arrow-up"}
                      size={18} color={item.kind === "OUT" ? colors.error : colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txnDesc} numberOfLines={1}>{item.description}</Text>
                    <Text style={styles.txnMeta}>{item.number} · {fmtDate(item.date)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: item.kind === "OUT" ? colors.error : colors.success, fontWeight: "800" }}>
                      {item.kind === "OUT" ? "-" : "+"}{fmtRp(item.amount)}
                    </Text>
                    {item.status === "VOID" ? <StatusPill status="VOID" size="sm" /> :
                      canWrite ? <Pressable onPress={() => setVoidId(item.id)} hitSlop={8}><Text style={{ color: colors.muted, fontSize: 12 }}>Batalkan</Text></Pressable> : null}
                  </View>
                </View>
              </Card>
            );
          }}
        />
      )}

      <CashForms mode={mode} onClose={() => setMode(null)} />
      <VoidSheet visible={!!voidId} onClose={() => setVoidId(null)} onConfirm={doVoid}
        title="Batalkan Transaksi Kas" message="Jurnal penyeimbang akan dibuat otomatis. Saldo kas dikembalikan." />
    </View>
  );
}

function QuickBtn({ icon, label, onPress, testID }: { icon: any; label: string; onPress: () => void; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable style={styles.quickBtn} onPress={onPress} testID={testID}>
      <Icon name={icon} size={22} color={colors.brandPrimary} />
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function CashForms({ mode, onClose }: { mode: FormMode; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: cashAccounts } = useCashAccounts();
  const { data: allAccounts } = useAccounts();
  const [date, setDate] = useState(todayISO());
  const [cashId, setCashId] = useState("");
  const [toCashId, setToCashId] = useState("");
  const [amount, setAmount] = useState(0);
  const [accountCode, setAccountCode] = useState("");
  const [desc, setDesc] = useState("");
  // form akun kas baru
  const [acctName, setAcctName] = useState("");
  const [acctType, setAcctType] = useState("CASH");
  const [glCode, setGlCode] = useState("");

  const reset = () => { setDate(todayISO()); setCashId(""); setToCashId(""); setAmount(0); setAccountCode(""); setDesc(""); setAcctName(""); setGlCode(""); };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cash-txns"] });
    qc.invalidateQueries({ queryKey: ["cash-accounts"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const m = useMutation({
    mutationFn: (v: { url: string; body: any }) => api(v.url, { method: "POST", body: v.body }),
    onSuccess: () => { toast.show("Berhasil disimpan & jurnal dibuat.", "success"); reset(); invalidate(); onClose(); },
    onError: (e: any) => toast.show(e?.message || "Gagal menyimpan.", "error"),
  });

  const counterAccounts = (allAccounts || []).filter((a) =>
    mode === "IN" ? (a.type === "REVENUE" || a.type === "EQUITY") : a.type === "EXPENSE");
  const glAssets = (allAccounts || []).filter((a) => a.type === "ASSET" && (a.subtype === "CASH" || a.subtype === "BANK"));

  const submit = () => {
    if (mode === "ACCOUNT") {
      if (!acctName.trim() || !glCode) return toast.show("Nama & akun buku besar wajib diisi.", "error");
      m.mutate({ url: "/cash-accounts", body: { name: acctName.trim(), type: acctType, account_code: glCode } });
      return;
    }
    if (amount <= 0) return toast.show("Nominal harus lebih dari nol.", "error");
    if (mode === "TRANSFER") {
      if (!cashId || !toCashId) return toast.show("Pilih rekening asal & tujuan.", "error");
      m.mutate({ url: "/cash-transfers", body: { date, from_cash_account_id: cashId, to_cash_account_id: toCashId, amount, notes: desc } });
      return;
    }
    if (!cashId) return toast.show("Pilih akun kas/bank.", "error");
    if (!accountCode) return toast.show("Pilih akun lawan.", "error");
    if (desc.trim().length < 3) return toast.show("Keterangan wajib diisi.", "error");
    m.mutate({ url: "/cash-transactions", body: { kind: mode, date, cash_account_id: cashId, amount, account_code: accountCode, description: desc } });
  };

  const title = mode === "IN" ? "Kas Masuk" : mode === "OUT" ? "Kas Keluar" : mode === "TRANSFER" ? "Transfer Antar Kas" : "Tambah Akun Kas/Bank";
  const cashOpts = (cashAccounts || []).map((a) => ({ value: a.id, label: a.name, sublabel: a.type === "BANK" ? "Bank" : "Kas" }));

  return (
    <Sheet visible={!!mode} onClose={onClose} title={title}
      footer={<Button label="Simpan" icon="checkmark" onPress={submit} loading={m.isPending} testID="cash-submit" />}>
      {mode === "ACCOUNT" ? (
        <>
          <Field label="Nama Akun" required><TextField value={acctName} onChangeText={setAcctName} placeholder="Kas Utama / Bank BRI Unit" testID="acct-name" /></Field>
          <Field label="Jenis" required><Segmented value={acctType} onChange={setAcctType}
            options={[{ value: "CASH", label: "Kas" }, { value: "BANK", label: "Bank" }]} testID="acct-type" /></Field>
          <Field label="Akun Buku Besar" required hint="Tautkan ke akun aset kas/bank di Bagan Akun.">
            <Select value={glCode} onChange={setGlCode} placeholder="Pilih akun aset"
              options={glAssets.map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }))} testID="acct-gl" />
          </Field>
        </>
      ) : (
        <>
          <Field label="Tanggal" required><DateField value={date} onChange={setDate} testID="cash-date" /></Field>
          <Field label={mode === "TRANSFER" ? "Dari Rekening" : "Kas / Bank"} required>
            <Select value={cashId} onChange={setCashId} placeholder="Pilih kas/bank" options={cashOpts} testID="cash-account" />
          </Field>
          {mode === "TRANSFER" ? (
            <Field label="Ke Rekening" required>
              <Select value={toCashId} onChange={setToCashId} placeholder="Pilih rekening tujuan" options={cashOpts} testID="cash-to-account" />
            </Field>
          ) : (
            <Field label="Akun Lawan" required hint={mode === "IN" ? "Pendapatan atau setoran modal." : "Akun beban operasional."}>
              <Select value={accountCode} onChange={setAccountCode} searchable placeholder="Pilih akun"
                options={counterAccounts.map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }))} testID="cash-counter" />
            </Field>
          )}
          <Field label="Nominal" required><RupiahField value={amount} onChangeValue={setAmount} testID="cash-amount" /></Field>
          <Field label={mode === "TRANSFER" ? "Catatan" : "Keterangan"} required={mode !== "TRANSFER"}>
            <TextField value={desc} onChangeText={setDesc} placeholder="Contoh: Pembayaran listrik" testID="cash-desc" />
          </Field>
        </>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  acctCard: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, padding: spacing.md, width: 180, justifyContent: "space-between", minHeight: 96 },
  acctName: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: "700", flex: 1 },
  acctBalance: { color: colors.onBrandPrimary, fontSize: 20, fontWeight: "800", fontFamily: fonts.display, marginTop: spacing.sm },
  acctMeta: { color: colors.onBrandPrimary, opacity: 0.8, fontSize: 11, marginTop: 2 },
  addAcct: { width: 120, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.borderStrong, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4, minHeight: 96 },
  quickRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  quickBtn: { flex: 1, backgroundColor: colors.brandTertiary, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingVertical: spacing.md, gap: 6 },
  quickLabel: { color: colors.onBrandTertiary, fontSize: 12, fontWeight: "700" },
  histTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.onSurface, fontWeight: "700", marginBottom: spacing.sm },
  txnIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  txnDesc: { fontSize: 14, color: colors.onSurface, fontWeight: "600" },
  txnMeta: { fontSize: 12, color: colors.muted, marginTop: 2, fontFamily: fonts.mono },
}));
