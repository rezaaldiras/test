// Arunika — Auth & konteks aplikasi (user, unit usaha aktif, izin RBAC).
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { api, clearTokens, loadTokens, setTokens } from "@/src/api";
import { storage } from "@/src/utils/storage";

export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  company_name?: string;
};

type RoleMatrix = Record<string, Record<string, string>>;

type Ctx = {
  user: User | null;
  loading: boolean;
  matrix: RoleMatrix;
  activeUnit: string; // "" = semua unit
  setActiveUnit: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  bootstrap: (payload: {
    company_name: string; name: string; email: string; password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  can: (module: string, level?: "read" | "write") => boolean;
};

const AuthContext = createContext<Ctx>({} as Ctx);
export const useAuth = () => useContext(AuthContext);

const UNIT_KEY = "arunika_active_unit";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [matrix, setMatrix] = useState<RoleMatrix>({});
  const [loading, setLoading] = useState(true);
  const [activeUnit, setActiveUnitState] = useState("");
  const queryClient = useQueryClient();

  const loadMatrix = async () => {
    try {
      const data = await api<{ matrix: RoleMatrix }>("/roles");
      setMatrix(data.matrix || {});
    } catch {
      setMatrix({});
    }
  };

  const refreshUser = async () => {
    const me = await api<User>("/auth/me");
    setUser(me);
    await loadMatrix();
  };

  useEffect(() => {
    (async () => {
      await loadTokens();
      const savedUnit = await storage.getItem<string>(UNIT_KEY, "");
      if (savedUnit) setActiveUnitState(savedUnit);
      try {
        await refreshUser();
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setActiveUnit = (id: string) => {
    setActiveUnitState(id);
    storage.setItem(UNIT_KEY, id);
    queryClient.invalidateQueries();
  };

  const login = async (email: string, password: string) => {
    const data = await api<{ access_token: string; refresh_token: string; user: User }>(
      "/auth/login", { method: "POST", body: { email, password } });
    await setTokens(data.access_token, data.refresh_token);
    setUser(data.user);
    await loadMatrix();
  };

  const bootstrap = async (payload: {
    company_name: string; name: string; email: string; password: string;
  }) => {
    const data = await api<{ access_token: string; refresh_token: string; user: User }>(
      "/setup/bootstrap", { method: "POST", body: payload });
    await setTokens(data.access_token, data.refresh_token);
    setUser(data.user);
    // seed chart of accounts otomatis untuk admin baru
    try { await api("/setup/seed-coa", { method: "POST" }); } catch { /* ignore */ }
    await loadMatrix();
  };

  const logout = async () => {
    try {
      const refresh = await storage.secureGet<string>("arunika_refresh", "");
      if (refresh) await api("/auth/logout", { method: "POST", body: { refresh_token: refresh }, retry: false });
    } catch { /* ignore */ }
    await clearTokens();
    setUser(null);
    queryClient.clear();
  };

  const can = (module: string, level: "read" | "write" = "read") => {
    if (!user) return false;
    const lvl = matrix[user.role]?.[module] || "none";
    if (level === "write") return lvl === "write";
    return lvl === "read" || lvl === "write";
  };

  const value = useMemo(
    () => ({ user, loading, matrix, activeUnit, setActiveUnit, login, bootstrap, logout, refreshUser, can }),
    [user, loading, matrix, activeUnit],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
