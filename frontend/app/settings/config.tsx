import { useEffect, useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Loading } from "@/src/components/ui";
import { Field, Select, TextField } from "@/src/components/form";
import { useToast } from "@/src/components/toast";
import { api } from "@/src/api";
import { useAccounts } from "@/src/hooks";
import { makeStyles, spacing, useTheme } from "@/src/theme";

export default function ConfigScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const { data: accounts } = useAccounts();
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: () => api<any>("/settings") });
  const [values, setValues] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data?.values && !values) setValues(data.values); }, [data]);

  if (isLoading || !values) return <View style={{ flex: 1, backgroundColor: colors.surface }}><ScreenHeader title="Konfigurasi" back /><Loading /></View>;

  const set = (k: string, v: any) => setValues({ ...values, [k]: v });
  const acctOpts = (accounts || []).map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }));

  const save = async () => {
    setSaving(true);
    try {
      await api("/settings", { method: "PATCH", body: { values } });
      toast.show("Konfigurasi disimpan.", "success");
    } catch (e: any) { toast.show(e?.message || "Gagal.", "error"); } finally { setSaving(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Konfigurasi Pajak & Akun" back subtitle="Aturan dapat diperbarui" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Aktifkan Pajak (PPN)</Text>
              <Text style={styles.switchHint}>Jika aktif, pajak dihitung otomatis pada faktur.</Text>
            </View>
            <Switch value={!!values.tax_enabled} onValueChange={(v) => set("tax_enabled", v)}
              trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} testID="tax-enabled" />
          </View>
          {values.tax_enabled ? (
            <Field label="Tarif Pajak (%)"><TextField value={String(values.tax_rate ?? 0)} onChangeText={(t) => set("tax_rate", t.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" placeholder="11" testID="tax-rate" /></Field>
          ) : null}
        </Card>

        <Card>
          <Text style={styles.title}>Akun Default</Text>
          <Text style={styles.subtitle}>Digunakan oleh mesin jurnal otomatis. Sesuaikan dengan Bagan Akun BUMKam.</Text>
          <Field label="Pendapatan Penjualan"><Select value={values.default_revenue_account} onChange={(v) => set("default_revenue_account", v)} searchable options={acctOpts} testID="cfg-revenue" /></Field>
          <Field label="Persediaan / Beban Pembelian"><Select value={values.default_purchase_account} onChange={(v) => set("default_purchase_account", v)} searchable options={acctOpts} testID="cfg-purchase" /></Field>
          <Field label="Piutang Usaha"><Select value={values.default_ar_account} onChange={(v) => set("default_ar_account", v)} searchable options={acctOpts} testID="cfg-ar" /></Field>
          <Field label="Utang Usaha"><Select value={values.default_ap_account} onChange={(v) => set("default_ap_account", v)} searchable options={acctOpts} testID="cfg-ap" /></Field>
          {values.tax_enabled ? (
            <>
              <Field label="Pajak Keluaran (PPN)"><Select value={values.tax_output_account} onChange={(v) => set("tax_output_account", v)} searchable options={acctOpts} testID="cfg-tax-out" /></Field>
              <Field label="Pajak Masukan (PPN)"><Select value={values.tax_input_account} onChange={(v) => set("tax_input_account", v)} searchable options={acctOpts} testID="cfg-tax-in" /></Field>
            </>
          ) : null}
        </Card>

        <Button label="Simpan Konfigurasi" icon="save-outline" onPress={save} loading={saving} style={{ marginTop: spacing.lg }} testID="config-save" />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  switchLabel: { fontSize: 15, color: colors.onSurface, fontWeight: "700" },
  switchHint: { fontSize: 12, color: colors.muted, marginTop: 2 },
  title: { fontSize: 16, color: colors.onSurface, fontWeight: "700", marginBottom: 2 },
  subtitle: { fontSize: 12, color: colors.muted, marginBottom: spacing.md, lineHeight: 18 },
}));
