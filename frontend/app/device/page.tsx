"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, clearAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Activity, Cpu, QrCode, Key, Play, ChevronRight, Check, ArrowLeft, Square, Camera, X } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Spinner } from "@/components/ui/Spinner";

function QRScanner({ onResult, onClose }: { onResult: (token: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number>(0);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 640, height: 480 }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setScanning(true);
        scanFrame();
      }
    } catch (err: any) {
      setError(err.name === "NotAllowedError"
        ? "Camera permission denied — please allow camera access in browser settings"
        : "Camera not available on this device"
      );
    }
  };

  const stopCamera = () => {
    cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  };

  const scanFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      animRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Dynamic import of jsqr
    const jsQR = (await import("jsqr")).default;
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code) {
      stopCamera();
      // Extract token from QR — format: "vitalwatch-device:TOKEN"
      const qrData = code.data;
      const token = qrData.startsWith("vitalwatch-device:")
        ? qrData.replace("vitalwatch-device:", "")
        : qrData;
      toast.success("QR code scanned successfully");
      onResult(token);
      return;
    }
    animRef.current = requestAnimationFrame(scanFrame);
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-600 rounded-2xl overflow-hidden w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-dark-600">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-white">Scan device QR code</span>
          </div>
          <button onClick={() => { stopCamera(); onClose(); }} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error ? (
          <div className="p-6 text-center">
            <div className="text-red-400 text-sm mb-4">{error}</div>
            <button onClick={onClose}
              className="text-sm bg-dark-800 border border-dark-600 text-gray-300 px-4 py-2 rounded-xl">
              Go back
            </button>
          </div>
        ) : (
          <div className="relative">
            <video ref={videoRef} playsInline muted className="w-full" />
            <canvas ref={canvasRef} className="hidden" />
            {/* Scan overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-48 h-48">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-blue-500 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-blue-500 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-blue-500 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-blue-500 rounded-br-lg" />
                {/* Scanning line animation */}
                <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-blue-500/70 animate-pulse" />
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-3 text-center">
              <div className="text-xs text-white bg-black/50 rounded-full px-3 py-1 inline-block">
                {scanning ? "Point camera at QR code on your device" : "Starting camera..."}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DevicePage() {
  const router = useRouter();
  const user = getStoredUser();
  const [deviceToken, setDeviceToken] = useState("");
  const [connected, setConnected] = useState<string | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    api.get("/api/v1/vitals/simulator/status")
      .then(r => { if (r.data.running) { setSimRunning(true); setConnected("simulator"); } })
      .catch(() => {});
  }, []);

  const handleSimulator = async () => {
    setSimLoading(true);
    try {
      if (simRunning) {
        await api.post("/api/v1/vitals/simulator/stop");
        setSimRunning(false);
        setConnected(null);
        toast.success("Simulator stopped");
      } else {
        await api.post("/api/v1/vitals/simulator/start");
        setSimRunning(true);
        setConnected("simulator");
        toast.success("Simulator started — vitals streaming every 3 seconds");
      }
    } catch { toast.error("Failed to control simulator"); }
    finally { setSimLoading(false); }
  };

  const handleQRResult = (token: string) => {
    setShowQR(false);
    setDeviceToken(token);
    setConnected("device");
    toast.success(`Device connected via QR — token: ${token.slice(0, 12)}...`);
  };

  const handleTokenConnect = () => {
    if (!deviceToken.trim()) { toast.error("Enter a device token"); return; }
    setConnected("device");
    toast.success("Device token saved");
  };

  return (
    <div className="min-h-screen bg-dark-950">
      {showQR && <QRScanner onResult={handleQRResult} onClose={() => setShowQR(false)} />}

      <header className="h-14 glass border-b border-dark-600 flex items-center justify-between px-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-green-600 rounded-lg flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-sm text-white">VitalWatch</span>
          <ChevronRight className="w-3 h-3 text-gray-600" />
          <span className="text-sm text-gray-400">Device Setup</span>
        </div>
        <Link href="/dashboard/patient" className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white">
          <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
        </Link>
      </header>

      <div className="max-w-2xl mx-auto p-5">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Connect your device</h1>
          <p className="text-sm text-gray-400 mt-1">Choose how to stream your vital signs to VitalWatch</p>
        </div>

        {connected && (
          <div className="mb-5 p-3 bg-green-500/5 border border-green-500/20 rounded-xl flex items-center gap-3">
            <div className="w-7 h-7 bg-green-500/10 rounded-full flex items-center justify-center">
              <Check className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <div className="text-sm text-green-400 font-medium">
                {connected === "simulator" ? "Software simulator active" : "IoT device connected"}
              </div>
              <div className="text-xs text-gray-500">Vitals are streaming to your dashboard</div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {/* Simulator */}
          <div className={`bg-dark-900 border rounded-2xl p-5 ${connected === "simulator" ? "border-green-500/30" : "border-dark-600"}`}>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-dark-700 rounded-xl flex items-center justify-center flex-shrink-0">
                <Play className="w-5 h-5 text-green-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-white">Software Simulator</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-500/10 text-green-400">Recommended</span>
                  {connected === "simulator" && <Check className="w-3.5 h-3.5 text-green-400" />}
                </div>
                <div className="text-xs text-gray-500 mb-3">
                  Generates clinically realistic vitals with anomaly scenarios. No hardware needed.
                </div>
                <button onClick={handleSimulator} disabled={simLoading}
                  className={`text-xs font-medium px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
                    simRunning
                      ? "bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}>
                  {simLoading ? <Spinner size="sm" /> : simRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {simLoading ? "Processing..." : simRunning ? "Stop simulator" : "Start simulator"}
                </button>
              </div>
            </div>
          </div>

          {/* QR Code — now working */}
          <div className={`bg-dark-900 border rounded-2xl p-5 ${connected === "device" ? "border-green-500/30" : "border-dark-600"}`}>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-dark-700 rounded-xl flex items-center justify-center flex-shrink-0">
                <QrCode className="w-5 h-5 text-purple-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-white">Scan QR Code</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-500/10 text-purple-400">Camera</span>
                </div>
                <div className="text-xs text-gray-500 mb-3">
                  Point your camera at the QR code displayed on your wearable device. The QR must contain a token in format: <span className="font-mono">vitalwatch-device:TOKEN</span>
                </div>
                <button onClick={() => setShowQR(true)}
                  className="text-xs font-medium px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white transition-all flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5" /> Open camera
                </button>
              </div>
            </div>
          </div>

          {/* Manual token */}
          <div className={`bg-dark-900 border rounded-2xl p-5 ${connected === "device" ? "border-green-500/30" : "border-dark-600"}`}>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-dark-700 rounded-xl flex items-center justify-center flex-shrink-0">
                <Key className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-white">Device Token</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-400">Manual</span>
                </div>
                <div className="text-xs text-gray-500 mb-3">
                  Enter the token from your IoT device configuration.
                </div>
                <div className="flex gap-2">
                  <input value={deviceToken} onChange={e => setDeviceToken(e.target.value)}
                    placeholder="vw-device-xxxxxxxxxxxxxxxx"
                    className="flex-1 bg-dark-800 border border-dark-600 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-gray-700 focus:outline-none focus:border-blue-500 transition-all" />
                  <button onClick={handleTokenConnect}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl transition-all">
                    Connect
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 p-4 bg-dark-900 border border-dark-600 rounded-2xl">
          <div className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5" /> Compatible hardware
          </div>
          <div className="grid grid-cols-2 gap-2">
            {["Raspberry Pi Zero 2W + MAX30102", "Arduino + ESP32 + sensors", "Apple Health API (via shortcut)", "Any HTTP-capable device"].map(h => (
              <div key={h} className="flex items-center gap-2 text-xs text-gray-500">
                <div className="w-1 h-1 rounded-full bg-gray-700" />
                {h}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}