import { useCallback } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import Icon from "@/src/components/icon";
import { ScreenHeader } from "@/src/components/header";
import { Card, EmptyState, ErrorState, Loading, StatusPill } from "@/src/components/ui";
import { MiniBars } from "@/src/components/charts";
import { api, qs } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useUnitParam } from "@/src/hooks";
import { fmtDate, fmtRp, monthKey } from "@/src/format";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export default function Dashboard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { user, activeUnit } = useAuth();
  const unit = useUnitParam();
  const month = monthKey();

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["dashboard", month, activeUnit],
    queryFn: () => api<any>(`/dashboard${qs({ month, unit_id: unit })}`),
  });

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader
        title={user?.company_name || "Arunika"}
        subtitle={data?.label || "Memuat..."}
        showUnit
        right={
          <Pressable style={styles.avatar} onPress={() => router.push("/settings")} testID="open-settings">
            <Text style={styles.avatarText}>{(user?.name || "?").charAt(0).toUpperCase()}</Text>
          </Pressable>
        }
      />
      {isLoading ? <Loading label="Memuat dashboard..." /> : isError ? (
        <ErrorState message={(error as Error)?.message || "Gagal memuat."} onRetry={refetch} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
        >
          {!data.has_accounts ? (
            <Card style={{ marginBottom: spacing.lg }}>
              <EmptyState icon="rocket-outline" title="Mulai dari sini"
                subtitle="Bagan akun standar sudah disiapkan. Tambahkan saldo awal & akun kas/bank untuk mulai mencatat." />
            </Card>
          ) : null}

          {/* KPI utama */}
          <View style={styles.kpiGrid}>
            <KpiCard label="Pendapatan" value={fmtRp(data.kpis.revenue)} icon="trending-up" tone="success" />
            <KpiCard label="Beban" value={fmtRp(data.kpis.expense)} icon="trending-down" tone="error" />
            <KpiCard label="Laba / Rugi" value={fmtRp(data.kpis.profit)} icon="stats-chart"
              tone={data.kpis.profit >= 0 ? "success" : "error"} />
            <KpiCard label="Saldo Kas & Bank" value={fmtRp(data.kpis.cash_total)} icon="wallet" tone="brand" />
            <KpiCard label="Piutang" value={fmtRp(data.kpis.ar_outstanding)} icon="arrow-down-circle" tone="info"
              onPress={() => router.push("/reports/ar-aging" as any)} />
            <KpiCard label="Utang" value={fmtRp(data.kpis.ap_outstanding)} icon="arrow-up-circle" tone="warning"
              onPress={() => router.push("/reports/ap-aging" as any)} />
          </View>

          {/* Grafik pendapatan vs beban */}
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={styles.cardTitle}>Pendapatan & Beban (6 bulan)</Text>
            <MiniBars
              labels={(data.series.months as string[]).map((m) => MONTHS_SHORT[Number(m.slice(5)) - 1])}
              series={[
                { data: data.series.revenue, color: colors.brandPrimary },
                { data: data.series.expense, color: colors.brandSecondary },
              ]}
            />
            <View style={styles.legend}>
              <Legend color={colors.brandPrimary} label="Pendapatan" />
              <Legend color={colors.brandSecondary} label="Beban" />
            </View>
          </Card>

          {/* Grafik arus kas */}
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={styles.cardTitle}>Arus Kas Masuk & Keluar</Text>
            <MiniBars
              labels={(data.series.months as string[]).map((m) => MONTHS_SHORT[Number(m.slice(5)) - 1])}
              series={[
                { data: data.series.cash_in, color: colors.info },
                { data: data.series.cash_out, color: colors.error },
              ]}
            />
            <View style={styles.legend}>
              <Legend color={colors.info} label="Kas Masuk" />
              <Legend color={colors.error} label="Kas Keluar" />
            </View>
          </Card>

          {/* Tagihan jatuh tempo */}
          <DueSection title="Piutang Segera Jatuh Tempo" icon="alarm-outline"
            items={data.due_sales} empty="Tidak ada piutang jatuh tempo dalam 7 hari." />
          <DueSection title="Utang Segera Jatuh Tempo" icon="hourglass-outline"
            items={data.due_purchases} empty="Tidak ada utang jatuh tempo dalam 7 hari." />

          {/* Top pelanggan */}
          {data.top_customers?.length ? (
            <Card style={{ marginTop: spacing.lg }}>
              <Text style={styles.cardTitle}>Pelanggan Teratas (YTD)</Text>
              {data.top_customers.map((c: any, i: number) => (
                <View key={i} style={styles.topRow}>
                  <View style={styles.rankBadge}><Text style={styles.rankText}>{i + 1}</Text></View>
                  <Text style={{ flex: 1, color: colors.onSurface, fontWeight: "600" }} numberOfLines={1}>{c.name}</Text>
                  <Text style={{ color: colors.onSurface, fontWeight: "700" }}>{fmtRp(c.total)}</Text>
                </View>
              ))}
            </Card>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function KpiCard({ label, value, icon, tone, onPress }: {
  label: string; value: string; icon: any; tone: "success" | "error" | "brand" | "info" | "warning"; onPress?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const toneColor = tone === "success" ? colors.success : tone === "error" ? colors.error
    : tone === "info" ? colors.info : tone === "warning" ? colors.warning : colors.brandPrimary;
  return (
    <Pressable style={styles.kpi} onPress={onPress} disabled={!onPress} testID={`kpi-${label}`}>
      <View style={[styles.kpiIcon, { backgroundColor: toneColor + "1A" }]}>
        <Icon name={icon} size={18} color={toneColor} />
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </Pressable>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function DueSection({ title, icon, items, empty }: { title: string; icon: any; items: any[]; empty: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Card style={{ marginTop: spacing.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm }}>
        <Icon name={icon} size={18} color={colors.warning} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {items?.length ? items.map((it) => (
        <View key={it.id} style={styles.dueRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.onSurface, fontWeight: "600" }} numberOfLines={1}>{it.party}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{it.number} · {fmtDate(it.due_date)}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: colors.onSurface, fontWeight: "700" }}>{fmtRp(it.remaining)}</Text>
            {it.overdue_days > 0 ? (
              <Text style={{ color: colors.error, fontSize: 11, fontWeight: "700" }}>Telat {it.overdue_days} hari</Text>
            ) : (
              <Text style={{ color: colors.muted, fontSize: 11 }}>{it.days_left} hari lagi</Text>
            )}
          </View>
        </View>
      )) : <Text style={{ color: colors.muted, fontSize: 13, paddingVertical: spacing.sm }}>{empty}</Text>}
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onBrandPrimary, fontSize: 17, fontWeight: "700" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  kpi: { width: "47.5%", flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  kpiIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  kpiLabel: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  kpiValue: { color: colors.onSurface, fontSize: 17, fontWeight: "800", marginTop: 2, fontFamily: fonts.display },
  cardTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.onSurface, fontWeight: "700" },
  legend: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm, justifyContent: "center" },
  dueRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.divider },
  topRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.divider },
  rankBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rankText: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12 },
}));
