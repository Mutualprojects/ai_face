"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "../components/AuthProvider";
import styles from "./login.module.css";
import securityIll from "./cybersecurity-concept-illustration.png";

/* ─── STATIC LOGIN HELPERS ─────────────────────────────────────────────────── */
// Static authentication — credentials are checked directly in the browser,
// no Supabase Auth / database round-trip required. Update these to change the
// default login. The form is pre-filled with these same values.
const STATIC_USERS: Record<string, { password: string; role: string; full_name: string; department: string }> = {
  "superadmin@sentinel.local": {
    password: "Admin@1234",
    role: "super_admin",
    full_name: "Super Admin",
    department: "IT",
  },
};

function verifyStaticLogin(email: string, password: string) {
  const key = String(email || "").trim().toLowerCase();
  const u = STATIC_USERS[key];
  if (!u) throw new Error("Invalid email or password");
  if (u.password !== password) throw new Error("Invalid email or password");
  return {
    id: `SUPERADMIN-${Date.now()}`,
    email: String(email).trim(),
    full_name: u.full_name,
    department: u.department,
    role: u.role,
  };
}

export default function LoginPage() {
  const router = useRouter();
  const { login: authLogin } = useAuth();

  const [email, setEmail]       = useState("superadmin@sentinel.local");
  const [password, setPassword] = useState("Admin@1234");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [passErr, setPassErr]   = useState("");
  const [success, setSuccess]   = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [mounted, setMounted]   = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = sessionStorage.getItem("sentinel_session");
    if (stored) {
      try {
        const sess = JSON.parse(stored);
        if (sess?.access_token) router.replace("/dashboard");
      } catch {}
    }
  }, [router]);

  const validateEmail = (val: string) => {
    if (!val.trim()) return "Email address is required";
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(val.trim())) return "Please enter a valid email address";
    return "";
  };

  const validatePassword = (val: string) => {
    if (!val) return "Password is required";
    if (val.length < 6) return "Password must be at least 6 characters";
    return "";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    setCapsLock(e.getModifierState("CapsLock"));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const eErr = validateEmail(email);
    const pErr = validatePassword(password);

    setEmailErr(eErr);
    setPassErr(pErr);

    if (eErr || pErr) return;

    setLoading(true);

    try {
      const account = verifyStaticLogin(email, password);

      setSuccess(true);
      setTimeout(() => {
        authLogin({
          access_token: `sentinel-static-${Date.now()}`,
          user: { id: account.id, email: account.email },
          role: account.role as "super_admin" | "admin" | "viewer",
          full_name: account.full_name,
          email: account.email,
          department: account.department,
          logged_in_at: Date.now(),
        });
      }, 300);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed. Please try again.");
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className={styles.root}>
      {/* Background Pattern */}
      <div className={styles.bgPattern} />

      {/* Main Split Card Container */}
      <div className={styles.card}>

        {/* LEFT PANEL — Form */}
        <div className={styles.leftPanel}>

          {/* Brand Header */}
          <div className={styles.brandHeader}>
            <div className={styles.brandLogo}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 2L4 6v6c0 5.25 3.4 10.15 8 11.35C16.6 22.15 20 17.25 20 12V6L12 2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <div>
              <h2 className={styles.brandTitle}>Sentinel AI</h2>
              <span className={styles.brandSubtitle}>Facial Recognition System</span>
            </div>
          </div>

          {/* Heading */}
          <div className={styles.titleArea}>
            <h1 className={styles.heading}>Welcome back</h1>
          </div>

          {/* Global Error Banner */}
          {error && (
            <div className={styles.errorBanner} style={{ marginBottom: 16 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className={styles.form} noValidate>

            {/* Email Field */}
            <div className={styles.field}>
              <div className={styles.labelRow}>
                <label className={styles.label} htmlFor="email">Email Address</label>
              </div>
              <div className={styles.inputWrap}>
                <svg className={styles.inputIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    if (emailErr) setEmailErr(validateEmail(e.target.value));
                  }}
                  onKeyDown={handleKeyDown}
                  className={`${styles.input} ${emailErr ? styles.inputError : ""}`}
                  placeholder="superadmin@sentinel.local"
                  autoComplete="username"
                />
              </div>
              {emailErr && <span className={styles.fieldErrText}>{emailErr}</span>}
            </div>

            {/* Password Field */}
            <div className={styles.field}>
              <div className={styles.labelRow}>
                <label className={styles.label} htmlFor="password">Password</label>
                {capsLock && <span className={styles.capsBadge}>Caps Lock On</span>}
              </div>
              <div className={styles.inputWrap}>
                <svg className={styles.inputIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="password"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    if (passErr) setPassErr(validatePassword(e.target.value));
                  }}
                  onKeyDown={handleKeyDown}
                  className={`${styles.input} ${passErr ? styles.inputError : ""}`}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPass(v => !v)}
                  tabIndex={-1}
                  aria-label="Toggle password visibility"
                >
                  {showPass ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {passErr && <span className={styles.fieldErrText}>{passErr}</span>}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={loading || success}
            >
              {success ? (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Authenticated Successfully
                </>
              ) : loading ? (
                <>
                  <span className={styles.btnSpinner} />
                  Verifying Credentials…
                </>
              ) : (
                <>
                  Sign In to Dashboard
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                  </svg>
                </>
              )}
            </button>
          </form>

        </div>

        {/* RIGHT PANEL — Cybersecurity 3D Concept Illustration */}
        <div className={styles.rightPanel}>
          <div className={styles.illustrationWrap}>
            <Image
              src={securityIll}
              alt="Cybersecurity AI Face Recognition"
              className={styles.illustration}
              priority
            />
          </div>
        </div>

      </div>
    </div>
  );
}
