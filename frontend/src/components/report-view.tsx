// Arunika — Renderer laporan generik {title, meta, columns, sections[]}.
import { ScrollView, Text, View } from "react-native";

import { fmtRp2 } from "@/src/format";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Section = { title: string | null; rows: any[][]; footers: any[][] };
export type Report = { title: string; meta: string[]; columns: string[]; sections: Section[] };

function isNum(v: any): v is number {
  return typeof v === "number";
}

export function ReportView({ report }: { report: Report }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const cols = report.columns || [];
  // Kolom angka: kolom yang labelnya mengandung Debit/Kredit/Jumlah/Saldo/Tagihan
  const numCols = cols.map((c) =>
    /debit|kredit|jumlah|saldo|tagihan/i.test(c));

  const renderRow = (row: any[], footer = false, key?: string) => (
    <View key={key} style={[styles.tr, footer && styles.footerRow]}>
      {cols.map((_, ci) => {
        const v = row[ci];
        const num = isNum(v);
        return (
          <Text
            key={ci}
            style={[
              styles.td,
              ci === 0 ? styles.tdFirst : null,
              (numCols[ci] || num) ? styles.tdNum : null,
              footer ? styles.tdFooter : null,
            ]}
            numberOfLines={2}
          >
            {num ? fmtRp2(v) : (v === "" || v === null || v === undefined ? "" : String(v))}
          </Text>
        );
      })}
    </View>
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{report.title}</Text>
      {report.meta?.map((m, i) => <Text key={i} style={styles.meta}>{m}</Text>)}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.md }}>
        <View style={{ minWidth: 520 }}>
          <View style={[styles.tr, styles.headRow]}>
            {cols.map((c, i) => (
              <Text key={i} style={[styles.th, i === 0 ? styles.tdFirst : null, numCols[i] ? styles.tdNum : null]}>{c}</Text>
            ))}
          </View>
          {report.sections?.map((sec, si) => (
            <View key={si}>
              {sec.title ? (
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionTitle}>{sec.title}</Text>
                </View>
              ) : null}
              {sec.rows.map((r, ri) => renderRow(r, false, `r-${si}-${ri}`))}
              {sec.footers?.map((r, ri) => renderRow(r, true, `f-${si}-${ri}`))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, fontWeight: "700" },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  headRow: { backgroundColor: colors.brandPrimary, borderRadius: radius.sm },
  th: { flex: 1, minWidth: 80, color: colors.onBrandPrimary, fontSize: 11, fontWeight: "800", paddingVertical: 8, paddingHorizontal: 6 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.divider },
  td: { flex: 1, minWidth: 80, color: colors.onSurface, fontSize: 12, paddingVertical: 7, paddingHorizontal: 6 },
  tdFirst: { minWidth: 80, maxWidth: 90 },
  tdNum: { textAlign: "right", fontFamily: fonts.mono, fontSize: 11 },
  tdFooter: { fontWeight: "800" },
  footerRow: { backgroundColor: colors.brandTertiary },
  sectionTitleRow: { backgroundColor: colors.surfaceTertiary, paddingVertical: 6, paddingHorizontal: 6, marginTop: 4 },
  sectionTitle: { fontSize: 12, fontWeight: "800", color: colors.onSurfaceTertiary, letterSpacing: 0.5 },
}));
