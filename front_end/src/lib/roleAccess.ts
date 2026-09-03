/**
 * Central Role-Based Access Control (RBAC) model for the Sentinel front-end.
 *
 * The live session role (from AuthProvider / login) is one of:
 *   super_admin | admin | viewer
 * The user-management page additionally defines finer-grained roles:
 *   admin | manager | operator | viewer
 *
 * This module is the single source of truth so the Sidebar (from the live
 * session role) and the User Management page (role editor) stay consistent.
 */

export type NavModuleId =
  | "dashboard"
  | "register"
  | "gallery"
  | "log"
  | "cameras"
  | "cameras-grid"
  | "faces"
  | "visitors"
  | "manage-sdk"
  | "analytics"
  | "users"
  | "roles"
  | "employees"
  | "departments";

/** Session role coming from the login / JWT (AuthProvider). */
export type SessionRole = "super_admin" | "admin" | "manager" | "operator" | "viewer";

/** Roles managed in the User Management page editor. */
export type ManagedRole = "admin" | "manager" | "operator" | "viewer";

/** Which top-level nav modules a session role may render in the Sidebar. */
const SESSION_ROLE_NAV: Record<SessionRole, NavModuleId[]> = {
  super_admin: [
    "dashboard", "register", "gallery", "log", "cameras", "cameras-grid",
    "faces", "visitors", "manage-sdk", "analytics", "users", "roles",
    "employees", "departments",
  ],
  admin: [
    "dashboard", "register", "gallery", "log", "cameras", "cameras-grid",
    "faces", "visitors", "manage-sdk", "analytics", "users", "roles",
    "employees", "departments",
  ],
  manager: [
    "dashboard", "register", "gallery", "log", "cameras", "cameras-grid",
    "faces", "visitors", "employees", "departments", "analytics",
  ],
  operator: [
    "dashboard", "register", "gallery", "log", "cameras", "cameras-grid",
    "faces", "visitors", "analytics",
  ],
  viewer: [
    "dashboard", "cameras", "cameras-grid", "faces", "visitors", "gallery", "log",
    "employees", "departments", "analytics",
  ],
};

const ALL_NAV_IDS: NavModuleId[] = [
  "dashboard", "register", "gallery", "log", "cameras", "cameras-grid",
  "faces", "visitors", "manage-sdk", "analytics", "users", "roles",
  "employees", "departments",
];

/** Normalise any session id into one of the known session roles. */
export function normalizeSessionRole(raw: string | undefined | null): SessionRole {
  const r = (raw || "").toLowerCase().trim();
  if (r === "super_admin" || r === "superadmin") return "super_admin";
  if (r === "admin") return "admin";
  if (r === "manager") return "manager";
  if (r === "operator") return "operator";
  return "viewer";
}

/** Nav module ids a given session role may access. */
export function getAllowedNavForRole(role: SessionRole): NavModuleId[] {
  return SESSION_ROLE_NAV[role] || SESSION_ROLE_NAV.viewer;
}

/** True if a given session role can see a specific nav module. */
export function canAccessNav(role: SessionRole, module: NavModuleId): boolean {
  return getAllowedNavForRole(role).includes(module);
}

/**
 * Effective nav modules for a session, honouring any per-user feature/module
 * override set in the User Management page. The override is an explicit list of
 * modules the user is allowed to see; when absent, the role default is used.
 */
export function effectiveNavForRole(
  role: SessionRole,
  override?: string[] | null
): NavModuleId[] {
  if (override && Array.isArray(override) && override.length > 0) {
    const valid = override.filter((m): m is NavModuleId =>
      (ALL_NAV_IDS as string[]).includes(m)
    );
    if (valid.length > 0) return valid;
  }
  return getAllowedNavForRole(role);
}

export const ALL_NAV_MODULES: NavModuleId[] = ALL_NAV_IDS;
