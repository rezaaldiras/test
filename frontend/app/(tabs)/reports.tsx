import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import Icon from "@/src/components/icon";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, ErrorState, Loading } from "@/src/components/ui";
import { DateField } from "@/src/components/form";
import { ReportView } from "@/src/components/report-view";
import { useToast } from "@/src/components/toast";
import { api, qs } from "@/src/api";
import { exportReport } from "@/src/export-file";
import { useUnitParam } from "@/src/hooks";
import { useAuth } from "@/src/auth-context";
import { todayISO } from "@/src/format";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { useQuery } from "@tanstack/react-query";

type ReportDef = { key: string; label: string; icon: any; mode: "range" | "asof"; endpoint: (p: any) => string };

const REPORTS: ReportDef[] = [
  { key: "income-statement", label: "Laba Rugi", icon: "trending-up-outline", mode: "range",
    endpoint: (p) => `/reports/income-statement${qs(p)}` },
  { key: "balance-sheet", label: "Posisi Keuangan", icon: "scale-outline", mode: "asof",
    endpoint: (p) => `/reports/balance-sheet${qs(p)}` },
  { key: "cash-flow", label: "Arus Kas", icon: "swap-vertical-outline", mode: "range",
    endpoint: (p) => `/reports/cash-flow${qs(p)}` },
  { key: "trial-balance", label: "Neraca Saldo", icon: "list-outline", mode: "asof",
    endpoint: (p) => `/reports/trial-balance${qs(p)}` },
  { key: "ar-aging", label: "Umur Piutang", icon: "arrow-down-circle-outline", mode: "asof",
    endpoint: (p) => `/reports/ar-aging${qs(p)}` },
  { key: "ap-aging", label: "Umur Utang", icon: "arrow-up-circle-outline", mode: "asof",
    endpoint: (p) => `/reports/ap-aging${qs(p)}` },
  { key: "journal-register", label: "Register Jurnal", icon: "reader-outline", mode: "range",
    endpoint: (p) => `/reports/journal-register${qs(p)}` },
];

export default function Reports() {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const unit = useUnitParam();
  const { activeUnit } = useAuth();
  const [active, setActive] = useState("income-statement");
  const yearStart = `${todayISO().slice(0, 4)}-01-01`;
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(todayISO());
  const [exporting, setExporting] = useState("");

  const def = REPORTS.find((r) => r.key === active)!;

  const params = useMemo(() => {
    if (def.mode === "asof") return { as_of: to, unit_id: unit };
    return { date_from: from, date_to: to, unit_id: unit };
  }, [def, from, to, unit]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["report", active, params, activeUnit],
    queryFn: () => api<any>(def.endpoint(params)),
  });

  const doExport = async (format: "csv" | "xlsx" | "pdf") => {
    setExporting(format);
    try {
      await exportReport({
        report: active, format,
        from_: def.mode === "range" ? from : undefined,
        to: def.mode === "range" ? to : undefined,
        as_of: def.mode === "asof" ? to : undefined,
        unit_id: unit,
      });
      toast.show(`Laporan diekspor sebagai ${format.toUpperCase()}.`, "success");
    } catch (e: any) {
      toast.show(e?.message || "Gagal mengekspor.", "error");
    } finally {
      setExporting("");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Laporan Keuangan" subtitle="Dihitung dari buku besar" showUnit />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        {/* Pemilih laporan */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
          {REPORTS.map((r) => {
            const on = r.key === active;
            return (
              <Pressable key={r.key} style={[styles.chip, on && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
                onPress={() => setActive(r.key)} testID={`report-${r.key}`}>
                <Icon name={r.icon} size={16} color={on ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
                <Text style={{ color: on ? colors.onBrandPrimary : colors.onSurfaceTertiary, fontWeight: "700", fontSize: 13 }}>{r.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Periode */}
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            {def.mode === "range" ? (
              <View style={{ flex: 1 }}>
                <Text style={styles.filterLabel}>Dari Tanggal</Text>
                <DateField value={from} onChange={setFrom} testID="report-from" />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.filterLabel}>{def.mode === "asof" ? "Per Tanggal" : "Sampai Tanggal"}</Text>
              <DateField value={to} onChange={setTo} testID="report-to" />
            </View>
          </View>
        </Card>

        {isLoading ? <Loading label="Menyusun laporan..." /> : isError ? (
          <ErrorState message={(error as Error)?.message || "Gagal memuat."} onRetry={refetch} />
        ) : data ? (
          <>
            <ReportView report={data} />
            <View style={styles.exportRow}>
              <Button label="CSV" icon="download-outline" variant="outline" small onPress={() => doExport("csv")} loading={exporting === "csv"} style={{ flex: 1 }} testID="export-csv" />
              <Button label="Excel" icon="grid-outline" variant="outline" small onPress={() => doExport("xlsx")} loading={exporting === "xlsx"} style={{ flex: 1 }} testID="export-xlsx" />
              <Button label="PDF" icon="document-outline" variant="outline" small onPress={() => doExport("pdf")} loading={exporting === "pdf"} style={{ flex: 1 }} testID="export-pdf" />
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  chip: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterLabel: { fontSize: 13, color: colors.onSurfaceSecondary, fontWeight: "600", marginBottom: 6 },
  exportRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
}));
