import { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/auth-context";
import { api } from "@/src/api";
import { Loading } from "@/src/components/ui";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    (async () => {
      if (user) {
        router.replace("/(tabs)");
        return;
      }
      try {
        const s = await api<{ needs_setup: boolean }>("/setup/status");
        router.replace(s.needs_setup ? "/setup" : "/login");
      } catch {
        router.replace("/login");
      }
    })();
  }, [user, loading]);

  return (
    <View style={{ flex: 1, backgroundColor: "#FAF8F5" }}>
      <Loading label="Memuat Arunika..." />
    </View>
  );
}
