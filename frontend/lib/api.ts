import axios from "axios";
import Cookies from "js-cookie";
import { parseDate } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// Auto-attach token to every request
api.interceptors.request.use((config) => {
  let token = Cookies.get("access_token");
  if (!token && typeof window !== "undefined") {
    token = window.localStorage.getItem("access_token") || undefined;
  }
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      let refresh = Cookies.get("refresh_token");
      if (!refresh && typeof window !== "undefined") {
        refresh = window.localStorage.getItem("refresh_token") || undefined;
      }
      if (refresh) {
        try {
          const res = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
            refresh_token: refresh,
          });
          Cookies.set("access_token", res.data.access_token, { expires: 1 });
          if (typeof window !== "undefined") {
            window.localStorage.setItem("access_token", res.data.access_token);
          }
          error.config.headers.Authorization = `Bearer ${res.data.access_token}`;
          return axios(error.config);
        } catch {
          Cookies.remove("access_token");
          Cookies.remove("refresh_token");
          if (typeof window !== "undefined") {
            window.localStorage.removeItem("access_token");
            window.localStorage.removeItem("refresh_token");
          }
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  },
);

export const authApi = {
  login: (email: string, password: string) =>
    api.post("/api/v1/auth/login", { email, password }),
  me: () => api.get("/api/v1/auth/me"),
  deleteAccount: () => api.delete("/api/v1/auth/account"),
};

export const patientApi = {
  list: () => api.get("/api/v1/patients/"),
  get: (id: string) => api.get(`/api/v1/patients/${id}`),
};

export const vitalsApi = {
  getPatientVitals: (patientId: string, limit = 50) =>
    api.get(`/api/v1/vitals/patient/${patientId}?limit=${limit}`),
  getAnomalies: (patientId: string) =>
    api.get(`/api/v1/vitals/anomalies/${patientId}`),
};

export const alertApi = {
  getPatientAlerts: (patientId: string) =>
    api.get(`/api/v1/alerts/patient/${patientId}`),
  getSosAlerts: (unacknowledgedOnly = true, limit = 100) =>
    api.get(
      `/api/v1/alerts/sos?unacknowledged_only=${unacknowledgedOnly}&limit=${limit}`,
    ),
  acknowledge: (alertId: string, notes: string) =>
    api.patch(`/api/v1/alerts/${alertId}/acknowledge`, { notes }),
};

export const createSSEConnection = (
  patientId: string,
  token: string,
  onAlert: (data: any) => void,
  onHeartbeat?: () => void,
) => {
  const url = `${API_URL}/api/v1/alerts/stream/${patientId}`;
  const eventSource = new EventSource(url + `?token=${token}`);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "heartbeat") {
      onHeartbeat?.();
    } else if (data.type === "alert") {
      onAlert(data);
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    // Reconnect after 3s
    setTimeout(
      () => createSSEConnection(patientId, token, onAlert, onHeartbeat),
      3000,
    );
  };

  return eventSource;
};

export const reportApi = {
  upload: (file: File, description: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("description", description);
    return api.post("/api/v1/reports/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  getPatientReports: (patientId: string) =>
    api.get(`/api/v1/reports/patient/${patientId}`),
  getViewUrl: (reportId: string) =>
    `${process.env.NEXT_PUBLIC_API_URL}/api/v1/reports/view/${reportId}`,
};

export const getOnlineStatus = (
  lastLogin: string | null,
): "online" | "idle" | "offline" => {
  if (!lastLogin) return "offline";
  const diff = Date.now() - parseDate(lastLogin).getTime();
  const minutes = diff / 1000 / 60;
  if (minutes < 3) return "online";
  if (minutes < 10) return "idle";
  return "offline";
};
