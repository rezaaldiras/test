import { ScrollView, Text, View } from "react-native";
import { Pressable } from "react-native";
import { useRouter } from "expo-router";

import Icon from "@/src/components/icon";
import { ScreenHeader } from "@/src/components/header";
import { useAuth } from "@/src/auth-context";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type MenuItem = { title: string; subtitle: string; icon: any; route: string; module: string };

export function MenuHub({ title, subtitle, items }: { title: string; subtitle: string; items: MenuItem[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { can } = useAuth();
  const visible = items.filter((i) => can(i.module));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={title} subtitle={subtitle} showUnit />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
        {visible.map((item) => (
          <Pressable key={item.route} style={styles.row} onPress={() => router.push(item.route as any)}
            testID={`menu-${item.route}`}>
            <View style={styles.iconWrap}>
              <Icon name={item.icon} size={24} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowSub}>{item.subtitle}</Text>
            </View>
            <Icon name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  iconWrap: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 16, color: colors.onSurface, fontWeight: "700" },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
}));
