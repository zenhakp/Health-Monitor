"use client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { vitalStatus, vitalStatusColor, formatTime } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const VITAL_META: Record<string, { label: string; unit: string; color: string; normalMin?: number; normalMax?: number }> = {
  heart_rate: { label: "Heart Rate", unit: "bpm", color: "#3b82f6", normalMin: 60, normalMax: 100 },
  spo2: { label: "SpO₂", unit: "%", color: "#10b981", normalMin: 95, normalMax: 100 },
  blood_pressure_sys: { label: "Systolic BP", unit: "mmHg", color: "#f59e0b", normalMin: 90, normalMax: 140 },
  blood_pressure_dia: { label: "Diastolic BP", unit: "mmHg", color: "#8b5cf6", normalMin: 60, normalMax: 90 },
  temperature: { label: "Temperature", unit: "°C", color: "#ef4444", normalMin: 36.1, normalMax: 37.5 },
  respiratory_rate: { label: "Resp. Rate", unit: "/min", color: "#06b6d4", normalMin: 12, normalMax: 20 },
};

interface VitalsChartProps {
  data: any[];
  dataKey: string;
}

export default function VitalsChart({ data, dataKey }: VitalsChartProps) {
  const meta = VITAL_META[dataKey];
  const chartData = [...data].reverse().slice(-20).map(r => ({
    value: r[dataKey],
    time: formatTime(r.timestamp),
    is_anomaly: r.is_anomaly,
  }));

  const latest = chartData.at(-1)?.value;
  const prev = chartData.at(-2)?.value;
  const trend = latest && prev ? (latest > prev ? "up" : latest < prev ? "down" : "flat") : "flat";
  const status = latest ? vitalStatus(dataKey, latest) : "normal";
  const statusColor = vitalStatusColor(status);

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  return (
    <div className="vital-card p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs text-gray-500 font-medium">{meta.label}</div>
          <div className={`text-xl font-semibold mt-0.5 ${statusColor}`}>
            {latest?.toFixed(dataKey === "temperature" ? 1 : 0) ?? "—"}
            <span className="text-xs font-normal text-gray-500 ml-1">{meta.unit}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {status !== "normal" && (
            <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${
              status === "critical" ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"
            }`}>{status}</span>
          )}
          <TrendIcon className={`w-4 h-4 ${
            trend === "up" ? "text-orange-400" : trend === "down" ? "text-blue-400" : "text-gray-600"
          }`} />
        </div>
      </div>

      <ResponsiveContainer width="100%" height={72}>
        <LineChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)" />
          <XAxis dataKey="time" hide />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{ background: "#0f1623", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "12px" }}
            labelStyle={{ color: "#6b7280" }}
            itemStyle={{ color: meta.color }}
            formatter={(v: any) => [`${v?.toFixed(1)} ${meta.unit}`, meta.label]}
          />
          {meta.normalMin && <ReferenceLine y={meta.normalMin} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />}
          {meta.normalMax && <ReferenceLine y={meta.normalMax} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />}
          <Line
            type="monotone"
            dataKey="value"
            stroke={status === "critical" ? "#ef4444" : status === "warning" ? "#eab308" : meta.color}
            strokeWidth={1.5}
            dot={(props: any) => props.payload?.is_anomaly
              ? <circle key={props.key} cx={props.cx} cy={props.cy} r={3} fill="#ef4444" stroke="#1f2937" strokeWidth={1.5} />
              : <g key={props.key} />}
            activeDot={{ r: 3, fill: meta.color }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}