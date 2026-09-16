import { FlatList, Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Loading, StatusPill } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { makeStyles, spacing, useTheme } from "@/src/theme";

export default function PeriodsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const canWrite = can("periods", "write");

  const { data, isLoading } = useQuery({ queryKey: ["periods"], queryFn: () => api<any>("/periods") });

  const act = useMutation({
    mutationFn: (v: { id: string; action: string }) => api(`/periods/${v.id}/${v.action}`, { method: "POST" }),
    onSuccess: () => { toast.show("Periode diperbarui.", "success"); qc.invalidateQueries({ queryKey: ["periods"] }); },
    onError: (e: any) => toast.show(e?.message || "Gagal.", "error"),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Periode Akuntansi" back subtitle="Buka / tutup periode pembukuan" />
      {isLoading ? <Loading /> : (
        <FlatList
          data={data?.items || []}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm }}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{item.label}</Text>
                  <StatusPill status={item.status} size="sm" />
                </View>
                {canWrite ? (
                  item.status === "OPEN" ? (
                    <Button label="Tutup" variant="outline" small icon="lock-closed-outline"
                      onPress={() => act.mutate({ id: item.id, action: "close" })} testID={`close-${item.label}`} />
                  ) : item.status === "CLOSED" ? (
                    <Button label="Buka Kembali" variant="ghost" small icon="lock-open-outline"
                      onPress={() => act.mutate({ id: item.id, action: "reopen" })} testID={`reopen-${item.label}`} />
                  ) : null
                ) : null}
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  label: { fontSize: 15, color: colors.onSurface, fontWeight: "700", marginBottom: 6 },
}));
