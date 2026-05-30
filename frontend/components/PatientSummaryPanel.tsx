"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { vitalStatus, vitalStatusColor, timeAgo } from "@/lib/utils";
import {
  X, Phone, MapPin, Mail, Activity, Heart,
  AlertTriangle, CheckCircle, Clock, TrendingUp
} from "lucide-react";

interface PatientSummaryPanelProps {
  patientId: string;
  patientName: string;
  onClose: () => void;
}

export default function PatientSummaryPanel({
  patientId, patientName, onClose
}: PatientSummaryPanelProps) {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/v1/patients/${patientId}/summary`)
      .then(r => setSummary(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patientId]);

  const VITALS_META: Record<string, { label: string; unit: string }> = {
    heart_rate: { label: "Heart Rate", unit: "bpm" },
    spo2: { label: "SpO₂", unit: "%" },
    blood_pressure_sys: { label: "Sys BP", unit: "mmHg" },
    blood_pressure_dia: { label: "Dia BP", unit: "mmHg" },
    temperature: { label: "Temperature", unit: "°C" },
    respiratory_rate: { label: "Resp Rate", unit: "/min" },
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-600 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-in-up">
        <div className="flex items-center justify-between p-5 border-b border-dark-600 sticky top-0 bg-dark-900">
          <div>
            <h2 className="text-base font-semibold text-white">{patientName}</h2>
            <p className="text-xs text-gray-500">Patient summary</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : !summary ? (
          <div className="text-center py-16 text-gray-500">Failed to load summary</div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Contact info */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-400">Contact</div>
              {[
                { icon: Mail, value: summary.email },
                { icon: Phone, value: summary.phone || "Not provided" },
                { icon: MapPin, value: summary.address || "Not provided" },
              ].map(({ icon: Icon, value }) => (
                <div key={value} className="flex items-center gap-2 text-sm text-gray-300">
                  <Icon className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                  <span>{value}</span>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div>
              <div className="text-xs font-medium text-gray-400 mb-2">Overview</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Total readings", value: summary.stats.total_readings, color: "text-blue-400" },
                  { label: "Anomalies detected", value: summary.stats.anomaly_count, color: "text-orange-400" },
                  { label: "Unacknowledged alerts", value: summary.stats.unacknowledged_alerts, color: "text-red-400" },
                  { label: "Critical alerts", value: summary.stats.critical_alerts, color: "text-red-500" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-dark-800 rounded-xl p-3">
                    <div className={`text-lg font-semibold ${color}`}>{value}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Latest vitals */}
            {summary.latest_vitals && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-gray-400">Latest vitals</div>
                  <div className="text-xs text-gray-600">
                    {timeAgo(summary.latest_vitals.timestamp)}
                  </div>
                </div>
                {summary.latest_vitals.is_anomaly && (
                  <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-2 mb-3">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    Anomaly detected in latest reading
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(VITALS_META).map(([key, meta]) => {
                    const value = summary.latest_vitals[key];
                    const status = vitalStatus(key, value);
                    const color = vitalStatusColor(status);
                    return (
                      <div key={key} className="bg-dark-800 rounded-xl p-3 text-center">
                        <div className={`text-base font-semibold ${color}`}>
                          {typeof value === "number" ? value.toFixed(1) : "—"}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">{meta.unit}</div>
                        <div className="text-xs text-gray-600">{meta.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Account info */}
            <div className="pt-3 border-t border-dark-600 flex items-center justify-between text-xs text-gray-600">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Registered {timeAgo(summary.created_at)}
              </div>
              <div>
                Last seen: {summary.last_login ? timeAgo(summary.last_login) : "Never"}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}