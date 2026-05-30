import Cookies from "js-cookie";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "doctor" | "patient" | "admin";
}

export const getStoredUser = (): User | null => {
  const stored =
    Cookies.get("user") ||
    (typeof window !== "undefined"
      ? window.localStorage.getItem("user") || ""
      : "");
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
};

export const storeAuth = (
  accessToken: string,
  refreshToken: string,
  user: User,
) => {
  Cookies.set("access_token", accessToken, { expires: 1 });
  Cookies.set("refresh_token", refreshToken, { expires: 7 });
  Cookies.set("user", JSON.stringify(user), { expires: 1 });

  if (typeof window !== "undefined") {
    window.localStorage.setItem("access_token", accessToken);
    window.localStorage.setItem("refresh_token", refreshToken);
    window.localStorage.setItem("user", JSON.stringify(user));
  }
};

export const clearAuth = () => {
  Cookies.remove("access_token");
  Cookies.remove("refresh_token");
  Cookies.remove("user");
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("access_token");
    window.localStorage.removeItem("refresh_token");
    window.localStorage.removeItem("user");
  }
};

export const isAuthenticated = () => !!Cookies.get("access_token");

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "doctor" | "patient" | "admin";
  avatar_url?: string;
}
