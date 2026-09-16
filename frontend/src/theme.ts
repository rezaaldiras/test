// Arunika — design tokens (Editorial Mobile LIGHT). Values from design_guidelines.json.
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FAF8F5",
  onSurface: "#1C1B18",
  surfaceSecondary: "#F3EFEA",
  onSurfaceSecondary: "#2C2A26",
  surfaceTertiary: "#EAE5DC",
  onSurfaceTertiary: "#3C3833",
  surfaceInverse: "#1C1B18",
  onSurfaceInverse: "#FAF8F5",
  muted: "#756F64",

  brand: "#3B5338",
  onBrand: "#FAF8F5",
  brandPrimary: "#3B5338",
  onBrandPrimary: "#FAF8F5",
  brandSecondary: "#8C6D46",
  onBrandSecondary: "#FAF8F5",
  brandTertiary: "#E4EADF",
  onBrandTertiary: "#233321",

  success: "#3B5338",
  onSuccess: "#FAF8F5",
  warning: "#A67C00",
  onWarning: "#FAF8F5",
  error: "#A63A2B",
  onError: "#FAF8F5",
  info: "#2B4C6F",
  onInfo: "#FAF8F5",

  border: "#E2DDD5",
  borderStrong: "#C8C0B3",
  divider: "#EFECE6",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

// spacing & radius tokens (from design guidelines)
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
export const fonts = {
  display: "PlayfairDisplay",
  displayFallback: "serif",
  text: "DMSans",
  mono: "SpaceMono",
};

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
