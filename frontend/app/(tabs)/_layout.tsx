import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";

import Icon from "@/src/components/icon";
import { usesNativeTabs } from "@/src/navigation";
import { useTheme } from "@/src/theme";

export default function TabsLayout() {
  const { colors } = useTheme();

  if (usesNativeTabs) {
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="house.fill" />
          <NativeTabs.Trigger.Label>Beranda</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="transactions">
          <NativeTabs.Trigger.Icon sf="arrow.left.arrow.right" />
          <NativeTabs.Trigger.Label>Transaksi</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="accounting">
          <NativeTabs.Trigger.Icon sf="book.closed.fill" />
          <NativeTabs.Trigger.Label>Akuntansi</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="reports">
          <NativeTabs.Trigger.Icon sf="chart.bar.fill" />
          <NativeTabs.Trigger.Label>Laporan</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.divider,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Beranda", tabBarIcon: ({ color }) => <Icon name="home" size={22} color={color} /> }} />
      <Tabs.Screen name="transactions" options={{ title: "Transaksi", tabBarIcon: ({ color }) => <Icon name="swap-horizontal" size={24} color={color} /> }} />
      <Tabs.Screen name="accounting" options={{ title: "Akuntansi", tabBarIcon: ({ color }) => <Icon name="book" size={22} color={color} /> }} />
      <Tabs.Screen name="reports" options={{ title: "Laporan", tabBarIcon: ({ color }) => <Icon name="bar-chart" size={22} color={color} /> }} />
    </Tabs>
  );
}
