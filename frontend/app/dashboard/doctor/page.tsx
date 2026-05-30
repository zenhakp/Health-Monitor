"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  patientApi,
  vitalsApi,
  alertApi,
  createSSEConnection,
} from "@/lib/api";
import { getStoredUser, clearAuth } from "@/lib/auth";
import { dedupeAlerts } from "@/lib/utils";
import PatientCard from "@/components/PatientCard";
import AlertPanel from "@/components/AlertPanel";
import VitalsChart from "@/components/VitalsChart";
import {
  SkeletonVital,
  SkeletonAlert,
  SkeletonPatient,
} from "@/components/ui/SkeletonCard";
import { Badge } from "@/components/ui/Badge";
import { timeAgo } from "@/lib/utils";
import toast from "react-hot-toast";
import Cookies from "js-cookie";
import {
  Activity,
  LogOut,
  RefreshCw,
  Wifi,
  WifiOff,
  Bell,
  Users,
  LayoutDashboard,
  Settings,
  ChevronRight,
  AlertTriangle,
  User,
} from "lucide-react";
import HealthReports from "@/components/HealthReports";
import { reportApi } from "@/lib/api";
import Messaging from "@/components/Messaging";
import PatientSummaryPanel from "@/components/PatientSummaryPanel";
import Link from "next/link";
import ECGWaveform from "@/components/ECGWaveform";
import TrendAnalysis from "@/components/TrendAnalysis";
import GenerateReport from "@/components/GenerateReport";

export default function DoctorDashboard() {
  const router = useRouter();
  const user = getStoredUser();

  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [vitals, setVitals] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<any[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const patientTabs = ["vitals", "alerts", "reports"] as const;
  type PatientTab = (typeof patientTabs)[number];
  const [activeTab, setActiveTab] = useState<PatientTab | "sos">("vitals");
  const [sosView, setSosView] = useState<"active" | "history">("active");
  const [reports, setReports] = useState<any[]>([]);
  const [sosAlerts, setSosAlerts] = useState<any[]>([]);
  const [loadingSos, setLoadingSos] = useState(false);
  const [summaryPatient, setSummaryPatient] = useState<{
    id: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    if (!user || user.role === "patient") {
      router.push("/login");
      return;
    }
    loadPatients();
    loadSosAlerts();
  }, []);

  const loadPatients = async () => {
    try {
      const res = await patientApi.list();
      setPatients(res.data);
      if (res.data.length > 0) selectPatient(res.data[0]);
    } catch {
      router.push("/login");
    } finally {
      setLoadingPatients(false);
    }
  };

  const loadSosAlerts = async () => {
    setLoadingSos(true);
    try {
      const res = await alertApi.getSosAlerts(false, 100);
      setSosAlerts(dedupeAlerts(res.data));
    } catch {
      setSosAlerts([]);
    } finally {
      setLoadingSos(false);
    }
  };

  const loadReports = async (patientId: string) => {
    try {
      const res = await reportApi.getPatientReports(patientId);
      setReports(res.data);
    } catch {
      setReports([]);
    }
  };

  const selectPatient = async (patient: any) => {
    setSelectedPatient(patient);
    setLiveAlerts([]);
    setActiveTab("vitals");
    setSosView("active");
    setLoadingData(true);
    try {
      const [vitalsRes, alertsRes] = await Promise.all([
        vitalsApi.getPatientVitals(patient.id, 50),
        alertApi.getPatientAlerts(patient.id),
      ]);
      await loadReports(patient.id);

      setVitals(vitalsRes.data);
      setAlerts(dedupeAlerts(alertsRes.data));
    } catch {
      toast.error("Failed to load patient data");
    } finally {
      setLoadingData(false);
    }
  };

  const refreshData = async () => {
    if (!selectedPatient) return;
    setRefreshing(true);
    try {
      const [vitalsRes, alertsRes] = await Promise.all([
        vitalsApi.getPatientVitals(selectedPatient.id, 50),
        alertApi.getPatientAlerts(selectedPatient.id),
      ]);
      setVitals(vitalsRes.data);
      setAlerts(dedupeAlerts(alertsRes.data));
      await loadSosAlerts();
      toast.success("Data refreshed");
    } catch {
      toast.error("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!selectedPatient) return;
    const token = Cookies.get("access_token") || "";
    const es = createSSEConnection(
      selectedPatient.id,
      token,
      (alertData: any) => {
        setLiveAlerts((prev) =>
          dedupeAlerts([
            {
              ...alertData,
              id: alertData.alert_id,
              anomaly_type: alertData.anomaly_type,
              llm_interpretation: alertData.interpretation,
              is_acknowledged: false,
              created_at: alertData.timestamp,
              vitals: alertData.vitals,
            },
            ...prev,
          ]).slice(0, 10),
        );
        vitalsApi
          .getPatientVitals(selectedPatient.id, 50)
          .then((r) => setVitals(r.data))
          .catch(() => {});
      },
      () => setSseConnected(true),
    );
    setSseConnected(true);
    return () => {
      try {
        es.close();
      } catch {}
      setSseConnected(false);
    };
  }, [selectedPatient?.id]);

  const handleAcknowledge = (
    alertId: string,
    notes: string,
    doctorName: string,
  ) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? {
              ...a,
              is_acknowledged: true,
              doctor_notes: notes,
              acknowledged_by_name: doctorName,
            }
          : a,
      ),
    );
    setLiveAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? {
              ...a,
              is_acknowledged: true,
              doctor_notes: notes,
              acknowledged_by_name: doctorName,
            }
          : a,
      ),
    );
    setSosAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? {
              ...a,
              is_acknowledged: true,
              doctor_notes: notes,
              acknowledged_by_name: doctorName,
            }
          : a,
      ),
    );
  };

  const uniqueAlerts = Array.from(
    new Map(
      [...liveAlerts, ...alerts].map((alert) => [alert.id, alert]),
    ).values(),
  );
  const unackedCount = uniqueAlerts.filter((a) => !a.is_acknowledged).length;
  const activeSosAlerts = sosAlerts.filter((alert) => !alert.is_acknowledged);
  const historySosAlerts = sosAlerts.filter((alert) => alert.is_acknowledged);
  const latest = vitals[0];

  return (
    <>
      {summaryPatient && (
        <PatientSummaryPanel
          patientId={summaryPatient.id}
          patientName={summaryPatient.name}
          onClose={() => setSummaryPatient(null)}
        />
      )}
      <div className="min-h-screen bg-dark-950 flex flex-col">
        {/* Top nav */}
        <header className="h-14 glass border-b border-dark-600 flex items-center justify-between px-4 flex-shrink-0 z-10 sticky top-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm text-white">VitalWatch</span>
            <ChevronRight className="w-3 h-3 text-gray-600" />
            <span className="text-sm text-gray-400">Doctor Dashboard</span>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                sseConnected
                  ? "bg-green-500/10 text-green-400"
                  : "bg-gray-500/10 text-gray-500"
              }`}
            >
              {sseConnected ? (
                <Wifi className="w-3 h-3" />
              ) : (
                <WifiOff className="w-3 h-3" />
              )}
              {sseConnected ? "Live" : "Offline"}
            </div>

            {unackedCount > 0 && (
              <div className="flex items-center gap-1.5 bg-red-500/10 text-red-400 text-xs font-medium px-2.5 py-1 rounded-full">
                <Bell className="w-3 h-3" />
                {unackedCount} alert{unackedCount > 1 ? "s" : ""}
              </div>
            )}

            <div className="flex items-center gap-2 pl-3 border-l border-dark-600">
              <Link
                href="/profile"
                className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-blue-500 transition-all"
                title="Edit profile"
              >
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-blue-500/10 flex items-center justify-center">
                    <span className="text-xs font-semibold text-blue-400">
                      {user?.full_name
                        ?.split(" ")
                        .filter((n) => n !== "Dr.")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                  </div>
                )}
              </Link>
              <span className="text-xs text-gray-300 hidden md:block">
                {user?.full_name}
              </span>
              <Badge variant="doctor" className="hidden md:inline-flex">
                Doctor
              </Badge>
              <button
                onClick={() => {
                  clearAuth();
                  router.push("/login");
                }}
                className="ml-1 text-gray-500 hover:text-gray-300 transition-colors p-1"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside className="w-64 bg-dark-900 border-r border-dark-600 flex flex-col flex-shrink-0">
            <div className="p-3 border-b border-dark-600">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-400">
                  Patients
                </span>
                <span className="text-xs text-gray-600">
                  {patients.length} total
                </span>
              </div>
              <button
                onClick={() => {
                  setActiveTab("sos");
                  setSosView("active");
                }}
                className={`w-full mt-3 px-3 py-2 text-left rounded-xl text-sm font-medium transition-all ${
                  activeTab === "sos"
                    ? "bg-red-600 text-white"
                    : "bg-dark-800 text-gray-300 hover:bg-dark-700"
                }`}
              >
                SOS Alerts
                {sosAlerts.filter((a) => !a.is_acknowledged).length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                    {sosAlerts.filter((a) => !a.is_acknowledged).length > 9
                      ? "9+"
                      : sosAlerts.filter((a) => !a.is_acknowledged).length}
                  </span>
                )}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {loadingPatients
                ? Array(4)
                    .fill(0)
                    .map((_, i) => <SkeletonPatient key={i} />)
                : patients.map((p) => (
                    <PatientCard
                      key={p.id}
                      patient={p}
                      selected={selectedPatient?.id === p.id}
                      onClick={() => selectPatient(p)}
                    />
                  ))}
            </div>
          </aside>

          {/* Main */}
          <main className="flex-1 overflow-y-auto">
            {activeTab === "sos" ? (
              <div className="p-5 max-w-5xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
                  <div>
                    <h1 className="text-base font-semibold text-white">
                      SOS Alerts
                    </h1>
                    <div className="text-xs text-gray-400">
                      Emergency alerts across all patients, centralized in one
                      tab.
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={loadSosAlerts}
                      disabled={loadingSos}
                      className="text-xs bg-dark-900 border border-dark-600 hover:border-dark-500 text-gray-400 hover:text-white px-3 py-2 rounded-xl transition-all"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${loadingSos ? "animate-spin" : ""}`}
                      />{" "}
                      Refresh
                    </button>
                    <div className="text-xs text-gray-500">
                      {sosAlerts.filter((a) => !a.is_acknowledged).length}{" "}
                      unacknowledged
                    </div>
                  </div>
                </div>
                {loadingSos ? (
                  <div className="py-12">
                    <div className="text-sm text-gray-400">
                      Loading SOS alerts...
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex flex-wrap gap-2 mb-5">
                      <button
                        onClick={() => setSosView("active")}
                        className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all ${
                          sosView === "active"
                            ? "bg-red-600 text-white"
                            : "bg-dark-800 text-gray-300 hover:bg-dark-700"
                        }`}
                      >
                        Active Alerts
                        {activeSosAlerts.length > 0 && (
                          <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                            {activeSosAlerts.length > 9
                              ? "9+"
                              : activeSosAlerts.length}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => setSosView("history")}
                        className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all ${
                          sosView === "history"
                            ? "bg-dark-700 text-white"
                            : "bg-dark-800 text-gray-300 hover:bg-dark-700"
                        }`}
                      >
                        History
                        {historySosAlerts.length > 0 && (
                          <span className="ml-2 inline-flex items-center justify-center rounded-full bg-gray-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                            {historySosAlerts.length > 9
                              ? "9+"
                              : historySosAlerts.length}
                          </span>
                        )}
                      </button>
                    </div>
                    {sosView === "active" ? (
                      <AlertPanel
                        alerts={activeSosAlerts}
                        liveAlerts={[]}
                        onAcknowledge={handleAcknowledge}
                      />
                    ) : (
                      <AlertPanel
                        alerts={historySosAlerts}
                        liveAlerts={[]}
                        onAcknowledge={handleAcknowledge}
                      />
                    )}
                  </div>
                )}
              </div>
            ) : !selectedPatient ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Users className="w-8 h-8 text-gray-700 mx-auto mb-3" />
                  <div className="text-sm text-gray-500">
                    Select a patient to view their data
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5 max-w-5xl mx-auto">
                {/* Patient header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center">
                      <span className="text-sm font-semibold text-blue-400">
                        {selectedPatient.full_name
                          .split(" ")
                          .map((n: string) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h1 className="text-base font-semibold text-white">
                          {selectedPatient.full_name}
                        </h1>
                        {selectedPatient.recent_anomaly && (
                          <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" /> Alert active
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {selectedPatient.email}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {latest && (
                      <div className="hidden md:flex items-center gap-3 text-xs text-gray-500 bg-dark-900 border border-dark-600 rounded-xl px-3 py-2">
                        <span>
                          HR{" "}
                          <span className="text-white font-medium">
                            {latest.heart_rate?.toFixed(0)}
                          </span>
                        </span>
                        <span className="text-dark-500">|</span>
                        <span>
                          SpO₂{" "}
                          <span className="text-white font-medium">
                            {latest.spo2?.toFixed(1)}%
                          </span>
                        </span>
                        <span className="text-dark-500">|</span>
                        <span>
                          Temp{" "}
                          <span className="text-white font-medium">
                            {latest.temperature?.toFixed(1)}°C
                          </span>
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() =>
                        setSummaryPatient({
                          id: selectedPatient.id,
                          name: selectedPatient.full_name,
                        })
                      }
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-dark-900 border border-dark-600 px-3 py-2 rounded-xl transition-all"
                    >
                      <User className="w-3 h-3" /> Patient Info
                    </button>
                    {selectedPatient && (
                      <GenerateReport
                        patientId={selectedPatient.id}
                        patientName={selectedPatient.full_name}
                      />
                    )}

                    <button
                      onClick={refreshData}
                      disabled={refreshing}
                      className="flex items-center gap-1.5 text-xs bg-dark-900 border border-dark-600 hover:border-dark-500 text-gray-400 hover:text-gray-200 px-3 py-2 rounded-xl transition-all"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`}
                      />
                      Refresh
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 mb-4 bg-dark-900 border border-dark-600 rounded-xl p-1 w-fit">
                  {patientTabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                        activeTab === tab
                          ? "bg-dark-700 text-white"
                          : "text-gray-500 hover:text-gray-300"
                      }`}
                    >
                      {tab === "alerts" && unackedCount > 0 && (
                        <span className="w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                          {unackedCount > 9 ? "9+" : unackedCount}
                        </span>
                      )}

                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Vitals tab */}
                {activeTab === "vitals" && (
                  <div>
                    {vitals.length > 0 && (
                      <ECGWaveform
                        heartRate={vitals[0]?.heart_rate || 75}
                        anomaly={vitals[0]?.is_anomaly || false}
                      />
                    )}
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      {loadingData
                        ? Array(6)
                            .fill(0)
                            .map((_, i) => <SkeletonVital key={i} />)
                        : [
                            "heart_rate",
                            "spo2",
                            "blood_pressure_sys",
                            "blood_pressure_dia",
                            "temperature",
                            "respiratory_rate",
                          ].map((key) => (
                            <VitalsChart
                              key={key}
                              data={vitals}
                              dataKey={key}
                            />
                          ))}
                    </div>

                    {vitals.length > 0 && (
                      <div className="mt-4 p-3 bg-dark-900 border border-dark-600 rounded-xl">
                        <div className="text-xs text-gray-500 mb-2">
                          Latest reading — {timeAgo(vitals[0]?.timestamp)}
                        </div>
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                          {[
                            {
                              label: "Heart Rate",
                              value: vitals[0]?.heart_rate,
                              unit: "bpm",
                            },
                            {
                              label: "SpO₂",
                              value: vitals[0]?.spo2,
                              unit: "%",
                            },
                            {
                              label: "Sys BP",
                              value: vitals[0]?.blood_pressure_sys,
                              unit: "mmHg",
                            },
                            {
                              label: "Dia BP",
                              value: vitals[0]?.blood_pressure_dia,
                              unit: "mmHg",
                            },
                            {
                              label: "Temp",
                              value: vitals[0]?.temperature,
                              unit: "°C",
                            },
                            {
                              label: "Resp Rate",
                              value: vitals[0]?.respiratory_rate,
                              unit: "/min",
                            },
                          ].map(({ label, value, unit }) => (
                            <div key={label} className="text-center">
                              <div className="text-xs text-gray-600">
                                {label}
                              </div>
                              <div className="text-sm font-medium text-white">
                                {value?.toFixed(1)}
                                <span className="text-xs text-gray-500 ml-0.5">
                                  {unit}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {vitals.length > 5 && selectedPatient && (
                      <div className="mt-4">
                        <TrendAnalysis
                          patientId={selectedPatient.id}
                          days={7}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Alerts tab */}
                {activeTab === "alerts" &&
                  (loadingData ? (
                    Array(3)
                      .fill(0)
                      .map((_, i) => <SkeletonAlert key={i} />)
                  ) : (
                    <AlertPanel
                      alerts={alerts}
                      liveAlerts={liveAlerts}
                      onAcknowledge={handleAcknowledge}
                    />
                  ))}
                {activeTab === "reports" && (
                  <HealthReports
                    reports={reports}
                    canUpload={false}
                    onUploadSuccess={() => loadReports(selectedPatient.id)}
                  />
                )}
              </div>
            )}
          </main>
          <Messaging />
        </div>
      </div>
    </>
  );
}
