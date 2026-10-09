import { useEffect, useState, type ReactNode } from "react";
import { apiClient, TOKEN_STORAGE_KEY } from "../api/client";
import type { User } from "../api/types";
import { AuthContext } from "./AuthContext";

// Email 去空白、轉小寫（手機鍵盤常自動把第一個字母變大寫）
function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // 有存登入憑證才需要等 /auth/me，沒有就直接顯示登入頁
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_STORAGE_KEY)));

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_STORAGE_KEY)) return;
    let active = true;
    apiClient
      .get<User & { token?: string }>("/auth/me")
      .then(({ data }) => {
        if (!active) return;
        // 每次打開換發新憑證：有在用的人不會因為到期被登出
        const { token, ...me } = data;
        if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
        setUser(me);
      })
      .catch(() => {
        if (!active) return;
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function login(email: string, password: string) {
    const { data } = await apiClient.post<{ token: string; user: User }>("/auth/login", {
      email: normalizeEmail(email),
      password,
    });
    localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    setUser(data.user);
  }

  async function register(email: string, password: string, name: string) {
    const { data } = await apiClient.post<{ token: string; user: User }>("/auth/register", {
      email: normalizeEmail(email),
      password,
      name,
    });
    localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
