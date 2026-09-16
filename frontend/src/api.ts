// Arunika — API client (fetch + JWT access/refresh berotasi) & React Query hooks.
import { storage } from "@/src/utils/storage";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "") + "/api";

const ACCESS_KEY = "arunika_access";
const REFRESH_KEY = "arunika_refresh";

let accessToken: string | null = null;

export async function loadTokens() {
  accessToken = await storage.secureGet<string>(ACCESS_KEY, "");
  return accessToken;
}

export async function setTokens(access: string, refresh: string) {
  accessToken = access;
  await storage.secureSet(ACCESS_KEY, access);
  await storage.secureSet(REFRESH_KEY, refresh);
}

export async function clearTokens() {
  accessToken = null;
  await storage.secureRemove(ACCESS_KEY);
  await storage.secureRemove(REFRESH_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function refreshAccess(): Promise<boolean> {
  const refresh = await storage.secureGet<string>(REFRESH_KEY, "");
  if (!refresh) return false;
  try {
    const r = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!r.ok) return false;
    const data = await r.json();
    await setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export async function api<T = any>(
  path: string,
  options: { method?: string; body?: any; retry?: boolean } = {},
): Promise<T> {
  const { method = "GET", body, retry = true } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Tidak dapat terhubung ke server. Periksa koneksi internet Anda.", 0);
  }

  if (res.status === 401 && retry) {
    const ok = await refreshAccess();
    if (ok) return api<T>(path, { ...options, retry: false });
    await clearTokens();
    throw new ApiError("Sesi Anda telah berakhir. Silakan login kembali.", 401);
  }

  if (res.status === 204) return undefined as T;

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const detail = data?.detail;
    const msg = typeof detail === "string" ? detail
      : Array.isArray(detail) ? (detail[0]?.msg || "Data yang dikirim tidak valid.")
      : "Terjadi kesalahan. Coba lagi.";
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export function qs(params: Record<string, any>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") sp.append(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}
