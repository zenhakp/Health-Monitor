import { clsx, type ClassValue } from "clsx";
import { format, formatDistanceToNow } from "date-fns";

const IST_TIMEZONE = "Asia/Kolkata";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function parseDate(date: string | Date) {
  if (date instanceof Date) return date;
  if (typeof date !== "string") return new Date(date);

  const trimmed = date.trim();
  const normalized = trimmed.replace(" ", "T");
  const hasTimezone = /([+-]\d{2}:\d{2}|Z)$/i.test(normalized);
  return new Date(hasTimezone ? normalized : `${normalized}Z`);
}

export function formatDate(date: string | Date) {
  const parsed = parseDate(date);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

export function formatTime(date: string | Date) {
  const parsed = parseDate(date);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(parsed);
}

export function formatDateTime(date: string | Date) {
  const parsed = parseDate(date);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

export function timeAgo(date: string | Date) {
  return formatDistanceToNow(parseDate(date), { addSuffix: true });
}

export function normalizeDoctorName(fullName: string) {
  if (!fullName) return "Dr. Unknown";
  const cleaned = fullName
    .split(" ")
    .filter(Boolean)
    .filter((part) => !/^dr\.?$/i.test(part))
    .join(" ");
  return cleaned ? `Dr. ${cleaned}` : "Dr. Unknown";
}

export function dedupeAlerts(alerts: any[]) {
  const seen = new Set<string>();
  return alerts.filter((alert) => {
    const text = (alert.llm_interpretation || alert.anomaly_type || "")
      .toString()
      .trim()
      .replace(/\s+/g, " ");
    const createdAt = alert.created_at
      ? new Date(alert.created_at).toISOString().slice(0, 16)
      : "";
    const key = [
      alert.anomaly_type || "",
      text.slice(0, 120),
      alert.vital_id || alert.patient_id || "",
      createdAt,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function severityColor(severity: string) {
  switch (severity) {
    case "critical":
      return {
        text: "text-red-400",
        bg: "bg-red-500/10",
        border: "border-red-500/30",
        dot: "bg-red-500",
      };
    case "high":
      return {
        text: "text-orange-400",
        bg: "bg-orange-500/10",
        border: "border-orange-500/30",
        dot: "bg-orange-500",
      };
    case "medium":
      return {
        text: "text-yellow-400",
        bg: "bg-yellow-500/10",
        border: "border-yellow-500/30",
        dot: "bg-yellow-500",
      };
    default:
      return {
        text: "text-blue-400",
        bg: "bg-blue-500/10",
        border: "border-blue-500/30",
        dot: "bg-blue-500",
      };
  }
}

export function vitalStatus(
  key: string,
  value: number,
): "normal" | "warning" | "critical" {
  const ranges: Record<
    string,
    { normal: [number, number]; warning: [number, number] }
  > = {
    heart_rate: { normal: [60, 100], warning: [50, 130] },
    spo2: { normal: [95, 100], warning: [90, 95] },
    blood_pressure_sys: { normal: [90, 140], warning: [80, 180] },
    blood_pressure_dia: { normal: [60, 90], warning: [50, 110] },
    temperature: { normal: [36.1, 37.5], warning: [35.5, 38.5] },
    respiratory_rate: { normal: [12, 20], warning: [10, 24] },
  };
  const r = ranges[key];
  if (!r) return "normal";
  if (value >= r.normal[0] && value <= r.normal[1]) return "normal";
  if (value >= r.warning[0] && value <= r.warning[1]) return "warning";
  return "critical";
}

export function vitalStatusColor(status: "normal" | "warning" | "critical") {
  switch (status) {
    case "normal":
      return "text-green-400";
    case "warning":
      return "text-yellow-400";
    case "critical":
      return "text-red-400";
  }
}

export function calculateHealthScore(vitals: any): number {
  if (!vitals) return 0;
  let score = 100;
  const {
    heart_rate,
    spo2,
    blood_pressure_sys,
    blood_pressure_dia,
    temperature,
    respiratory_rate,
  } = vitals;

  // Deduct points for out-of-range vitals
  if (heart_rate < 60 || heart_rate > 100)
    score -= Math.min(20, Math.abs(heart_rate - 80) / 2);
  if (spo2 < 95) score -= (95 - spo2) * 5;
  if (blood_pressure_sys > 140 || blood_pressure_sys < 90) score -= 15;
  if (temperature > 37.5 || temperature < 36.1) score -= 10;
  if (respiratory_rate > 20 || respiratory_rate < 12) score -= 8;
  if (vitals.is_anomaly) score -= 20;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function healthScoreColor(score: number) {
  if (score >= 80)
    return { text: "text-green-400", label: "Good", bg: "bg-green-500" };
  if (score >= 60)
    return { text: "text-yellow-400", label: "Fair", bg: "bg-yellow-500" };
  return { text: "text-red-400", label: "Poor", bg: "bg-red-500" };
}
