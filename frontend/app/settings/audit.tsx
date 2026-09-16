import { FlatList, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { ScreenHeader } from "@/src/components/header";
import { Card, EmptyState, Loading } from "@/src/components/ui";
import { api } from "@/src/api";
import { MODULE_LABEL } from "@/src/constants";
import { fmtDateTime } from "@/src/format";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const ACTION_LABEL: Record<string, string> = {
  CREATE: "Membuat", UPDATE: "Mengubah", DELETE: "Menghapus", VOID: "Membatalkan",
  POST: "Memposting", CLOSE: "Menutup", REOPEN: "Membuka", SEED: "Inisialisasi",
};

export default function AuditScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { data, isLoading } = useQuery({ queryKey: ["audit"], queryFn: () => api<any>("/audit?limit=150") });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Jejak Audit" back subtitle="Riwayat aktivitas sistem" />
      {isLoading ? <Loading /> : (
        <FlatList
          data={data?.items || []}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm }}
          ListEmptyComponent={<EmptyState icon="shield-checkmark-outline" title="Belum ada aktivitas" />}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 4 }}>
                <View style={styles.dot} />
                <Text style={styles.action}>{ACTION_LABEL[item.action] || item.action} · {MODULE_LABEL[item.collection] || item.collection}</Text>
              </View>
              <Text style={styles.user}>{item.user_email}</Text>
              <Text style={styles.time}>{fmtDateTime(item.created_at)}</Text>
              {item.after ? <Text style={styles.detail} numberOfLines={2}>{JSON.stringify(item.after)}</Text> : null}
            </Card>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary },
  action: { fontSize: 14, color: colors.onSurface, fontWeight: "700" },
  user: { fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2 },
  time: { fontSize: 12, color: colors.muted, marginTop: 2 },
  detail: { fontSize: 11, color: colors.muted, marginTop: 6, fontFamily: fonts.mono, backgroundColor: colors.surfaceTertiary, padding: spacing.sm, borderRadius: radius.sm },
}));
