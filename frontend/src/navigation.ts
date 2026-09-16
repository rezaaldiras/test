import { Platform } from "react-native";

// iOS 26+ mendapat NativeTabs (Liquid Glass); selain itu pakai Tabs klasik.
export const usesNativeTabs =
  Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;
