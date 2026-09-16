import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Icon from "@/src/components/icon";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, EmptyState, Loading, StatusPill } from "@/src/components/ui";
import { Field, Segmented, Select, Sheet, TextField } from "@/src/components/form";
import { useToast } from "@/src/components/toast";
import { api, qs } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { fmtRp } from "@/src/format";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const TYPES = [
  { value: "", label: "Semua" }, { value: "ASSET", label: "Aset" }, { value: "LIABILITY", label: "Liabilitas" },
  { value: "EQUITY", label: "Ekuitas" }, { value: "REVENUE", label: "Pendapatan" }, { value: "EXPENSE", label: "Beban" },
];
const TYPE_LABEL: Record<string, string> = { ASSET: "Aset", LIABILITY: "Liabilitas", EQUITY: "Ekuitas", REVENUE: "Pendapatan", EXPENSE: "Beban" };

export default function AccountsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [show, setShow] = useState(false);
  const canWrite = can("accounting", "write");

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [newType, setNewType] = useState("EXPENSE");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["accounts-list", type, q],
    queryFn: () => api<any>(`/accounts${qs({ type, q })}`),
  });

  const m = useMutation({
    mutationFn: (body: any) => api("/accounts", { method: "POST", body }),
    onSuccess: () => { toast.show("Akun ditambahkan.", "success"); qc.invalidateQueries({ queryKey: ["accounts"] }); qc.invalidateQueries({ queryKey: ["accounts-list"] }); setShow(false); setCode(""); setName(""); },
    onError: (e: any) => toast.show(e?.message || "Gagal.", "error"),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Bagan Akun" back subtitle="Chart of Accounts" />
      <View style={styles.filters}>
        <View style={styles.searchWrap}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextField value={q} onChangeText={setQ} placeholder="Cari kode / nama akun" testID="account-search" />
        </View>
        <FlatList horizontal showsHorizontalScrollIndicator={false} data={TYPES} keyExtractor={(t) => t.value}
          contentContainerStyle={{ gap: spacing.sm, paddingTop: spacing.sm }}
          renderItem={({ item }) => {
            const on = item.value === type;
            return (
              <Pressable style={[styles.chip, on && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
                onPress={() => setType(item.value)} testID={`account-type-${item.value || "all"}`}>
                <Text style={{ color: on ? colors.onBrandPrimary : colors.onSurfaceTertiary, fontWeight: "700", fontSize: 13 }}>{item.label}</Text>
              </Pressable>
            );
          }} />
      </View>
      {isLoading ? <Loading /> : (
        <FlatList
          data={data?.items || []}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96, gap: spacing.sm }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={<EmptyState icon="list-outline" title="Belum ada akun" />}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <Text style={styles.code}>{item.code}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.type}>{TYPE_LABEL[item.type]} · Saldo Normal {item.normal_balance === "D" ? "Debit" : "Kredit"}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.balance}>{fmtRp(item.balance)}</Text>
                  {!item.is_active ? <StatusPill status="VOID" size="sm" /> : null}
                </View>
              </View>
            </Card>
          )}
        />
      )}
      {canWrite ? (
        <Pressable style={[styles.fab, { bottom: insets.bottom + spacing.lg }]} onPress={() => setShow(true)} testID="account-add">
          <Icon name="add" size={28} color={colors.onBrandPrimary} />
        </Pressable>
      ) : null}
      <Sheet visible={show} onClose={() => setShow(false)} title="Tambah Akun"
        footer={<Button label="Simpan" icon="checkmark" loading={m.isPending}
          onPress={() => { if (!code.trim() || !name.trim()) return toast.show("Kode & nama wajib diisi.", "error"); m.mutate({ code: code.trim(), name: name.trim(), type: newType }); }} testID="account-submit" />}>
        <Field label="Kode Akun" required hint="Contoh: 5-2700"><TextField value={code} onChangeText={setCode} placeholder="5-2700" testID="account-code" /></Field>
        <Field label="Nama Akun" required><TextField value={name} onChangeText={setName} placeholder="Beban Pemasaran" testID="account-name" /></Field>
        <Field label="Tipe" required>
          <Select value={newType} onChange={setNewType} testID="account-type-select"
            options={TYPES.filter((t) => t.value).map((t) => ({ value: t.value, label: t.label }))} />
        </Field>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  filters: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingLeft: spacing.md, borderWidth: 1, borderColor: colors.border },
  chip: { flexShrink: 0, height: 34, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  code: { fontFamily: fonts.mono, fontSize: 13, color: colors.brandPrimary, fontWeight: "700", width: 62 },
  name: { fontSize: 15, color: colors.onSurface, fontWeight: "600" },
  type: { fontSize: 12, color: colors.muted, marginTop: 2 },
  balance: { fontSize: 14, color: colors.onSurface, fontWeight: "700", fontFamily: fonts.mono },
  fab: { position: "absolute", right: spacing.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
}));
