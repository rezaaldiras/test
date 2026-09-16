import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { ScreenHeader } from "@/src/components/header";
import { Button, Card, ErrorState, Loading } from "@/src/components/ui";
import { DateField, Field } from "@/src/components/form";
import { ReportView } from "@/src/components/report-view";
import { useToast } from "@/src/components/toast";
import { api, qs } from "@/src/api";
import { exportReport } from "@/src/export-file";
import { useUnitParam } from "@/src/hooks";
import { todayISO } from "@/src/format";
import { spacing, useTheme } from "@/src/theme";

const DEFS: Record<string, { title: string; endpoint: string }> = {
  "trial-balance": { title: "Neraca Saldo", endpoint: "/reports/trial-balance" },
  "ar-aging": { title: "Umur Piutang", endpoint: "/reports/ar-aging" },
  "ap-aging": { title: "Umur Utang", endpoint: "/reports/ap-aging" },
};

export default function ReportByType() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const def = DEFS[type || "trial-balance"] || DEFS["trial-balance"];
  const { colors } = useTheme();
  const toast = useToast();
  const unit = useUnitParam();
  const [asOf, setAsOf] = useState(todayISO());
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["report-type", type, asOf, unit],
    queryFn: () => api<any>(`${def.endpoint}${qs({ to: asOf, as_of: asOf, unit_id: unit })}`),
  });

  const doExport = async (format: "csv" | "xlsx" | "pdf") => {
    setExporting(true);
    try {
      await exportReport({ report: type!, format, as_of: asOf, to: asOf, unit_id: unit });
      toast.show(`Diekspor sebagai ${format.toUpperCase()}.`, "success");
    } catch (e: any) { toast.show(e?.message || "Gagal.", "error"); } finally { setExporting(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={def.title} back showUnit />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Field label="Per Tanggal"><DateField value={asOf} onChange={setAsOf} testID="report-asof" /></Field>
        </Card>
        {isLoading ? <Loading /> : isError ? <ErrorState message={(error as Error)?.message} onRetry={refetch} /> : data ? (
          <>
            <ReportView report={data} />
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <Button label="CSV" icon="download-outline" variant="outline" small onPress={() => doExport("csv")} loading={exporting} style={{ flex: 1 }} />
              <Button label="Excel" icon="grid-outline" variant="outline" small onPress={() => doExport("xlsx")} loading={exporting} style={{ flex: 1 }} />
              <Button label="PDF" icon="document-outline" variant="outline" small onPress={() => doExport("pdf")} loading={exporting} style={{ flex: 1 }} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
