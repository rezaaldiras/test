import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Icon from "@/src/components/icon";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, EmptyState, Loading, SectionTitle } from "@/src/components/ui";
import { Field, Select, Sheet, TextField } from "@/src/components/form";
import { useToast } from "@/src/components/toast";
import { api } from "@/src/api";
import { useUnits } from "@/src/hooks";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function UnitsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const units = useUnits();
  const { data: costCenters, isLoading: ccLoading } = useQuery({
    queryKey: ["cost-centers"],
    queryFn: () => api<any>("/cost-centers").then((r) => r.items),
  });
  const [showUnit, setShowUnit] = useState(false);
  const [showCC, setShowCC] = useState(false);
  const [uName, setUName] = useState("");
  const [uDesc, setUDesc] = useState("");
  const [ccName, setCcName] = useState("");
  const [ccUnit, setCcUnit] = useState("");

  const unitM = useMutation({
    mutationFn: (body: any) => api("/business-units", { method: "POST", body }),
    onSuccess: () => { toast.show("Unit usaha ditambahkan.", "success"); qc.invalidateQueries({ queryKey: ["units"] }); setShowUnit(false); setUName(""); setUDesc(""); },
    onError: (e: any) => toast.show(e?.message || "Gagal.", "error"),
  });
  const ccM = useMutation({
    mutationFn: (body: any) => api("/cost-centers", { method: "POST", body }),
    onSuccess: () => { toast.show("Pusat biaya ditambahkan.", "success"); qc.invalidateQueries({ queryKey: ["cost-centers"] }); setShowCC(false); setCcName(""); setCcUnit(""); },
    onError: (e: any) => toast.show(e?.message || "Gagal.", "error"),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Unit Usaha & Pusat Biaya" back />
      {units.isLoading ? <Loading /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
          <SectionTitle right={<Pressable onPress={() => setShowUnit(true)} testID="add-unit"><Icon name="add-circle" size={26} color={colors.brandPrimary} /></Pressable>}>Unit Usaha</SectionTitle>
          {(units.data || []).length ? (units.data || []).map((u) => (
            <Card key={u.id} style={{ marginBottom: spacing.sm }}>
              <Text style={styles.name}>{u.name}</Text>
              {u.description ? <Text style={styles.desc}>{u.description}</Text> : null}
            </Card>
          )) : <Text style={styles.empty}>Belum ada unit usaha. BUMKam dapat memiliki beberapa unit (Perdagangan, Jasa, dll).</Text>}

          <View style={{ height: spacing.xl }} />
          <SectionTitle right={<Pressable onPress={() => setShowCC(true)} testID="add-cc"><Icon name="add-circle" size={26} color={colors.brandPrimary} /></Pressable>}>Pusat Biaya</SectionTitle>
          {ccLoading ? <Loading /> : (costCenters || []).length ? (costCenters || []).map((c: any) => (
            <Card key={c.id} style={{ marginBottom: spacing.sm }}>
              <Text style={styles.name}>{c.name}</Text>
            </Card>
          )) : <Text style={styles.empty}>Belum ada pusat biaya.</Text>}
        </ScrollView>
      )}

      <Sheet visible={showUnit} onClose={() => setShowUnit(false)} title="Tambah Unit Usaha"
        footer={<Button label="Simpan" icon="checkmark" loading={unitM.isPending} onPress={() => { if (uName.trim().length < 2) return toast.show("Nama wajib diisi.", "error"); unitM.mutate({ name: uName.trim(), description: uDesc }); }} testID="unit-submit" />}>
        <Field label="Nama Unit" required><TextField value={uName} onChangeText={setUName} placeholder="Unit Perdagangan" testID="unit-name" /></Field>
        <Field label="Deskripsi"><TextField value={uDesc} onChangeText={setUDesc} placeholder="Keterangan unit" multiline testID="unit-desc" /></Field>
      </Sheet>
      <Sheet visible={showCC} onClose={() => setShowCC(false)} title="Tambah Pusat Biaya"
        footer={<Button label="Simpan" icon="checkmark" loading={ccM.isPending} onPress={() => { if (ccName.trim().length < 2) return toast.show("Nama wajib diisi.", "error"); ccM.mutate({ name: ccName.trim(), unit_id: ccUnit || undefined }); }} testID="cc-submit" />}>
        <Field label="Nama Pusat Biaya" required><TextField value={ccName} onChangeText={setCcName} placeholder="Kantor BUMKam" testID="cc-name" /></Field>
        <Field label="Unit Usaha"><Select value={ccUnit} onChange={setCcUnit} placeholder="Opsional" options={[{ value: "", label: "Tanpa unit" }, ...(units.data || []).map((u) => ({ value: u.id, label: u.name }))]} testID="cc-unit" /></Field>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  name: { fontSize: 15, color: colors.onSurface, fontWeight: "700" },
  desc: { fontSize: 13, color: colors.muted, marginTop: 2 },
  empty: { fontSize: 13, color: colors.muted, lineHeight: 20 },
}));
