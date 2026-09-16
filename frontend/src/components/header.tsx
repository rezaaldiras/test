// Arunika — Header layar (sticky, safe-area aware) + pemilih unit usaha + tombol void.
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Icon from "@/src/components/icon";
import { Button } from "@/src/components/ui";
import { Field, TextField } from "@/src/components/form";
import { useAuth } from "@/src/auth-context";
import { useUnits } from "@/src/hooks";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export function ScreenHeader({ title, subtitle, back, right, showUnit }: {
  title: string; subtitle?: string; back?: boolean; right?: React.ReactNode; showUnit?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.headerRow}>
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: spacing.sm }}>
          {back ? (
            <Pressable onPress={() => router.back()} hitSlop={10} testID="header-back">
              <Icon name="chevron-back" size={26} color={colors.onSurface} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
        </View>
        {right}
      </View>
      {showUnit ? <UnitSelector /> : null}
    </View>
  );
}

export function UnitSelector() {
  const { activeUnit, setActiveUnit } = useAuth();
  const { data: units } = useUnits();
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const active = (units || []).find((u) => u.id === activeUnit);
  const label = active ? active.name : "Semua Unit Usaha";

  return (
    <>
      <Pressable style={styles.unitBtn} onPress={() => setOpen(true)} testID="unit-selector">
        <Icon name="business-outline" size={16} color={colors.brandPrimary} />
        <Text style={styles.unitText} numberOfLines={1}>{label}</Text>
        <Icon name="chevron-down" size={16} color={colors.brandPrimary} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Pilih Unit Usaha</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <UnitRow name="Semua Unit Usaha" selected={!activeUnit} onPress={() => { setActiveUnit(""); setOpen(false); }} />
              {(units || []).map((u) => (
                <UnitRow key={u.id} name={u.name} selected={activeUnit === u.id}
                  onPress={() => { setActiveUnit(u.id); setOpen(false); }} />
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function UnitRow({ name, selected, onPress }: { name: string; selected: boolean; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable style={[styles.unitRow, selected && { backgroundColor: colors.brandTertiary }]} onPress={onPress}>
      <Text style={{ color: colors.onSurface, fontSize: 15, fontWeight: selected ? "700" : "500" }}>{name}</Text>
      {selected ? <Icon name="checkmark" size={20} color={colors.brandPrimary} /> : null}
    </Pressable>
  );
}

// Sheet konfirmasi pembatalan (void) dengan alasan wajib.
export function VoidSheet({ visible, onClose, onConfirm, title, message }: {
  visible: boolean; onClose: () => void; onConfirm: (reason: string) => Promise<void>;
  title: string; message: string;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const { colors } = useTheme();

  const submit = async () => {
    if (reason.trim().length < 3) return;
    setLoading(true);
    try {
      await onConfirm(reason.trim());
      setReason("");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{title}</Text>
          <Text style={{ color: colors.muted, fontSize: 14, marginBottom: spacing.md, lineHeight: 20 }}>{message}</Text>
          <Field label="Alasan Pembatalan" required hint="Wajib diisi untuk jejak audit.">
            <TextField value={reason} onChangeText={setReason} placeholder="Contoh: Salah input jumlah" multiline testID="void-reason" />
          </Field>
          <Button label="Batalkan Transaksi" variant="danger" icon="close-circle-outline"
            onPress={submit} loading={loading} disabled={reason.trim().length < 3} testID="void-confirm" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  header: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface, fontWeight: "700" },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  unitBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: spacing.sm,
    backgroundColor: colors.brandTertiary, paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.pill, maxWidth: "100%",
  },
  unitText: { color: colors.onBrandTertiary, fontSize: 13, fontWeight: "700", flexShrink: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(28,27,24,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.md },
  sheetTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface, fontWeight: "700", marginBottom: spacing.sm },
  unitRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: spacing.md, borderRadius: radius.md },
}));
