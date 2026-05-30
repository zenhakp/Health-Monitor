"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated, getStoredUser } from "@/lib/auth";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
    } else {
      const user = getStoredUser();
      if (user?.role === "admin") router.push("/dashboard/admin");
      else if (user?.role === "doctor") router.push("/dashboard/doctor");
      else router.push("/dashboard/patient");
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-white text-lg animate-pulse">Loading...</div>
    </div>
  );
}