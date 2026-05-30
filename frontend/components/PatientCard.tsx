"use client";
import { AlertTriangle, CheckCircle, Circle } from "lucide-react";

interface Patient {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  is_active: boolean;
  recent_anomaly: boolean;
  last_login: string | null;
}

export default function PatientCard({ patient, selected, onClick }: {
  patient: Patient; selected: boolean; onClick: () => void;
}) {
  const initials = patient.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <button onClick={onClick} className={`w-full text-left p-3 rounded-xl border transition-all ${
      selected
        ? "border-blue-500/50 bg-blue-500/5"
        : "border-transparent hover:border-dark-500 hover:bg-dark-800"
    }`}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
          {patient.avatar_url ? (
            <img src={patient.avatar_url} alt={patient.full_name} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${
              patient.recent_anomaly ? "bg-red-500/20" : "bg-blue-500/10"
            }`}>
              <span className={`text-xs font-semibold ${patient.recent_anomaly ? "text-red-400" : "text-blue-400"}`}>
                {initials}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-white truncate">{patient.full_name}</span>
          </div>
          <div className="text-xs text-gray-500 truncate">{patient.email}</div>
        </div>
        <div className="flex-shrink-0">
          {patient.recent_anomaly
            ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            : <Circle className="w-2 h-2 fill-green-500 text-green-500" />
          }
        </div>
      </div>
    </button>
  );
}