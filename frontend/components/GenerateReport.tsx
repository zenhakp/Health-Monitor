"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";
import { formatDateTime } from "@/lib/utils";
import toast from "react-hot-toast";
import { FileText, Download } from "lucide-react";

interface GenerateReportProps {
  patientId: string;
  patientName: string;
}

export default function GenerateReport({
  patientId,
  patientName,
}: GenerateReportProps) {
  const [generating, setGenerating] = useState(false);
  const [days, setDays] = useState(30);

  const generateReport = async () => {
    setGenerating(true);
    try {
      const res = await api.get(
        `/api/v1/analytics/report/${patientId}?days=${days}`,
      );
      const data = res.data;

      // Generate HTML report using IST formatted timestamp
      const generatedAt = formatDateTime(data.generated_at);

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Health Report — ${data.patient_name}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1f2937; }
    .header { border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 30px; }
    .logo { color: #3b82f6; font-size: 20px; font-weight: bold; }
    h1 { font-size: 24px; margin: 8px 0 4px; }
    .meta { color: #6b7280; font-size: 14px; }
    .section { margin-bottom: 30px; }
    .section h2 { font-size: 16px; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 16px; }
    .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .stat-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; color: #1f2937; }
    .stat-label { font-size: 12px; color: #6b7280; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 8px 12px; background: #f3f4f6; font-size: 13px; color: #374151; }
    td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-ok { background: #dcfce7; color: #166534; }
    .badge-warn { background: #fef3c7; color: #92400e; }
    .badge-bad { background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">❤ VitalWatch</div>
    <h1>Health Report — ${data.patient_name}</h1>
    <div class="meta">
      Period: Last ${data.period_days} days · Generated: ${generatedAt}
    </div>
  </div>

  <div class="section">
    <h2>Summary</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${data.total_readings}</div>
        <div class="stat-label">Total Readings</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${data.anomaly_count}</div>
        <div class="stat-label">Anomalies Detected</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${data.anomaly_rate}%</div>
        <div class="stat-label">Anomaly Rate</div>
      </div>
    </div>
  </div>

  ${
    data.vitals_summary
      ? `
  <div class="section">
    <h2>Vitals Summary (${data.period_days}-Day Average)</h2>
    <table>
      <tr>
        <th>Vital Sign</th>
        <th>Average</th>
        <th>Min</th>
        <th>Max</th>
        <th>Std Dev</th>
        <th>Status</th>
      </tr>
      ${[
        ["Heart Rate", "heart_rate", "bpm", 60, 100],
        ["SpO₂", "spo2", "%", 95, 100],
        ["Systolic BP", "blood_pressure_sys", "mmHg", 90, 140],
        ["Diastolic BP", "blood_pressure_dia", "mmHg", 60, 90],
        ["Temperature", "temperature", "°C", 36.1, 37.5],
        ["Respiratory Rate", "respiratory_rate", "/min", 12, 20],
      ]
        .map(([label, key, unit, min, max]) => {
          const v = data.vitals_summary[key as string];
          if (!v) return "";
          const ok = v.mean >= (min as number) && v.mean <= (max as number);
          const status = ok
            ? `<span class="badge badge-ok">Normal</span>`
            : `<span class="badge badge-warn">Review</span>`;
          return `<tr>
          <td>${label}</td>
          <td><strong>${v.mean} ${unit}</strong></td>
          <td>${v.min} ${unit}</td>
          <td>${v.max} ${unit}</td>
          <td>±${v.std}</td>
          <td>${status}</td>
        </tr>`;
        })
        .join("")}
    </table>
  </div>
  `
      : ""
  }

  <div class="footer">
    This report is generated automatically by VitalWatch AI Health Monitoring Platform.<br>
    This is not a substitute for professional medical advice. Please consult your physician for clinical decisions.
  </div>
</body>
</html>`;

      // Open in new tab for printing/saving as PDF
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (win) {
        win.onload = () => {
          setTimeout(() => {
            win.print();
            URL.revokeObjectURL(url);
          }, 500);
        };
      }
      toast.success("Report generated — use Ctrl+P to save as PDF");
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <select
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
        className="bg-dark-800 border border-dark-600 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
      >
        <option value={7}>Last 7 days</option>
        <option value={14}>Last 14 days</option>
        <option value={30}>Last 30 days</option>
      </select>
      <button
        onClick={generateReport}
        disabled={generating}
        className="flex items-center gap-2 text-xs bg-dark-900 border border-dark-600 hover:border-blue-500/50 text-gray-300 hover:text-white px-4 py-2 rounded-xl transition-all"
      >
        {generating ? (
          <Spinner size="sm" />
        ) : (
          <FileText className="w-3.5 h-3.5" />
        )}
        Generate Health Report
      </button>
    </div>
  );
}
