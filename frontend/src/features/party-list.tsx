// Arunika — Daftar Pelanggan / Pemasok (bersama).
import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Icon from "@/src/components/icon";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, EmptyState, Loading } from "@/src/components/ui";
import { Field, Sheet, TextField } from "@/src/components/form";
import { useToast } from "@/src/components/toast";
import { api, qs } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export function PartyListScreen({ kind }: { kind: "customers" | "suppliers" }) {
  const isCust = kind === "customers";
  const title = isCust ? "Pelanggan" : "Pemasok";
  const module = isCust ? "sales" : "purchases";
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const canWrite = can(module, "write");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: [kind, q],
    queryFn: () => api<any>(`/${kind}${qs({ q })}`),
  });

  const m = useMutation({
    mutationFn: (body: any) => api(`/${kind}`, { method: "POST", body }),
    onSuccess: () => { toast.show(`${title} ditambahkan.`, "success"); qc.invalidateQueries({ queryKey: [kind] }); setShow(false); setName(""); setPhone(""); setAddress(""); },
    onError: (e: any) => toast.show(e?.message || "Gagal.", "error"),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={title} back subtitle={`${data?.items?.length ?? 0} data`} />
      <View style={styles.searchWrap}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextField value={q} onChangeText={setQ} placeholder={`Cari ${title.toLowerCase()}`} testID="party-search" />
      </View>
      {isLoading ? <Loading /> : (
        <FlatList
          data={data?.items || []}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96, gap: spacing.sm }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={<EmptyState icon="people-outline" title={`Belum ada ${title.toLowerCase()}`} subtitle={canWrite ? "Ketuk + untuk menambah." : undefined} />}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>{item.code}{item.phone ? ` · ${item.phone}` : ""}</Text>
                </View>
              </View>
            </Card>
          )}
        />
      )}
      {canWrite ? (
        <Pressable style={[styles.fab, { bottom: insets.bottom + spacing.lg }]} onPress={() => setShow(true)} testID="party-add">
          <Icon name="add" size={28} color={colors.onBrandPrimary} />
        </Pressable>
      ) : null}
      <Sheet visible={show} onClose={() => setShow(false)} title={`Tambah ${title}`}
        footer={<Button label="Simpan" icon="checkmark" loading={m.isPending}
          onPress={() => { if (name.trim().length < 2) return toast.show("Nama wajib diisi.", "error"); m.mutate({ name: name.trim(), phone, address }); }} testID="party-submit" />}>
        <Field label="Nama" required><TextField value={name} onChangeText={setName} placeholder={`Nama ${title.toLowerCase()}`} testID="party-name" /></Field>
        <Field label="No. Telepon"><TextField value={phone} onChangeText={setPhone} placeholder="08xx" keyboardType="phone-pad" testID="party-phone" /></Field>
        <Field label="Alamat"><TextField value={address} onChangeText={setAddress} placeholder="Alamat" multiline testID="party-address" /></Field>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingLeft: spacing.md, borderWidth: 1, borderColor: colors.border, margin: spacing.lg, marginBottom: 0 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.brandPrimary, fontWeight: "800", fontSize: 18 },
  name: { fontSize: 16, color: colors.onSurface, fontWeight: "700" },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2, fontFamily: fonts.mono },
  fab: { position: "absolute", right: spacing.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
}));
