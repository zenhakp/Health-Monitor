"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { storeAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui/Spinner";
import toast from "react-hot-toast";
import { Eye, EyeOff, Activity, User, Mail, Phone, MapPin, Lock } from "lucide-react";
import { api, authApi } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: "", email: "", password: "", confirm_password: "",
    phone: "", address: "", role: "patient"
  });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm_password) { toast.error("Passwords do not match"); return; }
    if (form.password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (!form.phone) { toast.error("Phone number is required"); return; }
    setLoading(true);
    try {
      await api.post("/api/v1/auth/register", {
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        phone: form.phone,
        address: form.address,
        role: form.role,
      });
      toast.success("Account created! Signing you in...");
      const res = await authApi.login(form.email, form.password);
      const { access_token, refresh_token } = res.data;
      const meRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/me`,
        { headers: { Authorization: `Bearer ${access_token}` } }
      );
      const user = await meRes.json();
      storeAuth(access_token, refresh_token, user);
      if (user.role === "doctor") router.push("/dashboard/doctor");
      else router.push("/dashboard/patient");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-dark-800 border border-dark-600 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all";

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-white">VitalWatch</span>
        </div>

        <div className="bg-dark-900 border border-dark-600 rounded-2xl p-8">
          <h1 className="text-xl font-semibold text-white mb-1">Create account</h1>
          <p className="text-gray-400 text-sm mb-6">All fields marked * are required</p>

          <form onSubmit={handleRegister} className="space-y-4">
            {/* Role */}
            <div>
              <label className="text-xs font-medium text-gray-400 block mb-1.5">I am a *</label>
              <div className="grid grid-cols-2 gap-2">
                {["patient", "doctor"].map(r => (
                  <button key={r} type="button" onClick={() => update("role", r)}
                    className={`py-2.5 rounded-xl text-sm font-medium border transition-all capitalize ${
                      form.role === r ? "bg-blue-600 border-blue-600 text-white" : "bg-dark-800 border-dark-600 text-gray-400 hover:border-dark-500"
                    }`}>
                    {r === "doctor" ? "Doctor / Clinician" : "Patient"}
                  </button>
                ))}
              </div>
            </div>

            {/* Full name */}
            <div>
              <label className="text-xs font-medium text-gray-400 block mb-1.5">
                Full name * {form.role === "doctor" && <span className="text-blue-400">(Dr. prefix will be added automatically)</span>}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input value={form.full_name} onChange={e => update("full_name", e.target.value)}
                  placeholder={form.role === "doctor" ? "Sarah Chen" : "John Doe"}
                  required className={inputClass} />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="text-xs font-medium text-gray-400 block mb-1.5">Email *</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="email" value={form.email} onChange={e => update("email", e.target.value)}
                  placeholder="you@example.com" required className={inputClass} />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="text-xs font-medium text-gray-400 block mb-1.5">Phone number *</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="tel" value={form.phone} onChange={e => update("phone", e.target.value)}
                  placeholder="+91 98765 43210" required className={inputClass} />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="text-xs font-medium text-gray-400 block mb-1.5">Address</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                <textarea value={form.address} onChange={e => update("address", e.target.value)}
                  placeholder="Street, City, State, PIN"
                  rows={2}
                  className="w-full bg-dark-800 border border-dark-600 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none" />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-xs font-medium text-gray-400 block mb-1.5">Password *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type={showPw ? "text" : "password"} value={form.password}
                  onChange={e => update("password", e.target.value)}
                  placeholder="Minimum 8 characters" required
                  className="w-full bg-dark-800 border border-dark-600 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all" />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div>
              <label className="text-xs font-medium text-gray-400 block mb-1.5">Confirm password *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="password" value={form.confirm_password}
                  onChange={e => update("confirm_password", e.target.value)}
                  placeholder="Repeat password" required className={inputClass} />
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-all flex items-center justify-center gap-2">
              {loading ? <><Spinner size="sm" /> Creating account...</> : "Create account"}
            </button>
          </form>

          <p className="text-center text-gray-500 text-sm mt-4">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}