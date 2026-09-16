// Arunika — Komponen form: TextField, RupiahField, Select, DateField, Sheet, Segmented.
import { useMemo, useState } from "react";
import {
  Modal, Platform, Pressable, ScrollView, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import Icon from "@/src/components/icon";
import { Button } from "@/src/components/ui";
import { fmtDate, fmtInputRp, parseNumber } from "@/src/format";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export function Field({ label, children, hint, required }: {
  label: string; children: React.ReactNode; hint?: string; required?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}{required ? <Text style={{ color: "#A63A2B" }}> *</Text> : null}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function TextField({ value, onChangeText, placeholder, keyboardType, multiline, autoCapitalize, secureTextEntry, testID, editable = true }: {
  value: string; onChangeText: (t: string) => void; placeholder?: string;
  keyboardType?: any; multiline?: boolean; autoCapitalize?: any; secureTextEntry?: boolean;
  testID?: string; editable?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <TextInput
      testID={testID}
      style={[styles.input, multiline && { minHeight: 80, textAlignVertical: "top" }, !editable && { opacity: 0.6 }]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      keyboardType={keyboardType}
      multiline={multiline}
      autoCapitalize={autoCapitalize}
      secureTextEntry={secureTextEntry}
      editable={editable}
    />
  );
}

export function RupiahField({ value, onChangeValue, placeholder = "0", testID }: {
  value: number; onChangeValue: (n: number) => void; placeholder?: string; testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [text, setText] = useState(value ? value.toLocaleString("id-ID") : "");
  return (
    <View style={styles.rpWrap}>
      <Text style={styles.rpPrefix}>Rp</Text>
      <TextInput
        testID={testID}
        style={styles.rpInput}
        value={text}
        onChangeText={(t) => {
          const n = parseNumber(t);
          setText(fmtInputRp(t));
          onChangeValue(n);
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
      />
    </View>
  );
}

export type Option = { value: string; label: string; sublabel?: string };

export function Select({ value, options, onChange, placeholder = "Pilih...", testID, searchable }: {
  value: string; options: Option[]; onChange: (v: string) => void; placeholder?: string;
  testID?: string; searchable?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const insets = useSafeAreaInsets();
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(
    () => (q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options),
    [q, options],
  );

  return (
    <>
      <Pressable style={styles.input} onPress={() => setOpen(true)} testID={testID}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: selected ? colors.onSurface : colors.muted, fontSize: 15, flex: 1 }} numberOfLines={1}>
            {selected ? selected.label : placeholder}
          </Text>
          <Icon name="chevron-down" size={18} color={colors.muted} />
        </View>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg, maxHeight: "75%" }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            {searchable ? (
              <TextInput
                style={[styles.input, { marginBottom: spacing.sm }]}
                placeholder="Cari..."
                placeholderTextColor={colors.muted}
                value={q}
                onChangeText={setQ}
                testID="select-search"
              />
            ) : null}
            <ScrollView keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <Text style={{ color: colors.muted, textAlign: "center", padding: spacing.lg }}>Tidak ada pilihan</Text>
              ) : filtered.map((o) => (
                <Pressable
                  key={o.value}
                  style={[styles.option, o.value === value && { backgroundColor: colors.brandTertiary }]}
                  onPress={() => { onChange(o.value); setOpen(false); setQ(""); }}
                  testID={`option-${o.value}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.onSurface, fontSize: 15, fontWeight: o.value === value ? "700" : "500" }}>{o.label}</Text>
                    {o.sublabel ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{o.sublabel}</Text> : null}
                  </View>
                  {o.value === value ? <Icon name="checkmark" size={20} color={colors.brandPrimary} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// Kalender ringan (cross-platform) — cocok untuk pengguna non-teknis.
export function DateField({ value, onChange, testID }: {
  value: string; onChange: (iso: string) => void; testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const base = value ? new Date(value + "T00:00:00") : new Date();
  const [viewY, setViewY] = useState(base.getFullYear());
  const [viewM, setViewM] = useState(base.getMonth());

  const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const first = new Date(viewY, viewM, 1);
  const startDay = (first.getDay() + 6) % 7; // Senin=0
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const pick = (d: number) => {
    const iso = `${viewY}-${String(viewM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    onChange(iso);
    setOpen(false);
  };

  return (
    <>
      <Pressable style={styles.input} onPress={() => setOpen(true)} testID={testID}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: value ? colors.onSurface : colors.muted, fontSize: 15 }}>
            {value ? fmtDate(value, true) : "Pilih tanggal"}
          </Text>
          <Icon name="calendar-outline" size={18} color={colors.muted} />
        </View>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.calendar, { marginBottom: insets.bottom }]} onPress={() => {}}>
            <View style={styles.calHeader}>
              <Pressable onPress={() => { const m = viewM - 1; if (m < 0) { setViewM(11); setViewY(viewY - 1); } else setViewM(m); }} hitSlop={10}>
                <Icon name="chevron-back" size={22} color={colors.onSurface} />
              </Pressable>
              <Text style={styles.calTitle}>{MONTHS[viewM]} {viewY}</Text>
              <Pressable onPress={() => { const m = viewM + 1; if (m > 11) { setViewM(0); setViewY(viewY + 1); } else setViewM(m); }} hitSlop={10}>
                <Icon name="chevron-forward" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
            <View style={styles.weekRow}>
              {["Sn", "Sl", "Rb", "Km", "Jm", "Sb", "Mg"].map((w) => (
                <Text key={w} style={styles.weekday}>{w}</Text>
              ))}
            </View>
            <View style={styles.grid}>
              {cells.map((d, i) => {
                const iso = d ? `${viewY}-${String(viewM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "";
                const isSel = iso === value;
                return (
                  <Pressable key={i} style={styles.cell} disabled={!d} onPress={() => d && pick(d)} testID={d ? `day-${d}` : undefined}>
                    {d ? (
                      <View style={[styles.dayInner, isSel && { backgroundColor: colors.brandPrimary }]}>
                        <Text style={{ color: isSel ? colors.onBrandPrimary : colors.onSurface, fontWeight: isSel ? "700" : "500", fontSize: 14 }}>{d}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <Button label="Hari Ini" variant="ghost" onPress={() => { const t = new Date(); setViewY(t.getFullYear()); setViewM(t.getMonth()); pick(t.getDate()); }} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export function Segmented({ value, options, onChange, testID }: {
  value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.segment} testID={testID}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={[styles.segmentItem, active && { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}
            onPress={() => onChange(o.value)}
            testID={`segment-${o.value}`}
          >
            <Text style={{ color: active ? colors.onSurface : colors.muted, fontWeight: active ? "700" : "500", fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Bottom sheet modal untuk form (keyboard-aware).
export function Sheet({ visible, onClose, title, children, footer, testID }: {
  visible: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode; testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.formSheet, { paddingTop: spacing.sm }]} testID={testID}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} testID="sheet-close">
              <Icon name="close" size={24} color={colors.onSurface} />
            </Pressable>
          </View>
          <KeyboardAwareScrollView
            bottomOffset={20}
            style={{ maxHeight: 520 }}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </KeyboardAwareScrollView>
          {footer ? <View style={[styles.sheetFooter, { paddingBottom: insets.bottom + spacing.md }]}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  label: { fontSize: 13, color: colors.onSurfaceSecondary, fontWeight: "600", marginBottom: 6 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 4 },
  input: {
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md,
    paddingVertical: 13, fontSize: 15, color: colors.onSurface, borderWidth: 1, borderColor: colors.border, minHeight: 48,
    justifyContent: "center",
  },
  rpWrap: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, minHeight: 48,
  },
  rpPrefix: { color: colors.muted, fontSize: 15, fontWeight: "700", marginRight: spacing.sm },
  rpInput: { flex: 1, fontSize: 16, color: colors.onSurface, fontWeight: "600", paddingVertical: 13 },
  backdrop: { flex: 1, backgroundColor: "rgba(28,27,24,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  formSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.sm },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  sheetTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface, fontWeight: "700" },
  sheetFooter: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, gap: spacing.sm },
  option: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: spacing.md, borderRadius: radius.md },
  calendar: { backgroundColor: colors.surface, borderRadius: radius.lg, margin: spacing.lg, padding: spacing.lg, alignSelf: "center", width: 340, maxWidth: "92%" },
  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  calTitle: { fontFamily: fonts.display, fontSize: 17, fontWeight: "700", color: colors.onSurface },
  weekRow: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", color: colors.muted, fontSize: 12, fontWeight: "700", marginBottom: spacing.xs },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", padding: 2 },
  dayInner: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  segment: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: 3, gap: 3 },
  segmentItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 9, borderRadius: radius.sm, borderWidth: 1, borderColor: "transparent" },
}));
