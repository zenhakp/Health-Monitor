"use client";
import { useState } from "react";
import { alertApi } from "@/lib/api";
import {
  normalizeDoctorName,
  severityColor,
  timeAgo,
  formatDateTime,
} from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import toast from "react-hot-toast";
import {
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Wifi,
  FileText,
  User,
} from "lucide-react";

interface Alert {
  id: string;
  severity: string;
  anomaly_type?: string;
  interpretation?: string;
  llm_interpretation?: string;
  is_acknowledged: boolean;
  acknowledged_by_name?: string;
  doctor_notes?: string;
  acknowledged_at?: string;
  created_at: string;
  patient_id: string;
  patient_name?: string;
  vitals?: any;
}

interface AlertPanelProps {
  alerts: Alert[];
  liveAlerts: Alert[];
  onAcknowledge: (alertId: string, notes: string, doctorName: string) => void;
}

function AcknowledgeModal({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: (notes: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-600 rounded-2xl w-full max-w-md p-6 animate-slide-in-up">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center">
            <FileText className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">
              Acknowledge Alert
            </div>
            <div className="text-xs text-gray-400">
              Document your clinical action
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs font-medium text-gray-400 block mb-1.5">
            Clinical notes <span className="text-red-400">*</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Reviewed vitals — tachycardia likely due to anxiety. Advised patient to rest and take prescribed beta-blocker. Will monitor for next 2 hours."
            rows={4}
            className="w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none"
          />
          <div className="text-xs text-gray-600 mt-1">
            {notes.length} characters — be specific about action taken
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white border border-dark-600 hover:border-dark-500 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!notes.trim()) {
                toast.error("Clinical notes are required");
                return;
              }
              onConfirm(notes);
            }}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Spinner size="sm" /> Saving...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" /> Acknowledge
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function AlertItem({
  alert,
  onAcknowledge,
  isLive,
}: {
  alert: Alert & { isLive?: boolean };
  onAcknowledge: (id: string, notes: string, doctorName: string) => void;
  isLive?: boolean;
}) {
  const [expanded, setExpanded] = useState(isLive ?? false);
  const [showModal, setShowModal] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const colors = severityColor(alert.severity);

  const handleAcknowledge = async (notes: string) => {
    setAcknowledging(true);
    try {
      const res = await alertApi.acknowledge(alert.id, notes);
      toast.success("Alert acknowledged and clinical notes saved");
      onAcknowledge(alert.id, notes, res.data.acknowledged_by);
      setShowModal(false);
    } catch {
      toast.error("Failed to acknowledge alert");
    } finally {
      setAcknowledging(false);
    }
  };

  return (
    <>
      {showModal && (
        <AcknowledgeModal
          onConfirm={handleAcknowledge}
          onCancel={() => setShowModal(false)}
          loading={acknowledging}
        />
      )}

      <div
        className={`bg-dark-900 border rounded-xl mb-2 overflow-hidden transition-all ${
          isLive
            ? "border-blue-500/30 animate-slide-in-right"
            : `border-dark-600 alert-${alert.severity}`
        }`}
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${colors.dot}`}
              />
              <Badge variant={alert.severity as any}>
                {alert.severity.toUpperCase()}
              </Badge>
              <span className="text-sm font-medium text-white capitalize">
                {(alert.anomaly_type || "Anomaly").replace(/_/g, " ")}
              </span>
              {alert.patient_name && (
                <span className="text-xs text-gray-400 bg-dark-800 px-2 py-0.5 rounded-full">
                  {alert.patient_name}
                </span>
              )}
              {isLive && (
                <span className="flex items-center gap-1 text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">
                  <Wifi className="w-3 h-3" /> Live
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {alert.is_acknowledged ? (
                <div className="text-right">
                  <div className="flex items-center gap-1 text-xs text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Acknowledged
                  </div>
                  {alert.acknowledged_by_name && (
                    <div className="text-xs text-gray-600 mt-0.5">
                      by {normalizeDoctorName(alert.acknowledged_by_name)}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowModal(true)}
                  className="text-xs bg-dark-700 hover:bg-blue-600 text-gray-300 hover:text-white px-3 py-1.5 rounded-lg transition-all border border-dark-500 hover:border-blue-600"
                >
                  Acknowledge
                </button>
              )}

              <button
                onClick={() => setExpanded(!expanded)}
                className="text-gray-500 hover:text-gray-300 transition-colors p-1"
              >
                {expanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div
            className={`text-xs text-gray-400 mt-2 leading-relaxed ${expanded ? "" : "line-clamp-2"}`}
          >
            {alert.interpretation || alert.llm_interpretation}
          </div>

          {alert.is_acknowledged && alert.doctor_notes && expanded && (
            <div className="mt-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl">
              <div className="text-xs font-medium text-blue-400 mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Clinical notes
              </div>
              <div className="text-xs text-gray-300 leading-relaxed">
                {alert.doctor_notes}
              </div>
              {alert.acknowledged_at && (
                <div className="text-xs text-gray-600 mt-1">
                  {formatDateTime(alert.acknowledged_at)}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-1 mt-2">
            <Clock className="w-3 h-3 text-gray-600" />
            <span className="text-xs text-gray-600">
              {timeAgo(alert.created_at)}
            </span>
          </div>
        </div>

        {expanded && alert.vitals && (
          <div className="border-t border-dark-600 px-4 py-3 bg-dark-800/50">
            <div className="text-xs text-gray-500 font-medium mb-2">
              Vitals at time of alert
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                ["HR", alert.vitals.heart_rate, "bpm"],
                ["SpO₂", alert.vitals.spo2, "%"],
                ["Temp", alert.vitals.temperature, "°C"],
                ["Sys BP", alert.vitals.blood_pressure_sys, "mmHg"],
                ["Dia BP", alert.vitals.blood_pressure_dia, "mmHg"],
                ["RR", alert.vitals.respiratory_rate, "/min"],
              ].map(([label, val, unit]) => (
                <div key={label as string} className="text-center">
                  <div className="text-xs text-gray-600">{label as string}</div>
                  <div className="text-sm font-medium text-white">
                    {(val as number)?.toFixed(1)}
                    <span className="text-xs text-gray-500 ml-0.5">
                      {unit as string}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function AlertPanel({
  alerts,
  liveAlerts,
  onAcknowledge,
}: AlertPanelProps) {
  const liveIds = new Set(liveAlerts.map((a) => a.id));
  const combined = [
    ...liveAlerts.map((a) => ({ ...a, isLive: true })),
    ...alerts
      .filter((a) => !liveIds.has(a.id))
      .map((a) => ({ ...a, isLive: false })),
  ];

  const unacked = combined.filter((a) => !a.is_acknowledged).length;

  if (combined.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-5 h-5 text-green-400" />
        </div>
        <div className="text-sm text-gray-400">
          All clear — no active alerts
        </div>
        <div className="text-xs text-gray-600 mt-1">Monitoring in progress</div>
      </div>
    );
  }

  return (
    <div>
      {unacked > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2.5 bg-red-500/5 border border-red-500/20 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-xs text-red-400 font-medium">
            {unacked} alert{unacked > 1 ? "s" : ""} require acknowledgment with
            clinical notes
          </span>
        </div>
      )}
      <div className="max-h-[500px] overflow-y-auto space-y-0 pr-1">
        {combined.map((alert) => (
          <AlertItem
            key={alert.id}
            alert={alert}
            onAcknowledge={onAcknowledge}
            isLive={(alert as any).isLive}
          />
        ))}
      </div>
    </div>
  );
}
