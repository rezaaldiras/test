import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { useAuth } from "@/src/auth-context";
import { ApiError } from "@/src/api";
import { useToast } from "@/src/components/toast";
import { Button } from "@/src/components/ui";
import { Field, TextField } from "@/src/components/form";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";

export default function Setup() {
  const { bootstrap } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!company.trim() || !name.trim() || !email.trim() || password.length < 8) {
      toast.show("Lengkapi semua kolom. Kata sandi minimal 8 karakter.", "error");
      return;
    }
    setLoading(true);
    try {
      await bootstrap({ company_name: company.trim(), name: name.trim(), email: email.trim(), password });
      toast.show("Selamat datang! Akun Super Admin & bagan akun standar telah dibuat.", "success");
      router.replace("/(tabs)");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Gagal membuat akun.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ flexGrow: 1, padding: spacing.xl, paddingTop: insets.top + spacing.xxl }}
      bottomOffset={20}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.logo}><Text style={styles.logoText}>A</Text></View>
      <Text style={styles.title}>Selamat Datang di Arunika</Text>
      <Text style={styles.subtitle}>
        Siapkan BUMKam Anda. Akun ini menjadi Super Admin dan bagan akun standar Indonesia akan dibuat otomatis.
      </Text>

      <View style={styles.card}>
        <Field label="Nama BUMKam" required>
          <TextField value={company} onChangeText={setCompany} placeholder="BUMKam Maju Bersama" testID="setup-company" />
        </Field>
        <Field label="Nama Lengkap Anda" required>
          <TextField value={name} onChangeText={setName} placeholder="Budi Santoso" testID="setup-name" />
        </Field>
        <Field label="Email" required>
          <TextField value={email} onChangeText={setEmail} placeholder="admin@bumkam.id"
            keyboardType="email-address" autoCapitalize="none" testID="setup-email" />
        </Field>
        <Field label="Kata Sandi" required hint="Minimal 8 karakter.">
          <TextField value={password} onChangeText={setPassword} placeholder="••••••••"
            secureTextEntry autoCapitalize="none" testID="setup-password" />
        </Field>
        <Button label="Buat & Mulai" icon="rocket-outline" onPress={onSubmit} loading={loading}
          testID="setup-submit" style={{ marginTop: spacing.sm }} />
      </View>
    </KeyboardAwareScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  logo: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  logoText: { fontFamily: fonts.display, fontSize: 30, color: colors.onBrandPrimary, fontWeight: "700" },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface, fontWeight: "700" },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.xl, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: spacing.xl, borderWidth: 1, borderColor: colors.border },
}));
