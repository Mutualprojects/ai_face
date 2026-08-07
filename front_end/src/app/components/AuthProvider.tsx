"use client";

/**
 * useAuth — reads session from sessionStorage (set by login page).
 * Returns { user, role, isAuthenticated, logout }.
 * No external deps — works with the self-hosted Supabase JWT we generate.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";

export interface SentinelSession {
  access_token: string;
  user: { id: string; email: string };
  role: "super_admin" | "admin" | "viewer";
  full_name: string;
  email: string;
  department: string;
  logged_in_at: number;
}

interface AuthCtx {
  session: SentinelSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (sess: SentinelSession) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx>({
  session: null,
  isAuthenticated: false,
  isLoading: true,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession]   = useState<SentinelSession | null>(null);
  const [isLoading, setLoading] = useState(true);
  const router   = useRouter();
  const pathname = usePathname();

  const PUBLIC_ROUTES = ["/login", "/checkin", "/employee-register"];

  useEffect(() => {
    const stored = sessionStorage.getItem("sentinel_session");
    if (stored) {
      try {
        const sess: SentinelSession = JSON.parse(stored);
        // 24h expiry check
        if (Date.now() - sess.logged_in_at < 24 * 60 * 60 * 1000) {
          setSession(sess);
        } else {
          sessionStorage.removeItem("sentinel_session");
        }
      } catch {
        sessionStorage.removeItem("sentinel_session");
      }
    }
    setLoading(false);
  }, []);

  // Route guard
  useEffect(() => {
    if (isLoading) return;
    const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r));
    if (!session && !isPublic) {
      router.replace("/login");
    }
    if (session && pathname === "/login") {
      router.replace("/");
    }
  }, [session, isLoading, pathname, router]);

  const login = useCallback((sess: SentinelSession) => {
    sessionStorage.setItem("sentinel_session", JSON.stringify(sess));
    setSession(sess);
    router.replace("/");
  }, [router]);

  const logout = useCallback(() => {
    sessionStorage.removeItem("sentinel_session");
    setSession(null);
    router.replace("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ session, isAuthenticated: !!session, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
