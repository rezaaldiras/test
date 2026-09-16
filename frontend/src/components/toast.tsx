// Arunika — Toast global (sukses/error/info). Dipasang tinggi di root.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Icon from "@/src/components/icon";
import { makeStyles, spacing, radius, useTheme } from "@/src/theme";

type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; message: string; type: ToastType };

const ToastContext = createContext<{ show: (m: string, t?: ToastType) => void }>({ show: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();

  const hide = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
  }, [anim]);

  const show = useCallback((message: string, type: ToastType = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, type });
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
    timer.current = setTimeout(hide, 3500);
  }, [anim, hide]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const bg = toast?.type === "success" ? colors.success
    : toast?.type === "error" ? colors.error : colors.surfaceInverse;
  const iconName = toast?.type === "success" ? "checkmark-circle"
    : toast?.type === "error" ? "alert-circle" : "information-circle";

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.wrap, { top: insets.top + spacing.sm, opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}
        >
          <Pressable onPress={hide} style={[styles.toast, { backgroundColor: bg }]} testID="toast-message">
            <Icon name={iconName} size={20} color={colors.onSurfaceInverse} />
            <Text style={styles.text} numberOfLines={3}>{toast.message}</Text>
          </Pressable>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { position: "absolute", left: spacing.lg, right: spacing.lg, zIndex: 9999, alignItems: "center" },
  toast: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.md,
    maxWidth: 520, width: "100%",
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  text: { color: colors.onSurfaceInverse, fontSize: 14, flex: 1, fontWeight: "500" },
}));
