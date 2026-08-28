"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) return { theme: "dark" as Theme, toggleTheme: () => {}, setTheme: () => {} };
  return ctx;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("snt-theme") as Theme | null;
      if (saved === "light" || saved === "dark") {
        setThemeState(saved);
        document.documentElement.setAttribute("data-theme", saved);
      } else {
        document.documentElement.setAttribute("data-theme", "dark");
      }
    } catch {
      document.documentElement.setAttribute("data-theme", "dark");
    }
    setMounted(true);
  }, []);

  const applyTheme = useCallback((t: Theme) => {
    document.documentElement.setAttribute("data-theme", t);
    document.documentElement.classList.add("theme-transitioning");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      document.documentElement.classList.remove("theme-transitioning");
    }, 400);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    try { localStorage.setItem("snt-theme", t); } catch {}
  }, [applyTheme]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
