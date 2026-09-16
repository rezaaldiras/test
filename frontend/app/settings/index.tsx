import { ScrollView, Text, View } from "react-native";
import { Pressable } from "react-native";
import { useRouter } from "expo-router";

import Icon from "@/src/components/icon";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card } from "@/src/components/ui";
import { useAuth } from "@/src/auth-context";
import { ROLE_LABEL } from "@/src/constants";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function Settings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { user, logout, can } = useAuth();

  const items = [
    { title: "Unit Usaha & Pusat Biaya", icon: "business-outline", route: "/settings/units", show: can("settings") },
    { title: "Pengguna & Peran", icon: "people-outline", route: "/settings/users", show: can("users") },
    { title: "Periode Akuntansi", icon: "lock-closed-outline", route: "/settings/periods", show: can("accounting") },
    { title: "Konfigurasi Pajak & Akun", icon: "options-outline", route: "/settings/config", show: can("settings") },
    { title: "Jejak Audit", icon: "shield-checkmark-outline", route: "/settings/audit", show: can("audit") },
  ].filter((i) => i.show);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Pengaturan" back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{(user?.name || "?").charAt(0).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user?.name}</Text>
              <Text style={styles.email}>{user?.email}</Text>
              <View style={styles.roleBadge}><Text style={styles.roleText}>{ROLE_LABEL[user?.role || ""] || user?.role}</Text></View>
            </View>
          </View>
        </Card>

        {items.map((item) => (
          <Pressable key={item.route} style={styles.row} onPress={() => router.push(item.route as any)} testID={`settings-${item.route}`}>
            <View style={styles.iconWrap}><Icon name={item.icon as any} size={22} color={colors.brandPrimary} /></View>
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Icon name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        ))}

        <Button label="Keluar" icon="log-out-outline" variant="outline" onPress={() => { logout(); router.replace("/login"); }} style={{ marginTop: spacing.md }} testID="logout" />
        <Text style={styles.footer}>Arunika · Keuangan & Akuntansi BUMKam</Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onBrandPrimary, fontSize: 24, fontWeight: "700" },
  name: { fontSize: 18, color: colors.onSurface, fontWeight: "700" },
  email: { fontSize: 13, color: colors.muted, marginTop: 2 },
  roleBadge: { alignSelf: "flex-start", backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, marginTop: 6 },
  roleText: { color: colors.onBrandTertiary, fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  iconWrap: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowTitle: { flex: 1, fontSize: 15, color: colors.onSurface, fontWeight: "600" },
  footer: { textAlign: "center", color: colors.muted, fontSize: 12, marginTop: spacing.lg },
}));
