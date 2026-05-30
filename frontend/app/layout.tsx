import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";

import HeartbeatProvider from "@/components/providers/heartbeat-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "VitalWatch — AI Health Monitoring",
  description: "Real-time AI-powered patient health monitoring platform",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>❤️</text></svg>",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans bg-dark-950 text-gray-100 min-h-screen">
        <HeartbeatProvider>
          {children}
        </HeartbeatProvider>

        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#0f1623",
              color: "#f9fafb",
              border: "0.5px solid rgba(255,255,255,0.08)",
              borderRadius: "10px",
              fontSize: "13px",
            },
            success: {
              iconTheme: {
                primary: "#22c55e",
                secondary: "#0f1623",
              },
            },
            error: {
              iconTheme: {
                primary: "#ef4444",
                secondary: "#0f1623",
              },
            },
          }}
        />
      </body>
    </html>
  );
}