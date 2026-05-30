"use client";

import { useEffect } from "react";
import Cookies from "js-cookie";
import { api } from "@/lib/api";

export default function HeartbeatProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const sendHeartbeat = () => {
      if (Cookies.get("access_token")) {
        api.post("/api/v1/auth/heartbeat").catch(() => {});
      }
    };

    sendHeartbeat();

    const interval = setInterval(sendHeartbeat, 2 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return <>{children}</>;
}