import { useState } from "react";
import { Image, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { useAuth } from "@/src/auth-context";
import { ApiError } from "@/src/api";
import { useToast } from "@/src/components/toast";
import { Button } from "@/src/components/ui";
import { Field, TextField } from "@/src/components/form";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      toast.show("Email dan kata sandi wajib diisi.", "error");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Gagal masuk. Coba lagi.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: spacing.xl, paddingTop: insets.top + spacing.xl }}
      bottomOffset={20}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.brandRow}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>A</Text>
        </View>
        <View>
          <Text style={styles.title}>Arunika</Text>
          <Text style={styles.subtitle}>Keuangan & Akuntansi BUMKam</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.welcome}>Masuk ke akun Anda</Text>
        <Field label="Email" required>
          <TextField value={email} onChangeText={setEmail} placeholder="nama@bumkam.id"
            keyboardType="email-address" autoCapitalize="none" testID="login-email" />
        </Field>
        <Field label="Kata Sandi" required>
          <TextField value={password} onChangeText={setPassword} placeholder="••••••••"
            secureTextEntry autoCapitalize="none" testID="login-password" />
        </Field>
        <Button label="Masuk" icon="log-in-outline" onPress={onSubmit} loading={loading} testID="login-submit"
          style={{ marginTop: spacing.sm }} />
      </View>
      <Text style={styles.footer}>Sistem keuangan terintegrasi untuk Badan Usaha Milik Kampung</Text>
    </KeyboardAwareScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.xl, justifyContent: "center" },
  logo: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  logoText: { fontFamily: fonts.display, fontSize: 30, color: colors.onBrandPrimary, fontWeight: "700" },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.onSurface, fontWeight: "700" },
  subtitle: { fontSize: 13, color: colors.muted },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: spacing.xl, borderWidth: 1, borderColor: colors.border },
  welcome: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface, fontWeight: "700", marginBottom: spacing.lg },
  footer: { textAlign: "center", color: colors.muted, fontSize: 12, marginTop: spacing.xl, paddingHorizontal: spacing.xl },
}));
