import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Icon from "@/src/components/icon";
import { ScreenHeader, VoidSheet } from "@/src/components/header";
import { Button, Card, Divider, EmptyState, KeyValue, Loading, StatusPill } from "@/src/components/ui";
import { DateField, Field, RupiahField, Select, Sheet, TextField } from "@/src/components/form";
import { useToast } from "@/src/components/toast";
import { api, qs } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useAccounts } from "@/src/hooks";
import { fmtDate, fmtRp, todayISO } from "@/src/format";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const SRC_LABEL: Record<string, string> = {
  SALES: "Penjualan", PURCHASE: "Pembelian", RECEIVE: "Penerimaan", PAY: "Pembayaran",
  CASH_IN: "Kas Masuk", CASH_OUT: "Kas Keluar", TRANSFER: "Transfer", MANUAL: "Manual",
  OPENING: "Saldo Awal", VOID: "Pembatalan",
};

type JLine = { account_code: string; debit: number; credit: number };

export default function JournalsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { can } = useAuth();
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const canWrite = can("accounting", "write");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["journals", q],
    queryFn: () => api<any>(`/journals${qs({ q, limit: 50 })}`),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Jurnal Umum" back subtitle={`${data?.total ?? 0} jurnal`} />
      <View style={styles.searchWrap}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextField value={q} onChangeText={setQ} placeholder="Cari no. jurnal / keterangan" testID="journal-search" />
      </View>
      {isLoading ? <Loading /> : (
        <FlatList
          data={data?.items || []}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96, gap: spacing.sm }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={<EmptyState icon="create-outline" title="Belum ada jurnal" subtitle="Jurnal dibuat otomatis dari transaksi, atau buat manual." />}
          renderItem={({ item }) => (
            <Pressable onPress={() => setDetail(item)} testID={`journal-${item.number}`}>
              <Card>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={styles.number}>{item.number}</Text>
                  <StatusPill status={item.status} size="sm" />
                </View>
                <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                  <Text style={styles.meta}>{fmtDate(item.date)} · {SRC_LABEL[item.source_type] || item.source_type}</Text>
                  <Text style={styles.total}>{fmtRp(item.total)}</Text>
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}
      {canWrite ? (
        <Pressable style={[styles.fab, { bottom: insets.bottom + spacing.lg }]} onPress={() => setShowForm(true)} testID="journal-add">
          <Icon name="add" size={28} color={colors.onBrandPrimary} />
        </Pressable>
      ) : null}
      <ManualJournalForm visible={showForm} onClose={() => setShowForm(false)} />
      <JournalDetail item={detail} onClose={() => setDetail(null)} onChanged={refetch} />
    </View>
  );
}

function ManualJournalForm({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: accounts } = useAccounts();
  const [date, setDate] = useState(todayISO());
  const [desc, setDesc] = useState("");
  const [lines, setLines] = useState<JLine[]>([{ account_code: "", debit: 0, credit: 0 }, { account_code: "", debit: 0, credit: 0 }]);

  const totalD = useMemo(() => lines.reduce((s, l) => s + (l.debit || 0), 0), [lines]);
  const totalC = useMemo(() => lines.reduce((s, l) => s + (l.credit || 0), 0), [lines]);
  const balanced = Math.abs(totalD - totalC) < 0.01 && totalD > 0;

  const reset = () => { setDate(todayISO()); setDesc(""); setLines([{ account_code: "", debit: 0, credit: 0 }, { account_code: "", debit: 0, credit: 0 }]); };

  const m = useMutation({
    mutationFn: (body: any) => api("/journals", { method: "POST", body }),
    onSuccess: () => { toast.show("Jurnal manual diposting.", "success"); qc.invalidateQueries({ queryKey: ["journals"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); reset(); onClose(); },
    onError: (e: any) => toast.show(e?.message || "Gagal.", "error"),
  });

  const opts = (accounts || []).map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }));

  return (
    <Sheet visible={visible} onClose={onClose} title="Jurnal Manual"
      footer={
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={styles.balLabel}>Debit {fmtRp(totalD)}</Text>
            <Text style={styles.balLabel}>Kredit {fmtRp(totalC)}</Text>
          </View>
          <Button label={balanced ? "Posting Jurnal" : "Debit & Kredit harus seimbang"} icon="checkmark"
            disabled={!balanced} loading={m.isPending}
            onPress={() => m.mutate({ date, description: desc, source_type: "MANUAL", action: "post", lines })} testID="journal-submit" />
        </View>
      }>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}><Field label="Tanggal" required><DateField value={date} onChange={setDate} testID="journal-date" /></Field></View>
      </View>
      <Field label="Keterangan" required><TextField value={desc} onChangeText={setDesc} placeholder="Contoh: Penyesuaian saldo awal" testID="journal-desc" /></Field>
      {lines.map((l, i) => (
        <View key={i} style={styles.jline}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Text style={styles.jlineNo}>Baris {i + 1}</Text>
            {lines.length > 2 ? <Pressable onPress={() => setLines(lines.filter((_, x) => x !== i))} hitSlop={8}><Icon name="trash-outline" size={16} color={colors.error} /></Pressable> : null}
          </View>
          <Select value={l.account_code} onChange={(v) => setLines(lines.map((x, xi) => xi === i ? { ...x, account_code: v } : x))} searchable placeholder="Pilih akun" options={opts} testID={`jline-account-${i}`} />
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <View style={{ flex: 1 }}><Text style={styles.miniLabel}>Debit</Text><RupiahField value={l.debit} onChangeValue={(n) => setLines(lines.map((x, xi) => xi === i ? { ...x, debit: n, credit: n > 0 ? 0 : x.credit } : x))} testID={`jline-debit-${i}`} /></View>
            <View style={{ flex: 1 }}><Text style={styles.miniLabel}>Kredit</Text><RupiahField value={l.credit} onChangeValue={(n) => setLines(lines.map((x, xi) => xi === i ? { ...x, credit: n, debit: n > 0 ? 0 : x.debit } : x))} testID={`jline-credit-${i}`} /></View>
          </View>
        </View>
      ))}
      <Button label="Tambah Baris" icon="add" variant="outline" small onPress={() => setLines([...lines, { account_code: "", debit: 0, credit: 0 }])} style={{ marginTop: spacing.sm }} testID="jline-add" />
    </Sheet>
  );
}

function JournalDetail({ item, onClose, onChanged }: { item: any; onClose: () => void; onChanged: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [showVoid, setShowVoid] = useState(false);
  if (!item) return null;
  const canVoid = can("accounting", "write") && item.status === "POSTED" && ["MANUAL", "OPENING"].includes(item.source_type);

  const doVoid = async (reason: string) => {
    try {
      await api(`/journals/${item.id}/void`, { method: "POST", body: { reason } });
      toast.show("Jurnal dibatalkan.", "success");
      qc.invalidateQueries({ queryKey: ["journals"] }); qc.invalidateQueries({ queryKey: ["dashboard"] });
      onChanged(); onClose();
    } catch (e: any) { toast.show(e?.message || "Gagal.", "error"); throw e; }
  };

  return (
    <Sheet visible={!!item} onClose={onClose} title={item.number}
      footer={canVoid ? <Button label="Batalkan Jurnal" variant="outline" icon="close-circle-outline" onPress={() => setShowVoid(true)} testID="journal-void" /> : undefined}>
      <KeyValue label="Tanggal" value={fmtDate(item.date, true)} />
      <KeyValue label="Keterangan" value={item.description} />
      <KeyValue label="Sumber" value={SRC_LABEL[item.source_type] || item.source_type} />
      <KeyValue label="Status" value={item.status} />
      <Divider />
      {item.lines.map((l: any, i: number) => (
        <View key={i} style={styles.detailLine}>
          <View style={{ flex: 1 }}>
            <Text style={styles.jlAcct}>{l.account_code} · {l.account_name}</Text>
            {l.description ? <Text style={styles.jlDesc} numberOfLines={1}>{l.description}</Text> : null}
          </View>
          <Text style={styles.jlAmt}>{l.debit ? fmtRp(l.debit) : ""}</Text>
          <Text style={styles.jlAmt}>{l.credit ? fmtRp(l.credit) : ""}</Text>
        </View>
      ))}
      {showVoid ? (
        <VoidSheet visible={showVoid} onClose={() => setShowVoid(false)} onConfirm={doVoid}
          title="Batalkan Jurnal" message="Jurnal penyeimbang akan dibuat. Jurnal asli tetap tersimpan." />
      ) : null}
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingLeft: spacing.md, borderWidth: 1, borderColor: colors.border, margin: spacing.lg, marginBottom: 0 },
  number: { fontFamily: fonts.mono, fontSize: 13, color: colors.brandPrimary, fontWeight: "700" },
  desc: { fontSize: 15, color: colors.onSurface, fontWeight: "600", marginTop: 4 },
  meta: { fontSize: 12, color: colors.muted },
  total: { fontSize: 14, color: colors.onSurface, fontWeight: "700", fontFamily: fonts.mono },
  fab: { position: "absolute", right: spacing.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  jline: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  jlineNo: { fontSize: 12, color: colors.muted, fontWeight: "700" },
  miniLabel: { fontSize: 11, color: colors.muted, marginBottom: 4, fontWeight: "600" },
  balLabel: { fontSize: 13, color: colors.onSurfaceSecondary, fontWeight: "700" },
  detailLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.divider },
  jlAcct: { fontSize: 13, color: colors.onSurface, fontWeight: "600" },
  jlDesc: { fontSize: 11, color: colors.muted, marginTop: 2 },
  jlAmt: { fontSize: 12, color: colors.onSurface, fontWeight: "700", fontFamily: fonts.mono, width: 84, textAlign: "right" },
}));
