import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Icon from "@/src/components/icon";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Loading, StatusPill } from "@/src/components/ui";
import { Field, Select, Sheet, TextField } from "@/src/components/form";
import { useToast } from "@/src/components/toast";
import { api } from "@/src/api";
import { ROLE_LABEL } from "@/src/constants";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function UsersScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("admin_keuangan");

  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => api<any>("/users") });

  const m = useMutation({
    mutationFn: (body: any) => api("/users", { method: "POST", body }),
    onSuccess: () => { toast.show("Pengguna ditambahkan.", "success"); qc.invalidateQueries({ queryKey: ["users"] }); setShow(false); setName(""); setEmail(""); setPassword(""); },
    onError: (e: any) => toast.show(e?.message || "Gagal.", "error"),
  });

  const toggleActive = async (u: any) => {
    try {
      await api(`/users/${u.id}`, { method: "PATCH", body: { is_active: !u.is_active } });
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e: any) { toast.show(e?.message || "Gagal.", "error"); }
  };

  const roles = data?.roles || [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Pengguna & Peran" back subtitle="Kontrol akses berbasis peran" />
      {isLoading ? <Loading /> : (
        <FlatList
          data={data?.items || []}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96, gap: spacing.sm }}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.email}>{item.email}</Text>
                  <View style={styles.roleBadge}><Text style={styles.roleText}>{ROLE_LABEL[item.role] || item.role}</Text></View>
                </View>
                <Pressable onPress={() => toggleActive(item)} testID={`user-toggle-${item.email}`}>
                  <StatusPill status={item.is_active ? "POSTED" : "VOID"} size="sm" />
                </Pressable>
              </View>
            </Card>
          )}
        />
      )}
      <Pressable style={[styles.fab, { bottom: insets.bottom + spacing.lg }]} onPress={() => setShow(true)} testID="user-add">
        <Icon name="person-add" size={24} color={colors.onBrandPrimary} />
      </Pressable>
      <Sheet visible={show} onClose={() => setShow(false)} title="Tambah Pengguna"
        footer={<Button label="Simpan" icon="checkmark" loading={m.isPending}
          onPress={() => { if (!name.trim() || !email.trim() || password.length < 8) return toast.show("Lengkapi data. Kata sandi minimal 8 karakter.", "error"); m.mutate({ name: name.trim(), email: email.trim(), password, role }); }} testID="user-submit" />}>
        <Field label="Nama" required><TextField value={name} onChangeText={setName} placeholder="Nama lengkap" testID="user-name" /></Field>
        <Field label="Email" required><TextField value={email} onChangeText={setEmail} placeholder="email@bumkam.id" keyboardType="email-address" autoCapitalize="none" testID="user-email" /></Field>
        <Field label="Kata Sandi" required hint="Minimal 8 karakter."><TextField value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry autoCapitalize="none" testID="user-password" /></Field>
        <Field label="Peran" required>
          <Select value={role} onChange={setRole} testID="user-role"
            options={(roles.length ? roles : Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))).map((r: any) => ({ value: r.value, label: r.label }))} />
        </Field>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.brandPrimary, fontWeight: "800", fontSize: 18 },
  name: { fontSize: 15, color: colors.onSurface, fontWeight: "700" },
  email: { fontSize: 12, color: colors.muted, marginTop: 1 },
  roleBadge: { alignSelf: "flex-start", backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  roleText: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: "700" },
  fab: { position: "absolute", right: spacing.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
}));
