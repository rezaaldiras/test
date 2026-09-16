// Arunika — util format Bahasa Indonesia (Rupiah, tanggal, angka).
export function fmtRp(n: number | string | null | undefined, withSymbol = true): string {
  const v = Number(n || 0);
  const sign = v < 0 ? "-" : "";
  const s = Math.abs(v)
    .toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return `${sign}${withSymbol ? "Rp " : ""}${s}`;
}

export function fmtRp2(n: number | string | null | undefined): string {
  const v = Number(n || 0);
  const sign = v < 0 ? "-" : "";
  const s = Math.abs(v).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}Rp ${s}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTHS_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function fmtDate(iso: string | null | undefined, full = false): string {
  if (!iso) return "-";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d.getTime())) return iso;
  const m = full ? MONTHS_FULL[d.getMonth()] : MONTHS[d.getMonth()];
  return `${d.getDate()} ${m} ${d.getFullYear()}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${fmtDate(iso)} ${hh}:${mm}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  if (!m) return `Tahun ${y}`;
  return `${MONTHS_FULL[Number(m) - 1]} ${y}`;
}

export function parseNumber(text: string): number {
  const cleaned = (text || "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export function fmtInputRp(text: string): string {
  const n = parseNumber(text);
  if (!n) return "";
  return n.toLocaleString("id-ID");
}

export const STATUS_LABELS: Record<string, string> = {
  UNPAID: "Belum Lunas", PARTIAL: "Sebagian", PAID: "Lunas", VOID: "Dibatalkan",
  POSTED: "Diposting", DRAFT: "Draf", DELETED: "Dihapus", OPEN: "Terbuka",
  CLOSED: "Ditutup", LOCKED: "Dikunci",
};
