// Arunika — unduh & bagikan file ekspor (CSV/Excel/PDF) lintas platform.
import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { api, qs } from "@/src/api";

export async function exportReport(params: {
  report: string; format: "csv" | "xlsx" | "pdf";
  from_?: string; to?: string; as_of?: string; account_code?: string; unit_id?: string;
}): Promise<void> {
  const res = await api<{ filename: string; content: string; mime: string }>(`/export${qs(params)}`);

  if (Platform.OS === "web") {
    const bin = atob(res.content);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: res.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, res.filename);
  try { file.delete(); } catch { /* belum ada */ }
  file.create();
  const bin = atob(res.content);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  file.write(bytes);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: res.mime, dialogTitle: res.filename });
  }
}
