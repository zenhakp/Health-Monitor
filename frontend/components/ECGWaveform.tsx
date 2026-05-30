"use client";
import { useEffect, useRef } from "react";

interface ECGWaveformProps {
  heartRate: number;
  anomaly: boolean;
}

export default function ECGWaveform({ heartRate, anomaly }: ECGWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offsetRef = useRef(0);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const mid = H / 2;
    const speed = (heartRate / 60) * 3; // pixels per frame based on HR
    const color = anomaly ? "#ef4444" : "#22c55e";

    // ECG shape points (normalized 0-1)
    const ecgShape = [0, 0, 0, 0.05, -0.05, 0, 0, 0, 0.8, -0.4, 0.15, -0.1, 0, 0, 0, 0, 0, 0, 0, 0];

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Grid lines
      ctx.strokeStyle = "rgba(255,255,255,0.03)";
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 20) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 10) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // ECG line
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = anomaly ? 8 : 4;
      ctx.shadowColor = color;

      const period = W / 2;
      for (let x = 0; x < W; x++) {
        const pos = ((x + offsetRef.current) % period) / period;
        const idx = Math.floor(pos * ecgShape.length);
        const frac = (pos * ecgShape.length) % 1;
        const y1 = ecgShape[idx] || 0;
        const y2 = ecgShape[(idx + 1) % ecgShape.length] || 0;
        const yVal = y1 + (y2 - y1) * frac;
        const yPos = mid - yVal * (H * 0.8);
        if (x === 0) ctx.moveTo(x, yPos);
        else ctx.lineTo(x, yPos);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      offsetRef.current = (offsetRef.current + speed) % period;
      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [heartRate, anomaly]);

  return (
    <div className="vital-card p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">ECG Waveform</span>
        <div className="flex items-center gap-2">
          {anomaly && <span className="text-xs text-red-400 animate-pulse">⚠ Anomaly</span>}
          <span className={`text-sm font-semibold ${anomaly ? "text-red-400" : "text-green-400"}`}>
            {heartRate?.toFixed(0)} <span className="text-xs font-normal text-gray-500">bpm</span>
          </span>
        </div>
      </div>
      <canvas ref={canvasRef} width={400} height={60} className="w-full" style={{ height: 60 }} />
    </div>
  );
}