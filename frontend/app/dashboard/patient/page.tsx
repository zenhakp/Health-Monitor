"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { vitalsApi, alertApi, reportApi, authApi, api } from "@/lib/api";
import { getStoredUser, clearAuth } from "@/lib/auth";
import VitalsChart from "@/components/VitalsChart";
import { Badge } from "@/components/ui/Badge";
import { SkeletonVital } from "@/components/ui/SkeletonCard";
import {
  dedupeAlerts,
  parseDate,
  vitalStatus,
  vitalStatusColor,
  timeAgo,
} from "@/lib/utils";
import toast from "react-hot-toast";
import {
  Activity,
  LogOut,
  Heart,
  Thermometer,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Wifi,
  ChevronRight,
  Cpu,
  UserX,
} from "lucide-react";
import Link from "next/link";
import HealthReports from "@/components/HealthReports";
import HealthChatbot from "@/components/HealthChatbot";
import Messaging from "@/components/Messaging";
import ECGWaveform from "@/components/ECGWaveform";
import { calculateHealthScore, healthScoreColor } from "@/lib/utils";
import MedicationReminders from "@/components/MedicationReminders";
import TrendAnalysis from "@/components/TrendAnalysis";
import ConfirmationDialog from "@/components/ConfirmationDialog";

function parseLastSeen(lastSeen: string | null) {
  if (!lastSeen) return NaN;
  const parsed = Date.parse(lastSeen);
  if (Number.isFinite(parsed)) return parsed;
  return Date.parse(
    lastSeen.replace(" ", "T") + (lastSeen.endsWith("Z") ? "" : "Z"),
  );
}

function getOnlineStatus(
  lastSeen: string | null,
): "online" | "idle" | "offline" {
  const timestamp = parseLastSeen(lastSeen);
  if (!Number.isFinite(timestamp)) return "offline";
  const diff = (Date.now() - timestamp) / 1000 / 60;
  if (diff < 10) return "online";
  if (diff < 30) return "idle";
  return "offline";
}

export default function PatientDashboard() {
  const router = useRouter();
  const user = getStoredUser();
  const [vitals, setVitals] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedTab, setSelectedTab] = useState("vitals");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSOSDialog, setShowSOSDialog] = useState(false);

  const tabs = [
    { key: "vitals", label: "Vitals" },
    { key: "alerts", label: "Alerts" },
    { key: "reports", label: "Reports" },
    { key: "care", label: "Care Team" },
    { key: "medications", label: "Medication Reminders" },
  ];

  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }

    loadData();
    const interval = setInterval(loadData, 8000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const loadData = async () => {
    if (!user) return;
    try {
      const [vRes, aRes, rRes] = await Promise.all([
        vitalsApi.getPatientVitals(user.id, 30),
        alertApi.getPatientAlerts(user.id),
        reportApi.getPatientReports(user.id),
      ]);
      const dRes = await api.get("/api/v1/messages/contacts");

      setVitals(vRes.data);
      setAlerts(dedupeAlerts(aRes.data));
      setReports(rRes.data);
      setDoctors(dRes.data);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error(
        "Failed to load data:",
        err?.response?.status,
        err?.response?.data,
      );
      if (err?.response?.status === 401) {
        router.push("/login");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleEmergencySOS = () => {
    setShowSOSDialog(true);
  };

  const sendEmergencySOS = async () => {
    try {
      await api.post("/api/v1/emergency/sos");
      toast.success("Emergency alert sent to all available doctors");
    } catch (err: any) {
      toast.error(
        err?.response?.data?.detail || "Failed to send emergency alert",
      );
    } finally {
      setShowSOSDialog(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await authApi.deleteAccount();
      toast.success("Account deleted");
      clearAuth();
      router.push("/login");
    } catch {
      toast.error("Failed to delete account");
    } finally {
      setDeletingAccount(false);
      setShowDeleteDialog(false);
    }
  };

  const latest = vitals[0];
  const recentAlerts = alerts.filter((a) => !a.is_acknowledged).slice(0, 3);
  const unackedCount = alerts.filter((a) => !a.is_acknowledged).length;
  const overallStatus =
    recentAlerts.length === 0
      ? "normal"
      : recentAlerts[0]?.severity === "critical"
        ? "critical"
        : "warning";

  return (
    <div className="min-h-screen bg-dark-950">
      <header className="h-14 glass border-b border-dark-600 flex items-center justify-between px-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-green-600 rounded-lg flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-sm text-white">VitalWatch</span>
          <ChevronRight className="w-3 h-3 text-gray-600" />
          <span className="text-sm text-gray-400">My Health</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full">
            <Wifi className="w-3 h-3" /> Monitoring active
          </div>
          <Link
            href="/device"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-dark-900 border border-dark-600 px-3 py-1.5 rounded-xl transition-all"
          >
            <Cpu className="w-3 h-3" /> Device
          </Link>
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
                      .filter((name) => name !== "Dr.")
                      .map((name) => name[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                </div>
              )}
            </Link>
            <span className="text-xs text-gray-300 hidden md:block">
              {user?.full_name}
            </span>
            <button
              onClick={() => setShowDeleteDialog(true)}
              disabled={deletingAccount}
              title="Delete my account"
              className="ml-2 relative z-50 flex items-center gap-1 text-xs text-red-400 hover:text-red-300 bg-dark-900 border border-dark-600 px-2 py-1 rounded transition-all"
            >
              <UserX className="w-3 h-3" />
              <span className="hidden sm:inline">Delete</span>
            </button>
            <button
              onClick={() => {
                clearAuth();
                router.push("/login");
              }}
              title="Logout"
              className="text-gray-500 hover:text-gray-300 p-1 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-5 space-y-5">
        <div className="rounded-2xl bg-dark-900 border border-dark-600 p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-1 mb-4 bg-dark-900 border border-dark-600 rounded-xl p-1 w-fit">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSelectedTab(tab.key)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                    selectedTab === tab.key
                      ? "bg-dark-700 text-white"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {tab.key === "alerts" && unackedCount > 0 && (
                    <span className="w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                      {unackedCount > 9 ? "9+" : unackedCount}
                    </span>
                  )}

                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div
            className={`rounded-2xl p-4 border ${
              overallStatus === "critical"
                ? "bg-red-500/5 border-red-500/20"
                : overallStatus === "warning"
                  ? "bg-yellow-500/5 border-yellow-500/20"
                  : "bg-green-500/5 border-green-500/20"
            }`}
          >
            <div className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    overallStatus === "normal"
                      ? "bg-green-500/10"
                      : "bg-red-500/10"
                  }`}
                >
                  {overallStatus === "normal" ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                  )}
                </div>
                <div>
                  <div
                    className={`text-sm font-medium ${
                      overallStatus === "normal"
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {overallStatus === "normal"
                      ? "All vitals normal"
                      : `${recentAlerts.length} active alert${recentAlerts.length > 1 ? "s" : ""}`}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {lastUpdated
                      ? `Updated ${timeAgo(lastUpdated)}`
                      : "Connecting..."}
                  </div>
                </div>
              </div>
              {latest && (
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={`text-3xl font-bold ${healthScoreColor(calculateHealthScore(latest)).text}`}
                    >
                      {calculateHealthScore(latest)}
                    </div>
                    <div className="text-xs text-gray-500">Health Score</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>
                        {healthScoreColor(calculateHealthScore(latest)).label}
                      </span>
                      <span>{calculateHealthScore(latest)}/100</span>
                    </div>
                    <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${healthScoreColor(calculateHealthScore(latest)).bg} rounded-full transition-all duration-500`}
                        style={{ width: `${calculateHealthScore(latest)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-dark-900 border border-dark-600 px-3 py-1.5 rounded-xl transition-all"
              >
                <RefreshCw
                  className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            </div>

            {overallStatus !== "normal" && (
              <div className="mt-3 pt-3 border-t border-dark-600">
                <div className="text-xs text-gray-400">
                  Your care team has been notified. Please contact them if you
                  feel unwell.
                </div>
              </div>
            )}
          </div>
        </div>

        {selectedTab === "vitals" && (
          <div className="space-y-5">
            {latest && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    icon: Heart,
                    label: "Heart Rate",
                    value: latest.heart_rate?.toFixed(0),
                    unit: "bpm",
                    key: "heart_rate",
                    color: "text-red-400",
                  },
                  {
                    icon: Activity,
                    label: "SpO₂",
                    value: latest.spo2?.toFixed(1),
                    unit: "%",
                    key: "spo2",
                    color: "text-green-400",
                  },
                  {
                    icon: Thermometer,
                    label: "Temperature",
                    value: latest.temperature?.toFixed(1),
                    unit: "°C",
                    key: "temperature",
                    color: "text-orange-400",
                  },
                ].map(({ icon: Icon, label, value, unit, key, color }) => {
                  const status = vitalStatus(key, parseFloat(value || "0"));
                  return (
                    <div key={label} className="vital-card p-4 text-center">
                      <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
                      <div
                        className={`text-2xl font-semibold ${vitalStatusColor(status)}`}
                      >
                        {value}
                      </div>
                      <div className="text-xs text-gray-500">{unit}</div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {label}
                      </div>
                      {status !== "normal" && (
                        <Badge
                          variant={
                            status === "critical" ? "critical" : "medium"
                          }
                          className="mt-1"
                        >
                          {status}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {vitals.length > 0 && (
              <ECGWaveform
                heartRate={vitals[0]?.heart_rate || 75}
                anomaly={vitals[0]?.is_anomaly || false}
              />
            )}

            <div>
              <div className="text-xs font-medium text-gray-400 mb-3">
                Vital trends — last 20 readings
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {loading
                  ? Array(4)
                      .fill(0)
                      .map((_, i) => <SkeletonVital key={i} />)
                  : [
                      "heart_rate",
                      "spo2",
                      "blood_pressure_sys",
                      "temperature",
                    ].map((key) => (
                      <VitalsChart key={key} data={vitals} dataKey={key} />
                    ))}
              </div>
            </div>
            {user && vitals.length > 5 && (
              <TrendAnalysis patientId={user.id} days={7} />
            )}
            <Link
              href="/device"
              className="block vital-card p-4 hover:border-blue-500/30 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center">
                    <Cpu className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">
                      Device & Data Source
                    </div>
                    <div className="text-xs text-gray-500">
                      Connect a wearable or run the simulator
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
              </div>
            </Link>
          </div>
        )}
        {selectedTab === "alerts" && (
          <div className="space-y-4">
            <div className="text-xs font-medium text-gray-400">Alerts</div>
            {alerts.length === 0 ? (
              <div className="rounded-2xl bg-dark-900 border border-dark-600 p-6 text-center text-sm text-gray-500">
                No alerts yet — everything is clear for now.
              </div>
            ) : (
              <div className="space-y-3">
                {[...alerts]
                  .sort(
                    (a, b) =>
                      parseDate(b.created_at).getTime() -
                      parseDate(a.created_at).getTime(),
                  )
                  .map((alert) => (
                    <div
                      key={alert.id}
                      className={`bg-dark-900 border rounded-xl p-4 alert-${alert.severity}`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2 flex-col sm:flex-row">
                        <div className="flex items-center gap-2">
                          <Badge variant={alert.severity as any}>
                            {alert.severity.toUpperCase()}
                          </Badge>
                          <span className="text-sm text-white capitalize">
                            {(alert.anomaly_type || "Alert").replace(/_/g, " ")}
                          </span>
                        </div>
                        {alert.is_acknowledged && (
                          <span className="text-xs text-gray-400">
                            Acknowledged
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 leading-relaxed">
                        {alert.llm_interpretation}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span>{timeAgo(alert.created_at)}</span>
                        {alert.acknowledged_at && (
                          <span>
                            · Acknowledged {timeAgo(alert.acknowledged_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {selectedTab === "reports" && (
          <div>
            <div className="text-xs font-medium text-gray-400 mb-3">
              Health Reports
            </div>
            <HealthReports
              reports={reports}
              canUpload={true}
              onUploadSuccess={loadData}
            />
          </div>
        )}

        {selectedTab === "medications" && (
          <div>
            <MedicationReminders />
          </div>
        )}

        {selectedTab === "care" && (
          <div className="space-y-4">
            {doctors.length > 0 ? (
              <div>
                <div className="text-xs font-medium text-gray-400 mb-3">
                  Your care team
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {doctors.map((doc) => {
                    const status = getOnlineStatus(doc.last_seen);
                    return (
                      <div
                        key={doc.id}
                        className="vital-card p-3 flex items-center gap-3"
                      >
                        <div className="relative">
                          {doc.avatar_url ? (
                            <img
                              src={doc.avatar_url}
                              alt={doc.full_name}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center">
                              <span
                                className="text-xs font-semibold text-blue-400"
                                suppressHydrationWarning
                              >
                                {doc.full_name
                                  .split(" ")
                                  .filter((name: string) => name !== "Dr.")
                                  .map((name: string) => name[0])
                                  .join("")
                                  .slice(0, 2)}
                              </span>
                            </div>
                          )}
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-dark-950 ${
                              status === "online"
                                ? "bg-green-500"
                                : status === "idle"
                                  ? "bg-yellow-500"
                                  : "bg-gray-600"
                            }`}
                          />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-white">
                            {doc.full_name}
                          </div>
                          <div
                            className={`text-xs ${
                              status === "online"
                                ? "text-green-400"
                                : status === "idle"
                                  ? "text-yellow-400"
                                  : "text-gray-500"
                            }`}
                          >
                            {status === "online"
                              ? "● Online"
                              : status === "idle"
                                ? "● Away"
                                : "● Offline"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-dark-900 border border-dark-600 p-6 text-sm text-gray-500">
                Your care team will appear here when available.
              </div>
            )}
          </div>
        )}

        {/* Floating SOS button on the right side */}
        <button
          onClick={handleEmergencySOS}
          title="Emergency SOS — Alert My Doctor"
          className="fixed right-6 top-1/2 transform -translate-y-1/2 z-50 flex items-center gap-2 px-3 py-2 rounded-full bg-red-600 text-white shadow-lg hover:scale-105 transition-all"
        >
          <AlertTriangle className="w-5 h-5" />
          SOS Alerts
        </button>
      </div>

      <HealthChatbot latestVitals={latest} />
      <Messaging />
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        title="Delete your account"
        message="Delete your account? This cannot be undone. Your health data will be retained for medical records."
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onConfirm={handleDeleteAccount}
        onCancel={() => setShowDeleteDialog(false)}
      />

      <ConfirmationDialog
        isOpen={showSOSDialog}
        title="Send emergency SOS"
        message="Send emergency alert to all available doctors? Only use this in a genuine emergency."
        confirmText="Send alert"
        cancelText="Cancel"
        isDangerous
        onConfirm={sendEmergencySOS}
        onCancel={() => setShowSOSDialog(false)}
      />
    </div>
  );
}
