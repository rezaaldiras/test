// Arunika — Grafik batang ringan (tanpa dependensi eksternal).
import { Text, View } from "react-native";

import { fmtRp } from "@/src/format";
import { makeStyles, spacing, useTheme } from "@/src/theme";

export function MiniBars({ labels, series, height = 120 }: {
  labels: string[];
  series: { data: number[]; color: string }[];
  height?: number;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const groups = labels.length;
  const max = Math.max(1, ...series.flatMap((s) => s.data.map((v) => Math.abs(v || 0))));

  return (
    <View style={{ marginTop: spacing.md }}>
      <View style={{ flexDirection: "row", height, alignItems: "flex-end" }}>
        {Array.from({ length: groups }).map((_, gi) => (
          <View key={gi} style={styles.group}>
            <View style={styles.bars}>
              {series.map((s, si) => {
                const v = Math.abs(s.data[gi] || 0);
                const h = Math.max(2, (v / max) * (height - 8));
                return <View key={si} style={{ width: 10, height: h, borderRadius: 3, backgroundColor: s.color }} />;
              })}
            </View>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row" }}>
        {labels.map((l, i) => (
          <Text key={i} style={[styles.label, { color: colors.muted }]}>{l}</Text>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  group: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  bars: { flexDirection: "row", gap: 3, alignItems: "flex-end" },
  label: { flex: 1, textAlign: "center", fontSize: 11, marginTop: 6 },
}));
