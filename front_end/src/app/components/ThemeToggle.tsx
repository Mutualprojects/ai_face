"use client";

import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <>
      <style>{`
        .snt-theme-pill {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0;
          height: 38px;
          padding: 4px;
          border-radius: 14px;
          background: var(--bg-input);
          border: 1px solid var(--border-strong);
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
        }
        .snt-theme-pill:hover {
          border-color: var(--violet);
          box-shadow: 0 0 0 3px var(--violet-soft), var(--shadow-sm);
          transform: translateY(-1px);
        }
        .snt-theme-pill:active {
          transform: scale(0.96);
        }
        .snt-theme-track {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 30px;
          height: 30px;
          border-radius: 10px;
          background: linear-gradient(135deg, var(--violet), var(--violet-deep));
          box-shadow: 0 2px 8px rgba(99,102,241,0.35);
          transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          z-index: 1;
        }
        [data-theme="light"] .snt-theme-track {
          transform: translateX(34px);
          width: 30px;
        }
        .snt-theme-pill-icon {
          position: relative;
          z-index: 2;
          width: 38px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.3s ease, opacity 0.3s ease;
        }
        .snt-theme-pill-icon.moon {
          color: rgba(255,255,255,0.9);
        }
        .snt-theme-pill-icon.sun {
          color: rgba(255,255,255,0.9);
        }
        .snt-theme-pill-icon.moon-active {
          color: rgba(255,255,255,0.4);
        }
        .snt-theme-pill-icon.sun-active {
          color: rgba(255,255,255,0.4);
        }

        /* Mobile responsive */
        @media (max-width: 768px) {
          .snt-theme-pill {
            height: 34px;
            padding: 3px;
            border-radius: 12px;
          }
          .snt-theme-track {
            width: 28px;
            height: 28px;
            border-radius: 9px;
            top: 3px;
            left: 3px;
          }
          [data-theme="light"] .snt-theme-track {
            transform: translateX(30px);
            width: 28px;
          }
          .snt-theme-pill-icon {
            width: 34px;
            height: 28px;
          }
        }
      `}</style>
      <button
        onClick={toggleTheme}
        className="snt-theme-pill"
        title={isLight ? "Switch to dark mode" : "Switch to light mode"}
        aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      >
        {/* Sliding track indicator */}
        <span className="snt-theme-track" />

        {/* Moon icon (dark mode) */}
        <span className={`snt-theme-pill-icon moon ${isLight ? "" : "moon-active"}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </span>

        {/* Sun icon (light mode) */}
        <span className={`snt-theme-pill-icon sun ${isLight ? "sun-active" : ""}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        </span>
      </button>
    </>
  );
}
