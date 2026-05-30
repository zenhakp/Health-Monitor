"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi, api } from "@/lib/api";
import { storeAuth } from "@/lib/auth";
import { normalizeDoctorName } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";
import toast from "react-hot-toast";
import { Eye, EyeOff, Activity, Shield, Lock, Zap } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [userId, setUserId] = useState("");
  const [demoOtp, setDemoOtp] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [emailFailed, setEmailFailed] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authApi.login(email, password);

      if (res.data.requires_otp) {
        setUserId(res.data.user_id);
        setMaskedEmail(res.data.masked_email || "your registered email");
        setOtpStep(true);
        setLoading(false);

        if (res.data.email_delivered === false) {
          setEmailFailed(true);
          toast.error(
            "Verification code was generated but could not be emailed. Please contact your administrator or try again.",
            { duration: 8000 },
          );
        } else {
          setEmailFailed(false);
          toast.success(`Verification code sent to ${res.data.masked_email}`);
          startCountdown();
        }
        return;
      }
      await completeLogin(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };
  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/api/v1/auth/verify-otp", {
        user_id: userId,
        otp_code: otpCode,
      });
      await completeLogin(res.data);
    } catch (err: any) {
      const detail = err.response?.data?.detail || "Verification failed";
      toast.error(detail);
      setOtpCode(""); // clear input after wrong attempt
      if (err.response?.status === 429) {
        // Too many attempts — go back to login
        setOtpStep(false);
        setOtpCode("");
      }
    } finally {
      setLoading(false);
    }
  };

  const startCountdown = () => {
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setResending(true);
    try {
      // Log in again to trigger new OTP
      const res = await authApi.login(email, password);
      if (res.data.requires_otp) {
        setUserId(res.data.user_id);
        toast.success("New verification code sent");
        startCountdown();
        setOtpCode("");
      }
    } catch {
      toast.error("Failed to resend code");
    } finally {
      setResending(false);
    }
  };

  const getWelcomeMessage = (user: any) => {
    if (user.role === "admin") return "Welcome back, admin";
    if (user.role === "doctor")
      return `Welcome back, ${normalizeDoctorName(user.full_name)}`;
    return `Welcome back, ${user.full_name}`;
  };

  const completeLogin = async (tokenData: any) => {
    const { access_token, refresh_token } = tokenData;
    storeAuth(access_token, refresh_token, {
      id: "",
      email: "",
      full_name: "",
      role: "patient",
    });

    const meRes = await authApi.me();
    const user = meRes.data;
    storeAuth(access_token, refresh_token, user);

    toast.success(getWelcomeMessage(user));
    if (user.role === "admin") router.push("/dashboard/admin");
    else if (user.role === "doctor") router.push("/dashboard/doctor");
    else router.push("/dashboard/patient");
  };

  return (
    <div className="min-h-screen bg-dark-950 flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] bg-dark-900 border-r border-dark-600 p-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-semibold text-white">VitalWatch</span>
        </div>

        <div>
          <div className="text-3xl font-semibold text-white leading-tight mb-4">
            AI-powered patient monitoring for modern healthcare
          </div>
          <p className="text-gray-400 text-sm leading-relaxed mb-10">
            Real-time vital sign tracking, intelligent anomaly detection, and
            instant clinical alerts — all in one platform.
          </p>

          <div className="space-y-4">
            {[
              {
                icon: Zap,
                title: "Real-time alerts",
                desc: "Sub-second anomaly detection with LLM-powered clinical interpretation",
              },
              {
                icon: Shield,
                title: "HIPAA-grade security",
                desc: "AES-256 encryption at rest, JWT auth, immutable audit logs",
              },
              {
                icon: Activity,
                title: "Multi-vital monitoring",
                desc: "Heart rate, SpO₂, blood pressure, temperature, respiratory rate",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-3">
                <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs text-gray-600">
          © 2026 VitalWatch. Built with AES-256 encryption.
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-semibold">VitalWatch</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-white">Sign in</h1>
            <p className="text-gray-400 text-sm mt-1">
              Access your monitoring dashboard
            </p>
          </div>

          {otpStep ? (
            <form onSubmit={handleOtpVerify} className="space-y-4">
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-7 h-7 text-blue-400" />
                </div>
                <h2 className="text-lg font-semibold text-white">
                  Two-step verification
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  We sent a 6-digit code to
                  <br />
                  <span className="text-white font-medium">{maskedEmail}</span>
                </p>
              </div>
              {emailFailed && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                  Email delivery failed. Your administrator can retrieve the
                  code from the server logs. Contact support if you cannot sign
                  in.
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-400 block mb-1.5">
                  Verification code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="• • • • • •"
                  maxLength={6}
                  autoFocus
                  className="w-full bg-dark-900 border border-dark-600 rounded-xl px-4 py-4 text-center text-3xl font-mono tracking-widest text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder-gray-700"
                />
                {demoOtp ? (
                  <div className="mt-3 text-xs text-yellow-300 bg-yellow-900/10 border border-yellow-700 rounded-xl p-3">
                    Development OTP: <strong>{demoOtp}</strong>
                  </div>
                ) : null}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-600">
                    Code expires in 10 minutes
                  </span>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={countdown > 0 || resending}
                    className="text-xs text-blue-400 hover:text-blue-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
                  >
                    {resending
                      ? "Sending..."
                      : countdown > 0
                        ? `Resend in ${countdown}s`
                        : "Resend code"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Spinner size="sm" /> Verifying...
                  </>
                ) : (
                  "Verify & Sign in"
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setOtpStep(false);
                  setOtpCode("");
                  setCountdown(0);
                }}
                className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors py-1"
              >
                ← Use a different account
              </button>

              <div className="flex items-start gap-2 p-3 bg-dark-900 border border-dark-600 rounded-xl">
                <Lock className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-500 leading-relaxed">
                  Never share this code with anyone. VitalWatch staff will never
                  ask for your verification code.
                </p>
              </div>
            </form>
          ) : (
            <>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-400 block mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    required
                    className="w-full bg-dark-900 border border-dark-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-400 block mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full bg-dark-900 border border-dark-600 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Spinner size="sm" /> Signing in...
                    </>
                  ) : (
                    "Sign in"
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <span className="text-gray-500 text-sm">
                  Don&apos;t have an account?{" "}
                </span>
                <Link
                  href="/register"
                  className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
                >
                  Register
                </Link>
              </div>

              <div className="mt-8 p-3 bg-dark-900 border border-dark-600 rounded-xl">
                <div className="text-xs text-gray-500 font-medium mb-2">
                  Demo accounts
                </div>
                <div className="space-y-1">
                  {[
                    {
                      role: "Doctor",
                      email: "doctor@test.com",
                      pw: "test1234",
                    },
                    {
                      role: "Patient",
                      email: "patient@test.com",
                      pw: "test1234",
                    },
                    {
                      role: "Admin",
                      email: "admin@vitalwatch.com",
                      pw: "Admin@VitalWatch2026",
                    },
                  ].map((a) => (
                    <button
                      key={a.role}
                      onClick={() => {
                        setEmail(a.email);
                        setPassword(a.pw);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-dark-700 transition-colors flex items-center gap-2"
                    >
                      <span
                        className={`text-xs font-medium ${
                          a.role === "Doctor"
                            ? "text-blue-400"
                            : a.role === "Admin"
                              ? "text-purple-400"
                              : "text-green-400"
                        }`}
                      >
                        {a.role}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">
                        {a.email}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
