"use client";
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";
import toast from "react-hot-toast";
import { Pill, Plus, X, Clock, Bell, Trash2, Edit3 } from "lucide-react";
import ConfirmationDialog from "./ConfirmationDialog";

interface Medication {
  id: string;
  medication_name: string;
  dosage: string;
  schedule_times: string[];
  created_at: string;
}

export default function MedicationReminders() {
  const [meds, setMeds] = useState<Medication[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    medication_name: "",
    dosage: "",
    times: ["08:00"],
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());
  const [showDeleteMedDialog, setShowDeleteMedDialog] = useState(false);
  const [medToDelete, setMedToDelete] = useState<Medication | null>(null);

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem("vitalwatch_med_notifications_enabled")
        : null;
    setNotificationsEnabled(stored !== "false");
    loadMeds();
    // Check reminders every minute
    const interval = setInterval(checkReminders, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (meds.length > 0 && notificationsEnabled) checkReminders();
  }, [meds, notificationsEnabled]);

  const loadMeds = async () => {
    try {
      const res = await api.get("/api/v1/medications/");
      setMeds(res.data);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const checkReminders = () => {
    if (!notificationsEnabled) return;
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    meds.forEach((med) => {
      med.schedule_times.forEach((time) => {
        const key = `${med.id}-${time}-${now.toDateString()}`;
        if (time === currentTime && !notifiedRef.current.has(key)) {
          notifiedRef.current.add(key);
          // Browser notification
          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification("💊 Medication Reminder — VitalWatch", {
              body: `Time to take ${med.medication_name}${med.dosage ? ` (${med.dosage})` : ""}`,
              icon: "/favicon.ico",
            });
          }
          toast(
            `💊 Time to take ${med.medication_name}${med.dosage ? ` — ${med.dosage}` : ""}`,
            {
              duration: 10000,
              style: { background: "#1f2937", color: "#f9fafb" },
            },
          );
        }
      });
    });
  };

  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        window.localStorage.setItem(
          "vitalwatch_med_notifications_enabled",
          "true",
        );
        setNotificationsEnabled(true);
        toast.success(
          "Notifications enabled — you'll be reminded when it's time to take medication",
        );
      } else {
        window.localStorage.setItem(
          "vitalwatch_med_notifications_enabled",
          "false",
        );
        setNotificationsEnabled(false);
        toast.error(
          "Notification permission denied — enable in browser settings",
        );
      }
    }
  };

  const saveMed = async () => {
    if (!form.medication_name.trim()) {
      toast.error("Enter medication name");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/api/v1/medications/${editingId}`, {
          medication_name: form.medication_name,
          dosage: form.dosage,
          schedule_times: form.times,
        });
        toast.success("Medication reminder updated");
      } else {
        await api.post("/api/v1/medications/", {
          medication_name: form.medication_name,
          dosage: form.dosage,
          schedule_times: form.times,
        });
        toast.success("Medication reminder added");
      }
      setShowAdd(false);
      setEditingId(null);
      setForm({ medication_name: "", dosage: "", times: ["08:00"] });
      loadMeds();
    } catch {
      toast.error("Failed to save medication reminder");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (med: Medication) => {
    setEditingId(med.id);
    setForm({
      medication_name: med.medication_name,
      dosage: med.dosage,
      times: med.schedule_times,
    });
    setShowAdd(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ medication_name: "", dosage: "", times: ["08:00"] });
    setShowAdd(false);
  };

  const deleteMed = async (id: string, name: string) => {
    try {
      await api.delete(`/api/v1/medications/${id}`);
      toast.success(`${name} reminder removed`);
      setMeds((prev) => prev.filter((m) => m.id !== id));
    } catch {
      toast.error("Failed to remove medication");
    } finally {
      setShowDeleteMedDialog(false);
      setMedToDelete(null);
    }
  };

  const addTime = () =>
    setForm((f) => ({ ...f, times: [...f.times, "12:00"] }));
  const removeTime = (i: number) =>
    setForm((f) => ({ ...f, times: f.times.filter((_, idx) => idx !== i) }));
  const updateTime = (i: number, val: string) =>
    setForm((f) => ({
      ...f,
      times: f.times.map((t, idx) => (idx === i ? val : t)),
    }));

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 gap-3">
        <div className="text-xs font-medium text-gray-400 flex items-center gap-2">
          <Pill className="w-3.5 h-3.5" /> Medication Reminders
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={requestNotificationPermission}
            className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
          >
            <Bell className="w-3 h-3" />{" "}
            {notificationsEnabled
              ? "Refresh browser permission"
              : "Enable alerts"}
          </button>
          <button
            onClick={() => {
              setEditingId(null);
              setForm({ medication_name: "", dosage: "", times: ["08:00"] });
              setShowAdd(true);
            }}
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
          <button
            onClick={() => {
              const next = !notificationsEnabled;
              setNotificationsEnabled(next);
              window.localStorage.setItem(
                "vitalwatch_med_notifications_enabled",
                next ? "true" : "false",
              );
              toast.success(
                next
                  ? "Medication reminders enabled"
                  : "Medication reminders disabled",
              );
            }}
            className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
          >
            {notificationsEnabled ? "Disable reminders" : "Reminders off"}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="bg-dark-900 border border-dark-600 rounded-2xl p-4 mb-3">
          <div className="space-y-3">
            <input
              value={form.medication_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, medication_name: e.target.value }))
              }
              placeholder="Medication name (e.g. Metoprolol)"
              className="w-full bg-dark-800 border border-dark-600 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all"
            />
            <input
              value={form.dosage}
              onChange={(e) =>
                setForm((f) => ({ ...f, dosage: e.target.value }))
              }
              placeholder="Dosage (e.g. 25mg)"
              className="w-full bg-dark-800 border border-dark-600 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all"
            />
            <div>
              <div className="text-xs text-gray-500 mb-2">Reminder times</div>
              {form.times.map((t, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input
                    type="time"
                    value={t}
                    onChange={(e) => updateTime(i, e.target.value)}
                    className="flex-1 bg-dark-800 border border-dark-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                  />
                  {form.times.length > 1 && (
                    <button
                      onClick={() => removeTime(i)}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addTime}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                + Add another time
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={cancelEdit}
                className="flex-1 text-xs text-gray-400 border border-dark-600 py-2 rounded-xl transition-all hover:border-dark-500"
              >
                Cancel
              </button>
              <button
                onClick={saveMed}
                disabled={saving}
                className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl transition-all flex items-center justify-center gap-1"
              >
                {saving ? (
                  <Spinner size="sm" />
                ) : editingId ? (
                  "Update reminder"
                ) : (
                  "Save reminder"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : meds.length === 0 ? (
        <div className="text-xs text-gray-600 text-center py-4">
          No medication reminders set
        </div>
      ) : (
        <div className="space-y-2">
          {meds.map((med) => (
            <div
              key={med.id}
              className="bg-dark-900 border border-dark-600 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Pill className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">
                    {med.medication_name}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs">
                    {med.dosage && (
                      <span className="text-gray-500">{med.dosage}</span>
                    )}
                    <span className="flex items-center gap-1 text-gray-600">
                      <Clock className="w-3 h-3" />
                      {med.schedule_times.join(", ")}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => startEdit(med)}
                  className="text-gray-500 hover:text-blue-400 transition-colors p-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <>
                  <button
                    onClick={() => {
                      setMedToDelete(med);
                      setShowDeleteMedDialog(true);
                    }}
                    className="text-gray-600 hover:text-red-400 transition-colors p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {medToDelete && (
                    <ConfirmationDialog
                      isOpen={showDeleteMedDialog}
                      title="Delete medication reminder"
                      message={`Delete reminder for ${medToDelete.medication_name}? This cannot be undone.`}
                      confirmText="Delete"
                      cancelText="Cancel"
                      isDangerous
                      onConfirm={() =>
                        deleteMed(medToDelete.id, medToDelete.medication_name)
                      }
                      onCancel={() => {
                        setShowDeleteMedDialog(false);
                        setMedToDelete(null);
                      }}
                    />
                  )}
                </>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
