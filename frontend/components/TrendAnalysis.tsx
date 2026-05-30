"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";

const VITAL_META: Record<
  string,
  {
    label: string;
    unit: string;
    color: string;
    normalMin: number;
    normalMax: number;
  }
> = {
  heart_rate: {
    label: "Heart Rate",
    unit: "bpm",
    color: "#3b82f6",
    normalMin: 60,
    normalMax: 100,
  },
  spo2: {
    label: "SpO₂",
    unit: "%",
    color: "#10b981",
    normalMin: 95,
    normalMax: 100,
  },
  blood_pressure_sys: {
    label: "Systolic BP",
    unit: "mmHg",
    color: "#f59e0b",
    normalMin: 90,
    normalMax: 140,
  },
  temperature: {
    label: "Temperature",
    unit: "°C",
    color: "#ef4444",
    normalMin: 36.1,
    normalMax: 37.5,
  },
};

interface TrendAnalysisProps {
  patientId: string;
  days?: number;
}

export default function TrendAnalysis({
  patientId,
  days = 7,
}: TrendAnalysisProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVital, setSelectedVital] = useState("heart_rate");

  useEffect(() => {
    api
      .get(`/api/v1/analytics/trends/${patientId}?days=${days}`)
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patientId, days]);

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === "rising")
      return <TrendingUp className="w-3.5 h-3.5 text-orange-400" />;
    if (trend === "falling")
      return <TrendingDown className="w-3.5 h-3.5 text-blue-400" />;
    return <Minus className="w-3.5 h-3.5 text-gray-400" />;
  };

  if (loading)
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  if (!data?.trends || Object.keys(data.trends).length === 0) {
    return (
      <div className="text-center py-8 text-gray-600 text-sm">
        <BarChart3 className="w-6 h-6 mx-auto mb-2 opacity-30" />
        Not enough data for trend analysis — keep monitoring
      </div>
    );
  }

  const currentTrend = data.trends[selectedVital];
  const meta = VITAL_META[selectedVital];
  const chartData =
    currentTrend?.values.map((v: number, i: number) => ({
      value: v,
      time: currentTrend.timestamps[i]
        ? formatDate(currentTrend.timestamps[i])
        : String(i),
    })) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-400 flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5" /> {days}-Day Trend Analysis
        </div>
        <div className="text-xs text-gray-600">
          {data.total_readings} readings · {data.anomaly_rate}% anomaly rate
        </div>
      </div>

      {/* Vital selector */}
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(VITAL_META).map(([key, m]) => {
          const t = data.trends[key];
          return (
            <button
              key={key}
              onClick={() => setSelectedVital(key)}
              className={`p-3 rounded-xl border text-left transition-all ${
                selectedVital === key
                  ? "border-blue-500/50 bg-blue-500/5"
                  : "border-dark-600 bg-dark-900 hover:border-dark-500"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">{m.label}</span>
                {t && <TrendIcon trend={t.trend} />}
              </div>
              {t && (
                <div className="text-sm font-semibold text-white">
                  {t.mean}
                  <span className="text-xs text-gray-500 ml-1">{m.unit}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      {currentTrend && (
        <div className="vital-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-sm font-medium text-white">
                {meta.label}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <TrendIcon trend={currentTrend.trend} />
                <span
                  className={`text-xs capitalize ${
                    currentTrend.trend === "rising"
                      ? "text-orange-400"
                      : currentTrend.trend === "falling"
                        ? "text-blue-400"
                        : "text-gray-400"
                  }`}
                >
                  {currentTrend.trend}
                </span>
              </div>
            </div>
            <div className="text-right text-xs text-gray-500">
              <div>
                Min:{" "}
                <span className="text-white">
                  {currentTrend.min} {meta.unit}
                </span>
              </div>
              <div>
                Max:{" "}
                <span className="text-white">
                  {currentTrend.max} {meta.unit}
                </span>
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={chartData}>
              <CartesianGrid
                strokeDasharray="2 4"
                stroke="rgba(255,255,255,0.03)"
              />
              <XAxis
                dataKey="time"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "#0f1623",
                  border: "0.5px solid rgba(255,255,255,0.08)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#6b7280" }}
                formatter={(v: any) => [
                  `${v?.toFixed(1)} ${meta.unit}`,
                  meta.label,
                ]}
              />
              <ReferenceLine
                y={meta.normalMin}
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="3 3"
              />
              <ReferenceLine
                y={meta.normalMax}
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="3 3"
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={meta.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: meta.color }}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Prediction */}
          {data.predictions && data.predictions[selectedVital] && (
            <div className="mt-3 pt-3 border-t border-dark-600 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                Predicted next reading
              </span>
              <span className="text-sm font-medium text-white">
                {data.predictions[selectedVital]}{" "}
                <span className="text-xs text-gray-500">{meta.unit}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
