import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { ScreenHeader } from "@/src/components/header";
import { Button, Card, EmptyState, Loading } from "@/src/components/ui";
import { DateField, Field, Select } from "@/src/components/form";
import { ReportView } from "@/src/components/report-view";
import { useToast } from "@/src/components/toast";
import { api, qs } from "@/src/api";
import { exportReport } from "@/src/export-file";
import { useAccounts, useUnitParam } from "@/src/hooks";
import { todayISO } from "@/src/format";
import { spacing, useTheme } from "@/src/theme";

export default function LedgerScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const unit = useUnitParam();
  const { data: accounts } = useAccounts();
  const [code, setCode] = useState("");
  const [from, setFrom] = useState(`${todayISO().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(todayISO());
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["ledger", code, from, to, unit],
    queryFn: () => api<any>(`/reports/general-ledger${qs({ account_code: code, date_from: from, date_to: to, unit_id: unit })}`),
    enabled: !!code,
  });

  const doExport = async (format: "csv" | "xlsx" | "pdf") => {
    setExporting(true);
    try {
      await exportReport({ report: "general-ledger", format, from_: from, to, account_code: code, unit_id: unit });
      toast.show(`Diekspor sebagai ${format.toUpperCase()}.`, "success");
    } catch (e: any) { toast.show(e?.message || "Gagal.", "error"); } finally { setExporting(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Buku Besar" back subtitle="Mutasi per akun" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Field label="Akun" required>
            <Select value={code} onChange={setCode} searchable placeholder="Pilih akun" testID="ledger-account"
              options={(accounts || []).map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }))} />
          </Field>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}><Field label="Dari"><DateField value={from} onChange={setFrom} testID="ledger-from" /></Field></View>
            <View style={{ flex: 1 }}><Field label="Sampai"><DateField value={to} onChange={setTo} testID="ledger-to" /></Field></View>
          </View>
        </Card>
        {!code ? <EmptyState icon="book-outline" title="Pilih akun" subtitle="Pilih akun untuk melihat buku besar & mutasinya." />
          : isLoading ? <Loading /> : data ? (
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
