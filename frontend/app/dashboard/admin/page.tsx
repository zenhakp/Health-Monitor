"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, patientApi } from "@/lib/api";
import { getStoredUser, clearAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import toast from "react-hot-toast";
import {
  formatDate,
  formatDateTime,
  parseDate,
  timeAgo,
  normalizeDoctorName,
} from "@/lib/utils";
import {
  Activity,
  LogOut,
  Users,
  Shield,
  ChevronRight,
  UserX,
  RefreshCw,
  Phone,
  MapPin,
  Mail,
  Clock,
  FileText,
  AlertTriangle,
  CheckCircle2,
  X,
  User,
  Stethoscope,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import ConfirmationDialog from "@/components/ConfirmationDialog";

interface UserDetail {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  address: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
  recent_anomaly?: boolean;
}

interface AuditEntry {
  id: string;
  action: string;
  user_id: string;
  user_role: string;
  resource: string;
  resource_id: string;
  details: string;
  ip_address: string;
  success: boolean;
  timestamp: string;
}

function UserDetailModal({
  user,
  onClose,
  onDeactivate,
}: {
  user: UserDetail;
  onClose: () => void;
  onDeactivate: (id: string, name: string) => void;
}) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user.role === "patient") {
      setLoading(true);
      api
        .get(`/api/v1/alerts/patient/${user.id}`)
        .then((r) => setAlerts(r.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [user.id]);

  const acknowledgedAlerts = alerts.filter((a) => a.is_acknowledged);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-600 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-dark-600 sticky top-0 bg-dark-900">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                user.role === "doctor" ? "bg-blue-500/10" : "bg-green-500/10"
              }`}
            >
              {user.role === "doctor" ? (
                <Stethoscope className={`w-5 h-5 text-blue-400`} />
              ) : (
                <User className={`w-5 h-5 text-green-400`} />
              )}
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                {user.full_name}
              </div>
              <Badge variant={user.role as any}>{user.role}</Badge>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Contact info */}
          <div>
            <div className="text-xs font-medium text-gray-400 mb-3">
              Contact Information
            </div>
            <div className="grid grid-cols-1 gap-3">
              {[
                { icon: Mail, label: "Email", value: user.email },
                {
                  icon: Phone,
                  label: "Phone",
                  value: user.phone || "Not provided",
                },
                {
                  icon: MapPin,
                  label: "Address",
                  value: user.address || "Not provided",
                },
              ].map(({ icon: Icon, label, value }) => (
                <div
                  key={label}
                  className="flex items-start gap-3 p-3 bg-dark-800 rounded-xl"
                >
                  <Icon className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-gray-500">{label}</div>
                    <div className="text-sm text-white">{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Account info */}
          <div>
            <div className="text-xs font-medium text-gray-400 mb-3">
              Account Details
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: "Status",
                  value: user.is_active ? "Active" : "Inactive",
                },
                { label: "Registered", value: timeAgo(user.created_at) },
                {
                  label: "Last login",
                  value: user.last_login ? timeAgo(user.last_login) : "Never",
                },
                { label: "User ID", value: user.id.slice(0, 8) + "..." },
              ].map(({ label, value }) => (
                <div key={label} className="p-3 bg-dark-800 rounded-xl">
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className="text-sm text-white font-medium">{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Patient-specific: acknowledged alerts by doctors */}
          {user.role === "patient" && (
            <div>
              <div className="text-xs font-medium text-gray-400 mb-3">
                Clinical Actions ({acknowledgedAlerts.length} acknowledged
                alerts)
              </div>
              {loading ? (
                <div className="flex justify-center py-4">
                  <Spinner />
                </div>
              ) : acknowledgedAlerts.length === 0 ? (
                <div className="text-xs text-gray-600 text-center py-4">
                  No acknowledged alerts yet
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {acknowledgedAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="p-3 bg-dark-800 rounded-xl border border-dark-600"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={alert.severity as any}>
                            {alert.severity}
                          </Badge>
                          <span className="text-xs text-white capitalize">
                            {(alert.anomaly_type || "Alert").replace(/_/g, " ")}
                          </span>
                        </div>
                        <span className="text-xs text-gray-600">
                          {alert.acknowledged_at
                            ? timeAgo(alert.acknowledged_at)
                            : ""}
                        </span>
                      </div>
                      {alert.acknowledged_by_name && (
                        <div className="text-xs text-blue-400 mb-1">
                          Acknowledged by {alert.acknowledged_by_name}
                        </div>
                      )}
                      {alert.doctor_notes && (
                        <div className="text-xs text-gray-400 bg-dark-700 rounded-lg p-2 leading-relaxed">
                          "{alert.doctor_notes}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-dark-600">
            {user.is_active && (
              <button
                onClick={() => {
                  onDeactivate(user.id, user.full_name);
                  onClose();
                }}
                className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 px-4 py-2 rounded-xl transition-all"
              >
                <UserX className="w-4 h-4" /> Deactivate account
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 text-sm text-gray-400 border border-dark-600 hover:border-dark-500 py-2 rounded-xl transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const router = useRouter();
  const user = getStoredUser();
  const [patients, setPatients] = useState<UserDetail[]>([]);
  const [doctors, setDoctors] = useState<UserDetail[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [activeAlertsCount, setActiveAlertsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "patients" | "doctors" | "audit"
  >("overview");
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [decisionWindowDays, setDecisionWindowDays] = useState<7 | 30 | 0>(7);
  const [selectedDecisionDate, setSelectedDecisionDate] = useState<
    string | null
  >(null);
  const [expandedDecisionIds, setExpandedDecisionIds] = useState<string[]>([]);

  useEffect(() => {
    if (!user || user.role !== "admin") {
      router.push("/login");
      return;
    }
    loadAll();
    const refreshInterval = setInterval(refreshActiveAlerts, 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  const refreshActiveAlerts = async () => {
    try {
      const countRes = await api.get("/api/v1/admin/active-alerts");
      setActiveAlertsCount(countRes.data.active_alerts || 0);
    } catch {
      // ignore
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [pRes, dRes, aRes] = await Promise.all([
        api.get("/api/v1/admin/patients"),
        api.get("/api/v1/admin/doctors"),
        api.get("/api/v1/admin/audit-logs"),
      ]);
      setPatients(pRes.data);
      setDoctors(dRes.data);
      setAuditLogs(aRes.data);
      await refreshActiveAlerts();
    } catch (err: any) {
      // Fallback to existing patients API
      try {
        const res = await patientApi.list();
        setPatients(res.data);
      } catch {
        toast.error("Failed to load data");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = (userId: string, name: string) => {
    setDeactivateTarget({ id: userId, name });
    setShowDeactivateDialog(true);
  };

  const performDeactivate = async () => {
    if (!deactivateTarget) return;
    const { id, name } = deactivateTarget;
    setDeactivating(id);
    try {
      await api.patch(`/api/v1/admin/users/${id}/deactivate`);
      toast.success(`${name} has been deactivated`);
      loadAll();
    } catch {
      toast.error("Failed to deactivate user");
    } finally {
      setDeactivating(null);
      setShowDeactivateDialog(false);
      setDeactivateTarget(null);
    }
  };

  const acknowledgedAlerts = auditLogs.filter(
    (l) => l.action === "ACKNOWLEDGE_ALERT",
  );
  const decisionCutoff = decisionWindowDays
    ? Date.now() - decisionWindowDays * 24 * 60 * 60 * 1000
    : 0;
  const filteredDecisions = acknowledgedAlerts.filter((log) => {
    if (selectedDecisionDate) {
      const logDate = parseDate(log.timestamp).toISOString().slice(0, 10);
      return logDate === selectedDecisionDate;
    }
    if (!decisionWindowDays) return true;
    return parseDate(log.timestamp).getTime() >= decisionCutoff;
  });

  const toggleDecisionExpansion = (id: string) => {
    setExpandedDecisionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const tabs = ["overview", "patients", "doctors", "audit"] as const;

  return (
    <div className="min-h-screen bg-dark-950">
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onDeactivate={handleDeactivate}
        />
      )}

      <ConfirmationDialog
        isOpen={showDeactivateDialog}
        title="Deactivate User"
        message={`Are you sure you want to deactivate ${deactivateTarget?.name ?? "this user"}? This will prevent them from logging in.`}
        confirmText="Deactivate"
        cancelText="Cancel"
        isDangerous
        isLoading={deactivating !== null}
        onConfirm={performDeactivate}
        onCancel={() => {
          setShowDeactivateDialog(false);
          setDeactivateTarget(null);
        }}
      />

      <header className="h-14 glass border-b border-dark-600 flex items-center justify-between px-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-purple-600 rounded-lg flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-sm text-white">VitalWatch</span>
          <ChevronRight className="w-3 h-3 text-gray-600" />
          <span className="text-sm text-gray-400">Admin Panel</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-full border border-purple-500/20">
            Administrator
          </span>
          <button
            onClick={loadAll}
            className="text-gray-500 hover:text-gray-300 p-1"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              clearAuth();
              router.push("/login");
            }}
            className="text-gray-500 hover:text-gray-300 p-1"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-5">
        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-dark-900 border border-dark-600 rounded-xl p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${
                activeTab === tab
                  ? "bg-dark-700 text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab === "audit" ? "Audit Log" : tab}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === "overview" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  label: "Total patients",
                  value: patients.length,
                  icon: Users,
                  color: "text-green-400",
                  bg: "bg-green-500/10",
                },
                {
                  label: "Total doctors",
                  value: doctors.length,
                  icon: Stethoscope,
                  color: "text-blue-400",
                  bg: "bg-blue-500/10",
                },
                {
                  label: "Active alerts",
                  value: activeAlertsCount,
                  icon: AlertTriangle,
                  color: "text-red-400",
                  bg: "bg-red-500/10",
                },
                {
                  label: "Acknowledged",
                  value: acknowledgedAlerts.length,
                  icon: CheckCircle2,
                  color: "text-purple-400",
                  bg: "bg-purple-500/10",
                },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div
                  key={label}
                  className="bg-dark-900 border border-dark-600 rounded-2xl p-4"
                >
                  <div
                    className={`w-8 h-8 ${bg} rounded-xl flex items-center justify-center mb-3`}
                  >
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <div className="text-2xl font-semibold text-white">
                    {value}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {/* Recent acknowledgments */}
            <div className="bg-dark-900 border border-dark-600 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-dark-600 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-white">
                    Clinical actions
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {selectedDecisionDate
                      ? `Showing decisions for ${formatDate(selectedDecisionDate)}`
                      : `Showing the last ${decisionWindowDays || "all"} days`}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-gray-400">Window:</label>
                  <select
                    value={decisionWindowDays}
                    onChange={(e) =>
                      setDecisionWindowDays(
                        Number(e.target.value) as 7 | 30 | 0,
                      )
                    }
                    className="bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                  >
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={0}>All time</option>
                  </select>
                  <label className="text-xs text-gray-400">Date:</label>
                  <input
                    type="date"
                    value={selectedDecisionDate ?? ""}
                    onChange={(e) =>
                      setSelectedDecisionDate(e.target.value || null)
                    }
                    className="bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                  />
                  {selectedDecisionDate && (
                    <button
                      type="button"
                      onClick={() => setSelectedDecisionDate(null)}
                      className="text-xs text-gray-300 hover:text-white underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="divide-y divide-dark-600 max-h-64 overflow-y-auto">
                {filteredDecisions.slice(0, 10).map((log) => {
                  let details: any = {};
                  try {
                    details = JSON.parse(log.details);
                  } catch {}
                  return (
                    <div
                      key={log.id}
                      className="px-5 py-3 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-white">
                          {normalizeDoctorName(details.doctor_name || "Doctor")}{" "}
                          acknowledged alert
                        </div>
                        {details.notes && (
                          <div className="space-y-2">
                            <div className="text-xs text-gray-500 leading-relaxed">
                              {expandedDecisionIds.includes(log.id)
                                ? `“${details.notes}”`
                                : `“${details.notes.slice(0, 160)}${
                                    details.notes.length > 160 ? "..." : ""
                                  }”`}
                            </div>
                            {details.notes.length > 160 && (
                              <button
                                type="button"
                                onClick={() => toggleDecisionExpansion(log.id)}
                                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                              >
                                {expandedDecisionIds.includes(log.id) ? (
                                  <>
                                    <ChevronUp className="w-3 h-3" /> Collapse
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="w-3 h-3" /> Expand
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 flex-shrink-0">
                        {timeAgo(log.timestamp)}
                      </div>
                    </div>
                  );
                })}
                {filteredDecisions.length === 0 && (
                  <div className="px-5 py-8 text-center text-xs text-gray-600">
                    No clinical actions recorded in this period
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Patients tab */}
        {activeTab === "patients" && (
          <div className="bg-dark-900 border border-dark-600 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-dark-600 flex items-center justify-between">
              <span className="text-sm font-medium text-white">
                Patients ({patients.length})
              </span>
            </div>
            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner />
              </div>
            ) : (
              <div className="divide-y divide-dark-600">
                {patients.map((patient) => (
                  <div
                    key={patient.id}
                    className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-dark-800/50 transition-colors"
                  >
                    <button
                      onClick={() => setSelectedUser(patient)}
                      className="flex items-center gap-3 min-w-0 text-left flex-1"
                    >
                      <div className="w-8 h-8 bg-green-500/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-green-400">
                          {patient.full_name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {patient.full_name}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-2">
                          <span className="truncate">{patient.email}</span>
                          {patient.phone && (
                            <span className="flex items-center gap-1 flex-shrink-0">
                              <Phone className="w-3 h-3" />
                              {patient.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {patient.recent_anomaly && (
                        <Badge variant="critical">Alert</Badge>
                      )}
                      <Badge
                        variant={patient.is_active ? "success" : "neutral"}
                      >
                        {patient.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <span className="text-xs text-gray-600 hidden md:block">
                        {patient.last_login
                          ? timeAgo(patient.last_login)
                          : "Never logged in"}
                      </span>
                      {patient.is_active && (
                        <button
                          onClick={() =>
                            handleDeactivate(patient.id, patient.full_name)
                          }
                          disabled={deactivating === patient.id}
                          className="text-red-400 hover:text-red-300 disabled:opacity-30 p-1 transition-colors"
                        >
                          {deactivating === patient.id ? (
                            <Spinner size="sm" />
                          ) : (
                            <UserX className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Doctors tab */}
        {activeTab === "doctors" && (
          <div className="bg-dark-900 border border-dark-600 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-dark-600 flex items-center justify-between">
              <span className="text-sm font-medium text-white">
                Doctors ({doctors.length})
              </span>
            </div>
            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner />
              </div>
            ) : doctors.length === 0 ? (
              <div className="text-center py-12 text-xs text-gray-600">
                No doctors registered yet
              </div>
            ) : (
              <div className="divide-y divide-dark-600">
                {doctors.map((doctor) => (
                  <div
                    key={doctor.id}
                    className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-dark-800/50 transition-colors"
                  >
                    <button
                      onClick={() => setSelectedUser(doctor)}
                      className="flex items-center gap-3 min-w-0 text-left flex-1"
                    >
                      <div className="w-8 h-8 bg-blue-500/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-blue-400">
                          {doctor.full_name
                            .split(" ")
                            .filter((n) => n !== "Dr.")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {doctor.full_name}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-2">
                          <span className="truncate">{doctor.email}</span>
                          {doctor.phone && (
                            <span className="flex items-center gap-1 flex-shrink-0">
                              <Phone className="w-3 h-3" />
                              {doctor.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant={doctor.is_active ? "success" : "neutral"}>
                        {doctor.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <span className="text-xs text-gray-600 hidden md:block">
                        {doctor.last_login
                          ? timeAgo(doctor.last_login)
                          : "Never logged in"}
                      </span>
                      {doctor.is_active && (
                        <button
                          onClick={() =>
                            handleDeactivate(doctor.id, doctor.full_name)
                          }
                          disabled={deactivating === doctor.id}
                          className="text-red-400 hover:text-red-300 disabled:opacity-30 p-1 transition-colors"
                        >
                          {deactivating === doctor.id ? (
                            <Spinner size="sm" />
                          ) : (
                            <UserX className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Audit log tab */}
        {activeTab === "audit" && (
          <div className="bg-dark-900 border border-dark-600 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-dark-600 flex items-center justify-between">
              <span className="text-sm font-medium text-white">
                Audit Log ({auditLogs.length} entries)
              </span>
            </div>
            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner />
              </div>
            ) : (
              <div className="divide-y divide-dark-600 max-h-[600px] overflow-y-auto">
                {auditLogs.map((log) => {
                  let details: any = {};
                  try {
                    details = JSON.parse(log.details);
                  } catch {}
                  return (
                    <div key={log.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${log.success ? "bg-green-500" : "bg-red-500"}`}
                          />
                          <span className="text-xs font-mono text-blue-400 flex-shrink-0">
                            {log.action}
                          </span>
                          <span className="text-xs text-gray-400 truncate">
                            {log.user_role}
                          </span>
                        </div>
                        <span className="text-xs text-gray-600 flex-shrink-0">
                          {timeAgo(log.timestamp)}
                        </span>
                      </div>
                      {details.notes && (
                        <div className="text-xs text-gray-500 mt-1 ml-4 truncate">
                          Note: {details.notes}
                        </div>
                      )}
                      {details.doctor_name && (
                        <div className="text-xs text-gray-600 mt-0.5 ml-4">
                          By: {details.doctor_name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
