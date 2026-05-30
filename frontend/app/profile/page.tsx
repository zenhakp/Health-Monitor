"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getStoredUser, clearAuth, storeAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";
import toast from "react-hot-toast";
import Cookies from "js-cookie";
import {
  Activity,
  ArrowLeft,
  Camera,
  User,
  Mail,
  Phone,
  MapPin,
  Save,
  LogOut,
  UserX,
  Edit3,
  Check,
  X,
} from "lucide-react";
import Link from "next/link";
import ConfirmationDialog from "@/components/ConfirmationDialog";

export default function ProfilePage() {
  const router = useRouter();
  const user = getStoredUser();
  const fileRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const [form, setForm] = useState({ full_name: "", phone: "", address: "" });

  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await api.get("/api/v1/profile/me");
      setProfile(res.data);
      setForm({
        full_name: res.data.full_name.replace("Dr. ", ""),
        phone: res.data.phone,
        address: res.data.address,
      });
    } catch (e: any) {
      console.error("Failed to load profile:", e);
      const detail =
        e?.response?.data?.detail || e?.message || "Failed to load profile";
      toast.error(detail);
      if (e?.response?.status === 401) {
        // If token invalid, clear auth and redirect to login
        clearAuth();
        router.push("/login");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.patch("/api/v1/profile/update", form);
      setProfile((prev: any) => ({ ...prev, ...res.data }));
      setEditing(false);
      toast.success("Profile updated successfully");

      // Update stored user cookie
      const updatedUser = { ...user, full_name: res.data.full_name };
      Cookies.set("user", JSON.stringify(updatedUser), { expires: 1 });
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/api/v1/profile/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setProfile((prev: any) => ({ ...prev, avatar_url: res.data.avatar_url }));
      toast.success("Profile picture updated");
    } catch {
      toast.error("Failed to upload image");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await api.delete("/api/v1/auth/account");
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

  const backPath =
    profile?.role === "doctor" ? "/dashboard/doctor" : "/dashboard/patient";

  const initials = (name: string) =>
    name
      .split(" ")
      .filter((n) => n !== "Dr.")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div className="min-h-screen bg-dark-950">
      <header className="h-14 glass border-b border-dark-600 flex items-center justify-between px-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-sm text-white">VitalWatch</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={backPath}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
          </Link>
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

      <div className="max-w-xl mx-auto p-5">
        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Avatar section */}
            <div className="flex flex-col items-center py-6">
              <div className="relative mb-4">
                <div className="w-24 h-24 rounded-full overflow-hidden bg-dark-700 border-2 border-dark-600">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className={`w-full h-full flex items-center justify-center ${
                        profile?.role === "doctor"
                          ? "bg-blue-500/10"
                          : "bg-green-500/10"
                      }`}
                    >
                      <span
                        className={`text-2xl font-semibold ${
                          profile?.role === "doctor"
                            ? "text-blue-400"
                            : "text-green-400"
                        }`}
                      >
                        {initials(profile?.full_name || "")}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute -bottom-1 -right-1 w-8 h-8 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center shadow-lg transition-all"
                >
                  {uploadingAvatar ? (
                    <Spinner size="sm" />
                  ) : (
                    <Camera className="w-3.5 h-3.5 text-white" />
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>
              <div className="text-lg font-semibold text-white">
                {profile?.full_name}
              </div>
              <div className="text-sm text-gray-400 capitalize">
                {profile?.role}
              </div>
              <div className="text-xs text-gray-600 mt-1">{profile?.email}</div>
            </div>

            {/* Profile info */}
            <div className="bg-dark-900 border border-dark-600 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-dark-600">
                <span className="text-sm font-medium text-white">
                  Personal Information
                </span>
                {!editing ? (
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditing(false)}
                      className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-all"
                    >
                      {saving ? (
                        <Spinner size="sm" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                      Save
                    </button>
                  </div>
                )}
              </div>

              <div className="p-5 space-y-4">
                {[
                  {
                    icon: User,
                    label: "Full name",
                    field: "full_name",
                    value: profile?.full_name,
                    hint:
                      profile?.role === "doctor"
                        ? "Dr. prefix added automatically"
                        : "",
                  },
                  {
                    icon: Phone,
                    label: "Phone",
                    field: "phone",
                    value: profile?.phone || "Not set",
                    type: "tel",
                  },
                  {
                    icon: MapPin,
                    label: "Address",
                    field: "address",
                    value: profile?.address || "Not set",
                    multiline: true,
                  },
                ].map(
                  ({
                    icon: Icon,
                    label,
                    field,
                    value,
                    hint,
                    type,
                    multiline,
                  }) => (
                    <div key={field}>
                      <label className="text-xs text-gray-500 flex items-center gap-1.5 mb-1.5">
                        <Icon className="w-3.5 h-3.5" /> {label}
                      </label>
                      {editing ? (
                        multiline ? (
                          <textarea
                            value={form[field as keyof typeof form]}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                [field]: e.target.value,
                              }))
                            }
                            rows={2}
                            className="w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all resize-none"
                          />
                        ) : (
                          <input
                            type={type || "text"}
                            value={form[field as keyof typeof form]}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                [field]: e.target.value,
                              }))
                            }
                            className="w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all"
                          />
                        )
                      ) : (
                        <div className="text-sm text-white">{value}</div>
                      )}
                      {hint && editing && (
                        <div className="text-xs text-gray-600 mt-1">{hint}</div>
                      )}
                    </div>
                  ),
                )}

                <div>
                  <label className="text-xs text-gray-500 flex items-center gap-1.5 mb-1.5">
                    <Mail className="w-3.5 h-3.5" /> Email
                  </label>
                  <div className="text-sm text-gray-400">
                    {profile?.email}
                    <span className="text-xs text-gray-600 ml-2">
                      (cannot be changed)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Account stats */}
            <div className="bg-dark-900 border border-dark-600 rounded-2xl p-5">
              <div className="text-sm font-medium text-white mb-3">Account</div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-gray-500">Member since</div>
                  <div className="text-white mt-0.5">
                    {profile?.created_at ? formatDate(profile.created_at) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Last login</div>
                  <div className="text-white mt-0.5">
                    {profile?.last_login
                      ? formatDate(profile.last_login)
                      : "Never"}
                  </div>
                </div>
              </div>
            </div>

            {/* Danger zone */}
            <div className="bg-dark-900 border border-red-500/20 rounded-2xl p-5">
              <div className="text-sm font-medium text-red-400 mb-1">
                Danger zone
              </div>
              <div className="text-xs text-gray-500 mb-3">
                Deleting your account will deactivate it. Medical records are
                retained as required by healthcare regulations.
              </div>
              <button
                onClick={() => setShowDeleteDialog(true)}
                disabled={deletingAccount}
                className="relative z-50 flex items-center gap-2 text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 px-4 py-2 rounded-xl transition-all"
              >
                {deletingAccount ? (
                  <Spinner size="sm" />
                ) : (
                  <UserX className="w-3.5 h-3.5" />
                )}
                Delete my account
              </button>
            </div>
          </div>
        )}
      </div>
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        title="Delete your account"
        message="Delete your account? This will deactivate it. Your medical data will be retained for records."
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onConfirm={handleDeleteAccount}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </div>
  );
}
