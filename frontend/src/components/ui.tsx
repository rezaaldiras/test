// Arunika — Komponen UI bersama: Card, Button, StatusPill, EmptyState, Loading, SectionTitle, dll.
import { ActivityIndicator, Pressable, StyleProp, Text, View, ViewStyle } from "react-native";

import Icon from "@/src/components/icon";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { STATUS_LABELS } from "@/src/format";

export function Card({ children, style, testID }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  const styles = useStyles();
  return <View style={[styles.card, style]} testID={testID}>{children}</View>;
}

export function DisplayTitle({ children, style }: { children: React.ReactNode; style?: any }) {
  const styles = useStyles();
  return <Text style={[styles.display, style]}>{children}</Text>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{children}</Text>
      {right}
    </View>
  );
}

type BtnVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export function Button({ label, onPress, variant = "primary", icon, loading, disabled, style, testID, small }: {
  label: string; onPress?: () => void; variant?: BtnVariant;
  icon?: React.ComponentProps<typeof Icon>["name"]; loading?: boolean; disabled?: boolean;
  style?: StyleProp<ViewStyle>; testID?: string; small?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const bg = variant === "primary" ? colors.brandPrimary
    : variant === "secondary" ? colors.brandSecondary
    : variant === "danger" ? colors.error
    : "transparent";
  const fg = variant === "outline" ? colors.onSurface
    : variant === "ghost" ? colors.brandPrimary
    : colors.onBrandPrimary;
  const border = variant === "outline" ? colors.borderStrong : "transparent";
  const isDisabled = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn, small && styles.btnSmall,
        { backgroundColor: bg, borderColor: border, borderWidth: variant === "outline" ? 1.5 : 0 },
        pressed && !isDisabled && { opacity: 0.85 },
        isDisabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : (
        <>
          {icon && <Icon name={icon} size={small ? 16 : 18} color={fg} />}
          <Text style={[styles.btnText, small && { fontSize: 13 }, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function StatusPill({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  const { colors } = useTheme();
  const map: Record<string, { bg: string; fg: string }> = {
    PAID: { bg: colors.brandTertiary, fg: colors.brandPrimary },
    POSTED: { bg: colors.brandTertiary, fg: colors.brandPrimary },
    OPEN: { bg: colors.brandTertiary, fg: colors.brandPrimary },
    PARTIAL: { bg: "#F5E9CC", fg: colors.warning },
    UNPAID: { bg: "#F5E1DC", fg: colors.error },
    DRAFT: { bg: colors.surfaceTertiary, fg: colors.onSurfaceTertiary },
    VOID: { bg: colors.surfaceTertiary, fg: colors.muted },
    DELETED: { bg: colors.surfaceTertiary, fg: colors.muted },
    CLOSED: { bg: "#F5E1DC", fg: colors.error },
    LOCKED: { bg: "#F5E9CC", fg: colors.warning },
  };
  const c = map[status] || { bg: colors.surfaceTertiary, fg: colors.onSurfaceTertiary };
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: radius.pill, paddingHorizontal: size === "sm" ? 8 : 10, paddingVertical: size === "sm" ? 2 : 4, alignSelf: "flex-start" }}>
      <Text style={{ color: c.fg, fontSize: size === "sm" ? 10 : 12, fontWeight: "700" }}>
        {STATUS_LABELS[status] || status}
      </Text>
    </View>
  );
}

export function EmptyState({ icon = "document-text-outline", title, subtitle, action, testID }: {
  icon?: React.ComponentProps<typeof Icon>["name"]; title: string; subtitle?: string;
  action?: React.ReactNode; testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.empty} testID={testID}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={34} color={colors.brandPrimary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
      {action ? <View style={{ marginTop: spacing.md }}>{action}</View> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.loading} testID="loading-indicator">
      <ActivityIndicator size="large" color={colors.brandPrimary} />
      {label ? <Text style={styles.loadingText}>{label}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.empty} testID="error-state">
      <View style={[styles.emptyIcon, { backgroundColor: "#F5E1DC" }]}>
        <Icon name="alert-circle-outline" size={34} color={colors.error} />
      </View>
      <Text style={styles.emptyTitle}>Gagal memuat data</Text>
      <Text style={styles.emptySub}>{message}</Text>
      {onRetry ? <View style={{ marginTop: spacing.md }}><Button label="Coba Lagi" icon="refresh" variant="outline" onPress={onRetry} /></View> : null}
    </View>
  );
}

export function KeyValue({ label, value, valueColor, strong }: {
  label: string; value: string; valueColor?: string; strong?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={[styles.kvValue, strong && { fontWeight: "800", fontSize: 15 }, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm }} />;
}

const useStyles = makeStyles((colors) => ({
  card: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  display: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface, fontWeight: "700" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  section: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, fontWeight: "700" },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    paddingVertical: 14, paddingHorizontal: spacing.lg, borderRadius: radius.md, minHeight: 48,
  },
  btnSmall: { paddingVertical: 8, paddingHorizontal: spacing.md, minHeight: 36 },
  btnText: { fontSize: 15, fontWeight: "700" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  emptyIcon: {
    width: 72, height: 72, borderRadius: radius.lg, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
  },
  emptyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, fontWeight: "700", textAlign: "center" },
  emptySub: { fontSize: 14, color: colors.muted, textAlign: "center", marginTop: spacing.xs, lineHeight: 20 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  loadingText: { color: colors.muted, fontSize: 14 },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, gap: spacing.md },
  kvLabel: { color: colors.muted, fontSize: 14, flex: 1 },
  kvValue: { color: colors.onSurface, fontSize: 14, fontWeight: "600", textAlign: "right" },
}));
