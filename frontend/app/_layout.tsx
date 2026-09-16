import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { ToastProvider } from "@/src/components/toast";
import { AuthProvider } from "@/src/auth-context";
import { queryClient } from "@/src/query-client";

LogBox.ignoreAllLogs(true);

export default function RootLayout() {
  const [loaded] = useFonts({
    PlayfairDisplay: require("../assets/fonts/PlayfairDisplay.ttf"),
    DMSans: require("../assets/fonts/DMSans.ttf"),
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <ToastProvider>
                <AuthProvider>
                  <StatusBar style="dark" />
                  {loaded ? (
                    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FAF8F5" } }} />
                  ) : (
                    <View style={{ flex: 1, backgroundColor: "#FAF8F5" }} />
                  )}
                </AuthProvider>
              </ToastProvider>
            </KeyboardProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
