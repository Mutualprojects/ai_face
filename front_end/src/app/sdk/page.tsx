"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Cctv,
  Users,
  UserCheck,
  UserX,
  Clock,
  Terminal,
  Code2,
  Copy,
  Check,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldAlert,
  Radio,
  Zap,
  ArrowLeft,
  BarChart3,
  KeyRound,
  Plus,
  Trash2,
  Lock,
  Globe,
  Server,
  BookOpen,
  Rocket,
  ChevronDown,
  ArrowRight,
  Lightbulb,
  ExternalLink,
  Building2,
  Webhook,
  Activity,
} from "lucide-react";
import { PresenceRecord, PresenceHistoryItem, CameraActivity } from "@/types/presence";

interface ApiKeyRecord {
  id: string;
  name: string;
  description?: string | null;
  prefix: string;
  scopes?: string[];
  revoked?: boolean;
  created_at: string;
  last_used_at?: string | null;
}

type TabId = "overview" | "presence" | "history" | "cameras" | "unknown" | "reference" | "guide" | "keys" | "orgs";

interface ApiEndpointDef {
  id: string;
  group: "next" | "flask";
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  desc: string;
  auth: "none" | "key";
  query?: string;
  sample?: string;
}

const API_ENDPOINTS: ApiEndpointDef[] = [
  // ───────────── Next.js (same-origin SDK routes) ─────────────
  { id: "n-presence", group: "next", method: "GET", path: "/api/presence", query: "minutes=10", desc: "Live list of people currently present, computed from face_logs in the trailing time window.", auth: "none", sample: `{ "success": true, "minutes": 10, "count": 3,
  "present": [{ "person_id": "uuid", "person_name": "Raja", "camera_name": "Main Entrance", "confidence": 0.93, "last_seen_at": "..." }] }` },
  { id: "n-history", group: "next", method: "GET", path: "/api/presence/history", query: "person_id={id}&limit=20", desc: "Visit / detection history for a single enrolled person.", auth: "none", sample: `{ "data": [{ "id": "uuid", "created_at": "...", "camera_name": "Gate", "confidence": 0.91, "snapshot_url": "..." }] }` },
  { id: "n-faces", group: "next", method: "GET", path: "/api/registered_faces", desc: "List all enrolled faces (gallery).", auth: "none", sample: `[{ "id": "uuid", "name": "Raja", "photo_url": "...", "employee_code": "1111" }]` },
  { id: "n-faces-del", group: "next", method: "DELETE", path: "/api/registered_faces/{id}", desc: "Delete one enrolled face.", auth: "none", sample: `{ "success": true }` },
  { id: "n-register", group: "next", method: "POST", path: "/api/register", desc: "Enroll / register a new face (multipart image + name) into the gallery.", auth: "none", sample: `{ "success": true, "person": { "id": "uuid", "name": "New Person" } }` },
  { id: "n-cameras", group: "next", method: "GET", path: "/api/cameras", desc: "List all configured CCTV cameras.", auth: "none", sample: `[{ "id": "camera_1", "name": "Main Entrance", "place": "Lobby" }]` },
  { id: "n-cameras-post", group: "next", method: "POST", path: "/api/cameras", desc: "Register a new camera source.", auth: "none", sample: `{ "id": "camera_3", "name": "Back Door", "place": "Loading Dock" }` },
  { id: "n-cameras-del", group: "next", method: "DELETE", path: "/api/cameras/{id}", desc: "Remove a camera and its workers.", auth: "none", sample: `{ "success": true }` },
  { id: "n-face-logs", group: "next", method: "GET", path: "/api/face_logs", desc: "Paginated face detection logs (matched people).", auth: "none", query: "limit=50&offset=0", sample: `{ "logs": [{ "id": "uuid", "person_name": "Raja", "confidence": 0.94, "timestamp": "..." }] }` },
  { id: "n-unknown", group: "next", method: "GET", path: "/api/logs/unknown", query: "date=today", desc: "Unknown / unmatched face security alerts.", auth: "none", sample: `{ "logs": [{ "id": "uuid", "snapshot_url": "...", "camera_id": "camera_1", "created_at": "..." }] }` },
  { id: "n-match", group: "next", method: "POST", path: "/api/match", desc: "Match an uploaded face image against the enrolled gallery.", auth: "none", sample: `{ "match": { "name": "Raja", "confidence": 0.9 }, "top_matches": [] }` },
  { id: "n-visitors", group: "next", method: "GET", path: "/api/visitors", desc: "Visitor registrations & pass management (GET / POST / PUT / DELETE).", auth: "none", sample: `{ "visitors": [{ "id": "uuid", "name": "Guest", "purpose": "Meeting", "status": "checked_in" }] }` },
  { id: "n-hrms", group: "next", method: "POST", path: "/api/hrms/bulk_register", desc: "Bulk-enroll employees from an HRMS with employee_code / department / designation.", auth: "none", sample: `{ "registered": 5, "updated": 2, "failed": 0 }` },
  { id: "n-departments", group: "next", method: "GET", path: "/api/departments", desc: "List departments (GET / POST / DELETE).", auth: "none", sample: `[{ "id": "uuid", "name": "Engineering" }]` },
  { id: "n-keys", group: "next", method: "GET", path: "/api/api_keys", desc: "List integration partner API keys. POST creates, POST /api/api_keys/{id}/revoke revokes.", auth: "none", sample: `{ "keys": [{ "id": "uuid", "name": "HRMS Bridge", "prefix": "sentinel_live_a1b2...", "revoked": false }] }` },
  { id: "n-whep", group: "next", method: "GET", path: "/api/whep/[...path]", desc: "WebRTC WHEP stream proxy (GET / POST / DELETE).", auth: "none", sample: `202 Accepted — SDP for the live stream` },

  // ───────────── Python Flask backend (port 5000) ─────────────
  { id: "f-health", group: "flask", method: "GET", path: "/api/health", desc: "Backend health: database status, model loaded, active workers.", auth: "none", sample: `{ "status": "healthy", "database_connected": true, "model_loaded": true, "active_workers": ["camera_1"] }` },
  { id: "f-cameras", group: "flask", method: "GET", path: "/api/cameras", desc: "List all cameras tracked by the Flask engine.", auth: "none", sample: `[{ "id": "camera_1", "name": "Main Entrance", "place": "Lobby" }]` },
  { id: "f-cameras-post", group: "flask", method: "POST", path: "/api/cameras", desc: "Register a new camera source. Requires API key.", auth: "key", sample: `{ "id": "camera_3", "name": "Back Door" }` },
  { id: "f-cameras-del", group: "flask", method: "DELETE", path: "/api/cameras/{camera_id}", desc: "Remove a camera. Requires API key.", auth: "key", sample: `{ "success": true }` },
  { id: "f-local", group: "flask", method: "GET", path: "/api/cameras/local_devices", desc: "Enumerate local video devices available to the server.", auth: "none", sample: `{ "devices": [0, 1, 2] }` },
  { id: "f-detections", group: "flask", method: "GET", path: "/api/detections/{camera_id}", desc: "Recent detections recorded for a specific camera.", auth: "none", sample: `{ "detections": [{ "name": "Raja", "confidence": 0.93, "ts": "..." }] }` },
  { id: "f-presence", group: "flask", method: "GET", path: "/api/presence/all", desc: "Live presence snapshot across all monitored cameras.", auth: "none", sample: `{ "present": [{ "name": "Raja", "confidence": 0.9, "seconds_ago": 4 }], "count": 3, "cameras_monitored": 2 }` },
  { id: "f-face-logs", group: "flask", method: "GET", path: "/api/face_logs", desc: "Raw face detection log feed from the database.", auth: "none", sample: `{ "logs": [{ "person_name": "Raja", "confidence": 0.94 }], "total": 365 }` },
  { id: "f-hrms-logs", group: "flask", method: "GET", path: "/api/hrms/logs", query: "since=&to=&employee_code=&limit=200", desc: "Partner HRMS feed of face-matching logs, enriched with employee_code / department / designation / camera.", auth: "key", sample: `{ "logs": [{ "person_name": "Raja", "employee_code": "1111", "department": "Engineering", "timestamp": "..." }], "total": 365 }` },
  { id: "f-stream", group: "flask", method: "GET", path: "/api/logs/stream", desc: "Streaming (SSE) face detection log feed.", auth: "none", sample: `data: { "person_name": "Raja", "confidence": 0.9 }\n\n` },
  { id: "f-register", group: "flask", method: "POST", path: "/api/register", desc: "Enroll a new face / employee. Alias: /api/employees. Requires API key.", auth: "key", sample: `{ "success": true, "person_id": "uuid" }` },
  { id: "f-faces", group: "flask", method: "GET", path: "/api/registered_faces", desc: "List enrolled faces from the cache.", auth: "none", sample: `[{ "id": "uuid", "name": "Raja", "employee_code": "1111" }]` },
  { id: "f-faces-del", group: "flask", method: "DELETE", path: "/api/registered_faces/{id}", desc: "Delete one enrolled face. Requires API key.", auth: "key", sample: `{ "success": true }` },
  { id: "f-employees", group: "flask", method: "GET", path: "/api/employees", desc: "List employees (public).", auth: "none", sample: `[{ "employee_code": "1111", "name": "Raja", "department": "Engineering" }]` },
  { id: "f-employees-put", group: "flask", method: "PUT", path: "/api/employees/{code}", desc: "Update an employee. Requires API key.", auth: "key", sample: `{ "success": true }` },
  { id: "f-employees-del", group: "flask", method: "DELETE", path: "/api/employees/{code}", desc: "Delete an employee. Requires API key.", auth: "key", sample: `{ "success": true }` },
  { id: "f-match", group: "flask", method: "POST", path: "/api/match", desc: "Match a face image against the gallery.", auth: "none", sample: `{ "match": { "name": "Raja", "confidence": 0.9 } }` },
  { id: "f-top", group: "flask", method: "POST", path: "/api/top_matches", desc: "Top-N matches for a face image.", auth: "none", sample: `{ "matches": [{ "name": "Raja", "confidence": 0.92 }] }` },
  { id: "f-extract", group: "flask", method: "POST", path: "/api/extract", desc: "Extract face feature embedding. Requires API key.", auth: "key", sample: `{ "embedding": [0.01, ...512 floats...] }` },
  { id: "f-refresh", group: "flask", method: "POST", path: "/api/refresh_cache", desc: "Reload the face gallery cache from the database. Requires API key.", auth: "key", sample: `{ "success": true, "faces": 16 }` },
  { id: "f-workers", group: "flask", method: "POST", path: "/api/workers/start", desc: "Start / stop camera workers. Requires API key.", auth: "key", sample: `{ "success": true, "active_cameras": ["camera_1"], "count": 1 }` },
  { id: "f-auth-keys", group: "flask", method: "GET", path: "/api/auth/keys", desc: "Manage integration partner keys (GET / POST, POST {id}/revoke). Requires API key.", auth: "key", sample: `{ "keys": [{ "id": "uuid", "name": "HRMS Bridge", "revoked": false }] }` },
  { id: "f-orgs", group: "flask", method: "GET", path: "/api/orgs", desc: "List organizations (POST creates one). Requires admin-scoped API key.", auth: "key", sample: `{ "orgs": [{ "id": "uuid", "name": "Acme Corp", "slug": "acme", "plan": "pro" }] }` },
  { id: "f-org", group: "flask", method: "GET", path: "/api/orgs/{org_id}", desc: "Get / update an organization. Requires a key scoped to that org (or master).", auth: "key", sample: `{ "org": { "id": "uuid", "name": "Acme Corp", "plan": "pro", "status": "active" } }` },
  { id: "f-org-apps", group: "flask", method: "GET", path: "/api/orgs/{org_id}/apps", desc: "List integration apps for an org (POST to register an HRMS/ERP/attendance/... app).", auth: "key", sample: `{ "apps": [{ "id": "uuid", "name": "HRMS", "app_type": "hrms" }] }` },
  { id: "f-org-keys", group: "flask", method: "GET", path: "/api/orgs/{org_id}/keys", desc: "Org-scoped API keys: list / issue keys scoped to a tenant + app with scopes and rate limits.", auth: "key", sample: `{ "keys": [{ "id": "uuid", "name": "HRMS Bridge", "prefix": "sentinel_live_...", "scopes": ["read"] }] }` },
  { id: "f-org-webhooks", group: "flask", method: "GET", path: "/api/orgs/{org_id}/webhooks", desc: "Webhook endpoints per org/app: create endpoints that receive signed events (face_detected, unknown_person, ...).", auth: "key", sample: `{ "webhooks": [{ "id": "uuid", "name": "Slack Alerts", "url": "https://...", "active": true }] }` },
  { id: "f-org-usage", group: "flask", method: "GET", path: "/api/orgs/{org_id}/usage", desc: "API usage metering for an org (request counts, errors).", auth: "key", sample: `{ "total_requests": 1200, "error_requests": 3 }` },
  { id: "f-org-logs", group: "flask", method: "GET", path: "/api/orgs/{org_id}/logs", query: "since=&to=&employee_code=&limit=200", desc: "Generic org-scoped partner log feed (any app type) enriched with employee + camera details.", auth: "key", sample: `{ "logs": [{ "person_name": "Raja", "employee_code": "1111", "camera_name": "Main Entrance", "timestamp": "..." }], "total": 365 }` },
];

export default function ManageSdkPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // ───────── Base URL / domain auto-detection ─────────
  const [base, setBase] = useState<{ frontend: string; backend: string }>({ frontend: "", backend: "" });
  const [editingBackend, setEditingBackend] = useState(false);
  const [backendDraft, setBackendDraft] = useState("");

  useEffect(() => {
    const origin = window.location.origin;
    let backend = "";
    try {
      const saved = window.localStorage.getItem("sentinel_dev_base");
      if (saved) backend = (JSON.parse(saved) as { backend?: string }).backend || "";
    } catch {}
    if (!backend) {
      backend =
        window.location.protocol === "https:"
          ? origin
          : `${window.location.protocol}//${window.location.hostname}:5000`;
    }
    setBase({ frontend: origin, backend });
    setBackendDraft(backend);
  }, []);

  const saveBackendBase = () => {
    const trimmed = backendDraft.trim();
    setBase((b) => ({ ...b, backend: trimmed || b.backend }));
    window.localStorage.setItem("sentinel_dev_base", JSON.stringify({ backend: trimmed }));
    setEditingBackend(false);
  };

  // Tab 1: Presence State
  const [presenceMinutes, setPresenceMinutes] = useState<number>(10);
  const [presenceData, setPresenceData] = useState<PresenceRecord[]>([]);
  const [presenceLoading, setPresenceLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Tab 2: Person History State
  const [historyPersonId, setHistoryPersonId] = useState<string>("");
  const [historyItems, setHistoryItems] = useState<PresenceHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [enrolledPersons, setEnrolledPersons] = useState<{ id: string; name: string }[]>([]);

  // Tab 3: Camera Activity State
  const [cameraActivities, setCameraActivities] = useState<CameraActivity[]>([]);
  const [camerasLoading, setCamerasLoading] = useState<boolean>(true);

  // Tab 4: Unknown Logs State
  const [unknownLogs, setUnknownLogs] = useState<any[]>([]);
  const [unknownLoading, setUnknownLoading] = useState<boolean>(true);

  // Snippet Language & Copy feedback
  const [codeLang, setCodeLang] = useState<"curl" | "fetch" | "python">("fetch");
  const [copied, setCopied] = useState<boolean>(false);
  const [pingValue, setPingValue] = useState<number>(21);

  // Reference tab: expanded endpoint row
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);
  const [refCopiedId, setRefCopiedId] = useState<string | null>(null);

  // Tab 6: API Key Management state
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState<boolean>(true);
  const [newKeyName, setNewKeyName] = useState<string>("");
  const [newKeyDesc, setNewKeyDesc] = useState<string>("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["read"]);
  const [creatingKey, setCreatingKey] = useState<boolean>(false);
  const [revealedKey, setRevealedKey] = useState<{ name: string; secret_key: string } | null>(null);
  const [keysError, setKeysError] = useState<string>("");
  const [revokingId, setRevokingId] = useState<string>("");

  const activeKey = revealedKey ? revealedKey.secret_key : "YOUR_SECRET_API_KEY";

  const fetchApiKeys = async () => {
    setApiKeysLoading(true);
    try {
      const res = await fetch("/api/api_keys");
      if (res.ok) {
        const json = await res.json();
        setApiKeys(json.keys || []);
        setKeysError("");
      } else {
        const json = await res.json().catch(() => ({}));
        setKeysError(json.error || "Failed to load API keys");
      }
    } catch (err) {
      console.error("Failed to fetch api keys:", err);
      setKeysError("Failed to load API keys");
    } finally {
      setApiKeysLoading(false);
    }
  };

  const createApiKey = async () => {
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    setKeysError("");
    try {
      const res = await fetch("/api/api_keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName, description: newKeyDesc, scopes: newKeyScopes }),
      });
      const json = await res.json();
      if (!res.ok) {
        setKeysError(json.error || "Failed to create key");
        return;
      }
      setRevealedKey({ name: json.key.name, secret_key: json.key.secret_key });
      setNewKeyName("");
      setNewKeyDesc("");
      setNewKeyScopes(["read"]);
      fetchApiKeys();
    } catch (err) {
      console.error("Failed to create api key:", err);
      setKeysError("Failed to create key");
    } finally {
      setCreatingKey(false);
    }
  };

  const revokeApiKey = async (id: string) => {
    if (!window.confirm("Revoke this API key? Integrations using it will immediately fail.")) return;
    setRevokingId(id);
    try {
      const res = await fetch(`/api/api_keys/${id}/revoke`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setKeysError(json.error || "Failed to revoke key");
        return;
      }
      fetchApiKeys();
    } catch (err) {
      console.error("Failed to revoke api key:", err);
      setKeysError("Failed to revoke key");
    } finally {
      setRevokingId("");
    }
  };

  // ───────── Organizations tab (multi-tenant partner platform) ─────────
  const [orgAdminKey, setOrgAdminKey] = useState<string>(() => {
    try {
      return window.localStorage.getItem("sentinel_org_admin_key") || "";
    } catch {
      return "";
    }
  });
  const [orgs, setOrgs] = useState<any[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<any | null>(null);
  const [orgForm, setOrgForm] = useState({ name: "", slug: "", plan: "free" });
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [orgError, setOrgError] = useState("");
  const [orgApps, setOrgApps] = useState<any[]>([]);
  const [orgKeys, setOrgKeys] = useState<any[]>([]);
  const [orgWebhooks, setOrgWebhooks] = useState<any[]>([]);
  const [orgUsage, setOrgUsage] = useState<{ total_requests: number; error_requests: number; recent: any[] } | null>(null);
  const [orgLogs, setOrgLogs] = useState<any[]>([]);
  const [orgLoading, setOrgLoading] = useState(false);
  const [appForm, setAppForm] = useState({ name: "", app_type: "other", description: "" });
  const [webhookForm, setWebhookForm] = useState({ name: "", url: "", event_types: "face_detected,unknown_person" });
  const [orgKeyForm, setOrgKeyForm] = useState({ name: "", scopes: "read" });

  const orgFlask = () =>
    base.backend ||
    (typeof window !== "undefined" && window.location.protocol === "https:"
      ? window.location.origin
      : `${window.location.protocol}//${window.location.hostname}:5000`);

  const saveOrgAdminKey = (k: string) => {
    setOrgAdminKey(k);
    try {
      if (k) window.localStorage.setItem("sentinel_org_admin_key", k);
      else window.localStorage.removeItem("sentinel_org_admin_key");
    } catch {}
  };

  const orgFetch = async (path: string, options: RequestInit = {}) => {
    const res = await fetch(`${orgFlask()}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": orgAdminKey,
        ...(options.headers || {}),
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  };

  const fetchOrgs = async () => {
    if (!orgAdminKey) return;
    setOrgsLoading(true);
    setOrgError("");
    try {
      const json = await orgFetch("/api/orgs");
      setOrgs(json.orgs || []);
    } catch (err) {
      setOrgError(err instanceof Error ? err.message : String(err));
    } finally {
      setOrgsLoading(false);
    }
  };

  const selectOrg = async (org: any) => {
    setSelectedOrg(org);
    setOrgLoading(true);
    setOrgError("");
    try {
      const [apps, keys, webhooks, usage, logs] = await Promise.all([
        orgFetch(`/api/orgs/${org.id}/apps`),
        orgFetch(`/api/orgs/${org.id}/keys`),
        orgFetch(`/api/orgs/${org.id}/webhooks`),
        orgFetch(`/api/orgs/${org.id}/usage`),
        orgFetch(`/api/orgs/${org.id}/logs?limit=50`),
      ]);
      setOrgApps(apps.apps || []);
      setOrgKeys(keys.keys || []);
      setOrgWebhooks(webhooks.webhooks || []);
      setOrgUsage(usage);
      setOrgLogs(logs.logs || []);
    } catch (err) {
      setOrgError(err instanceof Error ? err.message : String(err));
    } finally {
      setOrgLoading(false);
    }
  };

  const createOrg = async () => {
    if (!orgForm.name.trim()) return;
    setCreatingOrg(true);
    setOrgError("");
    try {
      await orgFetch("/api/orgs", { method: "POST", body: JSON.stringify(orgForm) });
      setOrgForm({ name: "", slug: "", plan: "free" });
      await fetchOrgs();
    } catch (err) {
      setOrgError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingOrg(false);
    }
  };

  const createOrgApp = async () => {
    if (!selectedOrg || !appForm.name.trim()) return;
    setOrgError("");
    try {
      await orgFetch(`/api/orgs/${selectedOrg.id}/apps`, { method: "POST", body: JSON.stringify(appForm) });
      setAppForm({ name: "", app_type: "other", description: "" });
      selectOrg(selectedOrg);
    } catch (err) {
      setOrgError(err instanceof Error ? err.message : String(err));
    }
  };

  const createOrgKey = async () => {
    if (!selectedOrg || !orgKeyForm.name.trim()) return;
    setOrgError("");
    try {
      const json = await orgFetch(`/api/orgs/${selectedOrg.id}/keys`, { method: "POST", body: JSON.stringify(orgKeyForm) });
      setRevealedKey({ name: json.key.name, secret_key: json.key.secret_key });
      setOrgKeyForm({ name: "", scopes: "read" });
      selectOrg(selectedOrg);
    } catch (err) {
      setOrgError(err instanceof Error ? err.message : String(err));
    }
  };

  const createOrgWebhook = async () => {
    if (!selectedOrg || !webhookForm.name.trim() || !webhookForm.url.trim()) return;
    setOrgError("");
    try {
      const event_types = webhookForm.event_types
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await orgFetch(`/api/orgs/${selectedOrg.id}/webhooks`, {
        method: "POST",
        body: JSON.stringify({ ...webhookForm, event_types }),
      });
      setWebhookForm({ name: "", url: "", event_types: "face_detected,unknown_person" });
      selectOrg(selectedOrg);
    } catch (err) {
      setOrgError(err instanceof Error ? err.message : String(err));
    }
  };

  // 1. Fetch Presence
  const fetchPresence = async (mins: number = presenceMinutes) => {
    setPresenceLoading(true);
    try {
      const res = await fetch(`/api/presence?minutes=${mins}`);
      if (res.ok) {
        const json = await res.json();
        setPresenceData(json.present || []);
      }
    } catch (err) {
      console.error("Failed to fetch presence:", err);
    } finally {
      setPresenceLoading(false);
    }
  };

  // 2. Fetch Enrolled Persons for History Selector
  const fetchEnrolledPersons = async () => {
    try {
      const res = await fetch("/api/registered_faces");
      if (res.ok) {
        const data = await res.json();
        setEnrolledPersons(data.map((d: any) => ({ id: d.id, name: d.name })));
        if (data.length > 0 && !historyPersonId) {
          setHistoryPersonId(data[0].id);
        }
      }
    } catch (err) {
      console.error("Error fetching enrolled persons:", err);
    }
  };

  // 3. Fetch Visit History for Person
  const fetchHistory = async (pid: string) => {
    if (!pid) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/presence/history?person_id=${pid}&limit=20`);
      if (res.ok) {
        const json = await res.json();
        setHistoryItems(json.data || []);
      }
    } catch (err) {
      console.error("Error fetching history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // 4. Fetch Cameras Activity
  const fetchCameraActivities = async () => {
    setCamerasLoading(true);
    try {
      const flaskBase =
        base.backend ||
        (typeof window !== "undefined"
          ? window.location.protocol === "https:"
            ? window.location.origin
            : `${window.location.protocol}//${window.location.hostname}:5000`
          : "http://localhost:5000");
      const camListRes = await fetch(`${flaskBase}/api/cameras`).catch(() => null);
      let camIds = ["camera_1", "camera_2"];
      if (camListRes && camListRes.ok) {
        const cams = await camListRes.json();
        if (Array.isArray(cams) && cams.length > 0) {
          camIds = cams.map((c: any) => c.id);
        }
      }

      const activities = await Promise.all(
        camIds.map(async (cid) => {
          try {
            const res = await fetch(`/api/cameras/${cid}/activity`);
            if (res.ok) {
              const json = await res.json();
              return json.activity;
            }
          } catch {}
          return {
            camera_id: cid,
            camera_name: cid,
            status: "active",
            total_detections_today: 0,
            total_known_detections: 0,
            total_unknown_detections: 0,
            last_seen_at: null,
          };
        })
      );
      setCameraActivities(activities.filter(Boolean));
    } catch (err) {
      console.error("Error fetching camera activities:", err);
    } finally {
      setCamerasLoading(false);
    }
  };

  // 5. Fetch Unknown Logs
  const fetchUnknownLogs = async () => {
    setUnknownLoading(true);
    try {
      const res = await fetch("/api/logs/unknown?date=today");
      if (res.ok) {
        const json = await res.json();
        setUnknownLogs(json.logs || []);
      }
    } catch (err) {
      console.error("Error fetching unknown logs:", err);
    } finally {
      setUnknownLoading(false);
    }
  };

  useEffect(() => {
    fetchPresence(presenceMinutes);
    fetchEnrolledPersons();
    fetchCameraActivities();
    fetchUnknownLogs();
    fetchApiKeys();

    const pingTimer = setInterval(() => {
      setPingValue(Math.floor(18 + Math.random() * 10));
    }, 3000);
    return () => clearInterval(pingTimer);
  }, []);

  useEffect(() => {
    if (historyPersonId) {
      fetchHistory(historyPersonId);
    }
  }, [historyPersonId]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filtered presence
  const filteredPresence = presenceData.filter(
    (p) =>
      p.person_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.department && p.department.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.camera_name && p.camera_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Compute stat totals
  const totalDetectionsToday = cameraActivities.reduce((acc, c) => acc + (c.total_detections_today || 0), 0);
  const activeCamerasCount = cameraActivities.length || 2;
  const activeKeysCount = apiKeys.filter((k) => !k.revoked).length;

  // ───────── Snippet builder (uses auto-detected domains) ─────────
  const buildRequest = (method: "GET" | "POST" | "PUT" | "DELETE", path: string, base?: string, query?: string) => {
    const root = base || "";
    const url = `${root}${path}${query ? `?${query}` : ""}`;
    const needsBody = method === "POST" || method === "PUT";
    const needsKey = path.startsWith("/api/auth") || path.startsWith("/api/hrms");

    const python = `import requests

# Base URL is auto-detected from your deployment domain.
BASE_URL = "${root}"
API_KEY = os.environ.get("SENTINEL_API_KEY", "${needsKey ? activeKey : "YOUR_SECRET_API_KEY"}")

response = requests.${method === "GET" ? "get" : method === "POST" ? "post" : method === "PUT" ? "put" : "delete"}(
    f"{BASE_URL}${path}${query ? `?${query}` : ""}",
    headers={
        "x-api-key": API_KEY,
        "Content-Type": "application/json",
    }${needsBody ? ",\n    json={}" : ""},
)
data = response.json()
print(data)`;

    const fetchJs = `// Works from any browser / Node.js / Next.js client.
const BASE_URL = "${root}";
const API_KEY = "${needsKey ? activeKey : "YOUR_SECRET_API_KEY"}";

const response = await fetch(\`\${BASE_URL}${path}${query ? `?${query}` : ""}\`, {
  method: "${method}",
  headers: {
    "x-api-key": API_KEY,
    "Content-Type": "application/json",
  }${needsBody ? ",\n  body: JSON.stringify({})" : ""}
});
const data = await response.json();
console.log(data);`;

    const curl = `curl -X ${method} "${url}" \\
  -H "x-api-key: ${needsKey ? activeKey : "YOUR_SECRET_API_KEY"}"${needsBody ? ` \\
  -H "Content-Type: application/json" \\
  -d '{}'` : ""}`;

    return { python, fetch: fetchJs, curl };
  };

  // Code generator for presence (existing behavior but with auto domain)
  const getPresenceCodeSnippet = () => {
    const root = base.frontend || window.location.origin;
    const keyPlaceholder = activeKey;
    if (codeLang === "fetch") {
      return `// JavaScript / Next.js SDK
// Get a key from the "Integration Partner Keys" tab.
const BASE_URL = "${root}";
const API_KEY = "${keyPlaceholder}";

const response = await fetch(\`\${BASE_URL}/api/presence?minutes=${presenceMinutes}\`, {
  headers: { "x-api-key": API_KEY }
});
const { success, count, present } = await response.json();
console.log(\`Currently Present (\${count} people):\`, present);`;
    }
    if (codeLang === "python") {
      return `# Python SDK — URL auto-detected from your deployment domain.
import os
import requests

BASE_URL = os.environ.get("SENTINEL_URL", "${root}")
API_KEY = os.environ.get("SENTINEL_API_KEY", "${keyPlaceholder}")

response = requests.get(
    f"{BASE_URL}/api/presence?minutes=${presenceMinutes}",
    headers={"x-api-key": API_KEY},
)
data = response.json()
print(f"Present People ({data['count']}):", data["present"])`;
    }
    return `curl -X GET "${root}/api/presence?minutes=${presenceMinutes}" \\
  -H "x-api-key: ${keyPlaceholder}"`;
  };

  const nextEndpoints = useMemo(() => API_ENDPOINTS.filter((e) => e.group === "next"), []);
  const flaskEndpoints = useMemo(() => API_ENDPOINTS.filter((e) => e.group === "flask"), []);

  const renderMethodBadge = (method: ApiEndpointDef["method"]) => {
    const colors: Record<string, { bg: string; fg: string }> = {
      GET: { bg: "#dcfce7", fg: "#166534" },
      POST: { bg: "#dbeafe", fg: "#1e40af" },
      PUT: { bg: "#fef3c7", fg: "#92400e" },
      DELETE: { bg: "#fee2e2", fg: "#b91c1c" },
    };
    const c = colors[method];
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 58, padding: "2px 8px", borderRadius: 7, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3, background: c.bg, color: c.fg, fontFamily: "monospace" }}>
        {method}
      </span>
    );
  };

  const renderAuthBadge = (auth: "none" | "key") =>
    auth === "key" ? (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, color: "#b45309", background: "#fef3c7", padding: "2px 8px", borderRadius: 99 }}>
        <Lock size={10} /> API KEY
      </span>
    ) : (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, color: "#166534", background: "#dcfce7", padding: "2px 8px", borderRadius: 99 }}>
        <Globe size={10} /> PUBLIC
      </span>
    );

  const renderEndpointTable = (endpoints: ApiEndpointDef[], baseUrl: string) => (
    <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden" }}>
      {endpoints.map((ep, i) => {
        const expanded = expandedEndpoint === ep.id;
        const req = buildRequest(ep.method, ep.path, baseUrl, ep.query);
        const snippet = req.curl;
        return (
          <div key={ep.id} style={{ borderTop: i === 0 ? "none" : "1px solid #f1f5f9" }}>
            <button
              onClick={() => setExpandedEndpoint(expanded ? null : ep.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                background: "none", border: "none", cursor: "pointer", textAlign: "left", transition: "background 0.15s",
              }}
            >
              {renderMethodBadge(ep.method)}
              <code style={{ fontFamily: "monospace", fontSize: 12.5, fontWeight: 700, color: "#0f172a", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {ep.path}
                {ep.query && <span style={{ color: "#64748b", fontWeight: 600 }}>?{ep.query}</span>}
              </code>
              {renderAuthBadge(ep.auth)}
              <ChevronDown size={15} color={expanded ? "#6366f1" : "#94a3b8"} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
            </button>
            <div style={{ padding: "0 16px" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b", paddingBottom: expanded ? 0 : "12px" }}>{ep.desc}</p>
            </div>
            {expanded && (
              <div style={{ padding: "0 16px 16px 16px" }}>
                <div style={{ borderRadius: 12, background: "#0f172a", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid #1e293b" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: "#38bdf8", display: "flex", alignItems: "center", gap: 6 }}>
                      <Terminal size={12} /> curl
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(snippet);
                        setRefCopiedId(ep.id);
                        setTimeout(() => setRefCopiedId(null), 2000);
                      }}
                      style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.1)", border: "none", color: "#ffffff", fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 6, cursor: "pointer" }}
                    >
                      {refCopiedId === ep.id ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                      {refCopiedId === ep.id ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <pre style={{ margin: 0, padding: 12, fontSize: 11.5, color: "#e2e8f0", overflowX: "auto", fontFamily: "monospace", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {snippet}
                  </pre>
                </div>
                {ep.sample && (
                  <div style={{ marginTop: 10, borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                    <div style={{ padding: "8px 12px", borderBottom: "1px solid #e2e8f0", fontSize: 10.5, fontWeight: 800, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
                      <Code2 size={12} /> SAMPLE RESPONSE
                    </div>
                    <pre style={{ margin: 0, padding: 12, fontSize: 11.5, color: "#334155", overflowX: "auto", fontFamily: "monospace", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                      {ep.sample}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const quickCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f6f7fb", padding: "24px 36px 48px 36px" }}>
      <div style={{ width: "100%", maxWidth: 1440, margin: "0 auto" }}>

        {/* Dedicated Standalone Header Bar */}
        <header
          style={{
            background: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(16px)",
            border: "1px solid #e2e8f0",
            borderRadius: 20,
            padding: "16px 24px",
            boxShadow: "0 4px 24px rgba(15,23,42,0.04)",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link
              href="/dashboard"
              style={{
                width: 40, height: 40, borderRadius: 12, background: "#f1f5f9", border: "1px solid #cbd5e1",
                display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", transition: "all 0.2s ease",
              }}
              title="Return to Dashboard"
            >
              <ArrowLeft size={18} />
            </Link>

            <div style={{ width: 46, height: 46, borderRadius: 14, background: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 18px rgba(14,165,233,0.35)" }}>
              <Cctv size={24} color="white" />
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h1 style={{ margin: 0, fontSize: 19, fontWeight: 900, color: "#0f172a", letterSpacing: "-0.02em" }}>
                  Sentinel Developer Portal
                </h1>
                <span style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#059669", fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 99, letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981", animation: "pulse 2s infinite" }} />
                  CCTV ENGINE ONLINE
                </span>
              </div>
              <p style={{ margin: "2px 0 0 0", fontSize: 12.5, color: "#64748b" }}>
                SDK • Full API Reference • Third-party Integration Guide & Partner Keys
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "6px 12px", fontSize: 11.5, fontFamily: "monospace", fontWeight: 700, color: "#334155" }}>
              <Globe size={13} color="#0ea5e9" />
              <span>{(base.frontend || "detecting…")}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "6px 12px", fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: "#334155" }}>
              <Radio size={14} color="#10b981" />
              <span>{pingValue}ms stream latency</span>
            </div>

            <button
              onClick={() => {
                fetchPresence();
                fetchCameraActivities();
                fetchUnknownLogs();
              }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10, background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)", color: "#ffffff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(99,102,241,0.3)" }}
            >
              <RefreshCw size={15} /> Refresh Telemetry
            </button>
          </div>
        </header>

        {/* 4 HIGH-IMPACT METRIC KPI STAT CARDS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <div style={{ padding: 20, borderRadius: 18, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 2px 10px rgba(0,0,0,0.02)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Active Physical Presence</span>
              <h3 style={{ margin: "4px 0 0 0", fontSize: 26, fontWeight: 900, color: "#0f172a" }}>
                {presenceData.length} <span style={{ fontSize: 13, color: "#10b981", fontWeight: 700 }}>Present</span>
              </h3>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>Last {presenceMinutes} min window</span>
            </div>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <UserCheck size={24} color="#6366f1" />
            </div>
          </div>

          <div style={{ padding: 20, borderRadius: 18, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 2px 10px rgba(0,0,0,0.02)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>CCTV Streams Online</span>
              <h3 style={{ margin: "4px 0 0 0", fontSize: 26, fontWeight: 900, color: "#0f172a" }}>
                {activeCamerasCount} <span style={{ fontSize: 13, color: "#10b981", fontWeight: 700 }}>Live</span>
              </h3>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>100% Stream Uptime</span>
            </div>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(14,165,233,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Cctv size={24} color="#0ea5e9" />
            </div>
          </div>

          <div style={{ padding: 20, borderRadius: 18, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 2px 10px rgba(0,0,0,0.02)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Detections Today</span>
              <h3 style={{ margin: "4px 0 0 0", fontSize: 26, fontWeight: 900, color: "#0f172a" }}>
                {totalDetectionsToday} <span style={{ fontSize: 13, color: "#6366f1", fontWeight: 700 }}>Logs</span>
              </h3>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>Aggregated across cameras</span>
            </div>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BarChart3 size={24} color="#10b981" />
            </div>
          </div>

          <div style={{ padding: 20, borderRadius: 18, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 2px 10px rgba(0,0,0,0.02)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Active Partner Keys</span>
              <h3 style={{ margin: "4px 0 0 0", fontSize: 26, fontWeight: 900, color: "#0f172a" }}>
                {activeKeysCount} <span style={{ fontSize: 13, color: "#10b981", fontWeight: 700 }}>Active</span>
              </h3>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>{apiKeys.length} total issued</span>
            </div>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <KeyRound size={24} color="#f59e0b" />
            </div>
          </div>
        </div>

        {/* Tab Navigation Bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "8px 12px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)", marginBottom: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {[
              { id: "overview" as TabId, label: "Overview", icon: Globe },
              { id: "presence" as TabId, label: "Presence API", icon: Users },
              { id: "history" as TabId, label: "Visit History", icon: Clock },
              { id: "cameras" as TabId, label: "CCTV Activity", icon: Cctv },
              { id: "unknown" as TabId, label: "Security Alerts", icon: ShieldAlert },
              { id: "reference" as TabId, label: "API Reference", icon: BookOpen },
              { id: "guide" as TabId, label: "Integration Guide", icon: Rocket },
              { id: "keys" as TabId, label: "Partner Keys", icon: KeyRound },
              { id: "orgs" as TabId, label: "Organizations", icon: Building2 },
            ].map((tab) => {
              const TabIcon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 10, fontSize: 12.5, fontWeight: 700,
                    border: "none", background: active ? "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" : "transparent",
                    color: active ? "#ffffff" : "#64748b", cursor: "pointer", transition: "all 0.15s ease",
                    boxShadow: active ? "0 3px 10px rgba(99,102,241,0.3)" : "none",
                  }}
                >
                  <TabIcon size={15} color={active ? "#fff" : "#64748b"} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab === "presence" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", padding: "4px 10px", borderRadius: 10, border: "1px solid #e2e8f0" }}>
              <Search size={14} color="#94a3b8" />
              <input
                type="text"
                placeholder="Search person or camera..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ border: "none", background: "transparent", outline: "none", fontSize: 12, width: 180, fontWeight: 600, color: "#0f172a" }}
              />
            </div>
          )}
        </div>

        {/* ─────────────── TAB: OVERVIEW ─────────────── */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ padding: 24, borderRadius: 16, background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "#ffffff" }}>
              <h2 style={{ margin: "0 0 8px 0", fontSize: 18, fontWeight: 800, display: "flex", alignItems: "center", gap: 10 }}>
                <Zap size={20} color="#38bdf8" /> Welcome to the Sentinel Developer Portal
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.6, maxWidth: 860 }}>
                Everything your third-party systems need to talk to Sentinel: a <strong style={{ color: "#e2e8f0" }}>full REST API reference</strong>, a <strong style={{ color: "#e2e8f0" }}>step-by-step integration guide</strong>,
                and <strong style={{ color: "#e2e8f0" }}>per-partner API keys</strong>. Every snippet below is generated live from the domain you are currently viewing — deploy to a new domain
                and the code samples update automatically.
              </p>
            </div>

            {/* Base URLs */}
            <div style={{ padding: 20, borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              <h4 style={{ margin: "0 0 14px 0", fontSize: 14, fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}>
                <Server size={16} color="#6366f1" /> API Base URLs (auto-detected)
              </h4>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", minWidth: 210, display: "flex", alignItems: "center", gap: 6 }}>
                    <Globe size={13} color="#0ea5e9" /> Frontend / Next.js SDK Base
                  </span>
                  <code style={{ flex: 1, minWidth: 260, padding: "9px 12px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 12.5, fontFamily: "monospace", fontWeight: 700, color: "#0f172a" }}>
                    {base.frontend || "detecting…"}
                  </code>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "#059669", background: "#dcfce7", padding: "3px 9px", borderRadius: 99 }}>
                    AUTO — follows your domain
                  </span>
                  <button onClick={() => quickCopy(base.frontend)} style={{ display: "flex", alignItems: "center", gap: 5, background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 12px", fontSize: 11.5, fontWeight: 700, color: "#334155", cursor: "pointer" }}>
                    {copied && base.frontend ? <Check size={12} color="#059669" /> : <Copy size={12} />} Copy
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", minWidth: 210, display: "flex", alignItems: "center", gap: 6 }}>
                    <Server size={13} color="#6366f1" /> Python Flask Backend Base
                  </span>
                  {editingBackend ? (
                    <div style={{ flex: 1, minWidth: 260, display: "flex", gap: 8 }}>
                      <input
                        value={backendDraft}
                        onChange={(e) => setBackendDraft(e.target.value)}
                        placeholder="http://your-host:5000"
                        style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1px solid #6366f1", fontSize: 12.5, fontFamily: "monospace", fontWeight: 700, color: "#0f172a", outline: "none", background: "#f8fafc" }}
                      />
                      <button onClick={saveBackendBase} style={{ display: "flex", alignItems: "center", gap: 5, background: "#6366f1", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 11.5, fontWeight: 800, color: "#ffffff", cursor: "pointer" }}>
                        <Check size={12} /> Save
                      </button>
                      <button onClick={() => setEditingBackend(false)} style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 12px", fontSize: 11.5, fontWeight: 700, color: "#475569", cursor: "pointer" }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <code style={{ flex: 1, minWidth: 260, padding: "9px 12px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 12.5, fontFamily: "monospace", fontWeight: 700, color: "#0f172a" }}>
                        {base.backend || "detecting…"}
                      </code>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", background: "#f1f5f9", border: "1px solid #e2e8f0", padding: "3px 9px", borderRadius: 99 }}>
                        AUTO (same host :5000) — editable
                      </span>
                      <button onClick={() => setEditingBackend(true)} style={{ display: "flex", alignItems: "center", gap: 5, background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 12px", fontSize: 11.5, fontWeight: 700, color: "#334155", cursor: "pointer" }}>
                        <Code2 size={12} /> Edit
                      </button>
                    </>
                  )}
                </div>
              </div>

              <p style={{ margin: "14px 0 0 0", fontSize: 11.5, color: "#94a3b8", lineHeight: 1.6 }}>
                <Lightbulb size={12} style={{ display: "inline", verticalAlign: "middle" }} /> Next.js SDK routes (<code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5 }}>/api/…</code>) live on the same origin as this page.
                The Flask engine normally listens on port <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5 }}>5000</code> of the same host. Override the Flask URL above if your backend is deployed separately.
              </p>
            </div>

            {/* Two integration paths */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ padding: 20, borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(14,165,233,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Globe size={19} color="#0ea5e9" />
                  </div>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Path A — Next.js SDK Routes (same origin)</h4>
                </div>
                <p style={{ margin: "0 0 10px 0", fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
                  Call <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5, color: "#6366f1" }}>{base.frontend}/api/…</code> directly from your app. Best for:
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#475569", lineHeight: 1.9 }}>
                  <li>Reading presence, history, logs, cameras, visitors</li>
                  <li>Registering faces and employees (HRMS sync)</li>
                  <li>Web dashboards & mobile apps</li>
                </ul>
              </div>

              <div style={{ padding: 20, borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Server size={19} color="#6366f1" />
                  </div>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Path B — Python Flask Backend (API key)</h4>
                </div>
                <p style={{ margin: "0 0 10px 0", fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
                  Call <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5, color: "#6366f1" }}>{base.backend}/api/…</code> with your <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5 }}>x-api-key</code>. Best for:
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#475569", lineHeight: 1.9 }}>
                  <li>Server-to-server integrations (attendance, ERP)</li>
                  <li>Partner HRMS log feed <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5 }}>/api/hrms/logs</code></li>
                  <li>Worker control, enrollment & admin operations</li>
                </ul>
              </div>
            </div>

            {/* Quick start */}
            <div style={{ padding: 20, borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              <h4 style={{ margin: "0 0 14px 0", fontSize: 14, fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldCheck size={16} color="#10b981" /> Quick Start Checklist
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                {[
                  { icon: KeyRound, title: "1. Create a partner key", desc: "Open the Partner Keys tab, give it a name (e.g. HRMS Bridge) and pick scopes.", color: "#f59e0b" },
                  { icon: BookOpen, title: "2. Pick your endpoints", desc: "Browse the full API Reference for Next.js and Python routes.", color: "#6366f1" },
                  { icon: Rocket, title: "3. Follow the guide", desc: "The Integration Guide walks through real curl / Python / JS examples.", color: "#0ea5e9" },
                  { icon: ShieldCheck, title: "4. Store keys safely", desc: "Keys are hashed at rest and shown once. Keep them in .env, never in code.", color: "#10b981" },
                ].map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (s.title.startsWith("1.")) setActiveTab("keys");
                      else if (s.title.startsWith("2.")) setActiveTab("reference");
                      else if (s.title.startsWith("3.")) setActiveTab("guide");
                      else setActiveTab("keys");
                    }}
                    style={{ textAlign: "left", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", transition: "all 0.15s" }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                      <s.icon size={17} color={s.color} />
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: "#0f172a", marginBottom: 3 }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─────────────── TAB: PRESENCE ─────────────── */}
        {activeTab === "presence" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ padding: 20, borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#6366f1", textTransform: "uppercase", letterSpacing: 0.5 }}>Dynamic Presence Engine</span>
                <h2 style={{ margin: "2px 0 0 0", fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                  Currently Present People ({filteredPresence.length})
                </h2>
                <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "#64748b" }}>
                  Computed dynamically from immutable CCTV detection logs within trailing window of {presenceMinutes} minutes.
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Time Window:</span>
                {[5, 10, 30, 60].map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setPresenceMinutes(m);
                      fetchPresence(m);
                    }}
                    style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, border: "none", background: presenceMinutes === m ? "#6366f1" : "#f1f5f9", color: presenceMinutes === m ? "#ffffff" : "#475569", cursor: "pointer" }}
                  >
                    {m} mins
                  </button>
                ))}
              </div>
            </div>

            {presenceLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "#64748b", background: "#ffffff", borderRadius: 16, border: "1px solid #e2e8f0" }}>
                Loading presence telemetry...
              </div>
            ) : filteredPresence.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#64748b", background: "#ffffff", borderRadius: 16, border: "1px solid #e2e8f0" }}>
                <Users size={36} color="#cbd5e1" style={{ marginBottom: 10 }} />
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#334155" }}>No active presence detected in the last {presenceMinutes} minutes</p>
                <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "#94a3b8" }}>Try selecting a wider time window (e.g. 30m or 60m)</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
                {filteredPresence.map((p) => (
                  <div key={p.person_id} style={{ padding: 18, borderRadius: 18, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 4px 14px rgba(0,0,0,0.03)", display: "flex", gap: 14 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 16, overflow: "hidden", background: "#f1f5f9", flexShrink: 0, border: "2px solid #e2e8f0" }}>
                      {p.photo_url || p.snapshot_url ? (
                        <img src={p.photo_url || p.snapshot_url || ""} alt={p.person_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontWeight: 800 }}>
                          {p.person_name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                        <h4 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {p.person_name}
                        </h4>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#10b981", background: "#dcfce7", padding: "2px 6px", borderRadius: 99 }}>
                          {(p.confidence * 100).toFixed(0)}% Match
                        </span>
                      </div>

                      <p style={{ margin: "2px 0 6px 0", fontSize: 11.5, color: "#64748b" }}>
                        {p.department || "Staff"} • {p.employee_code || "ENROLLED"}
                      </p>

                      <div style={{ fontSize: 11, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Cctv size={13} color="#0ea5e9" /> CCTV: <strong>{p.camera_name || p.camera_id || "Main Entrance"}</strong>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Clock size={13} color="#6366f1" /> Last Seen: <strong>{new Date(p.last_seen_at).toLocaleTimeString()}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <CodeSnippetCard title="GET /api/presence Code Generator" snippet={getPresenceCodeSnippet()} codeLang={codeLang} setCodeLang={setCodeLang} onCopy={copyToClipboard} copied={copied} />
          </div>
        )}

        {/* ─────────────── TAB: HISTORY ─────────────── */}
        {activeTab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ padding: 20, borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 4 }}>Select Enrolled Person:</label>
                <select
                  value={historyPersonId}
                  onChange={(e) => setHistoryPersonId(e.target.value)}
                  style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13, minWidth: 260, fontWeight: 600 }}
                >
                  {enrolledPersons.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ fontSize: 12, color: "#64748b" }}>
                Endpoint: <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 6, color: "#6366f1", fontFamily: "monospace" }}>GET /api/presence/history?person_id={historyPersonId || "ID"}</code>
              </div>
            </div>

            <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 700 }}>Timestamp</th>
                    <th style={{ padding: "12px 16px", fontWeight: 700 }}>CCTV Camera Location</th>
                    <th style={{ padding: "12px 16px", fontWeight: 700 }}>Match Confidence</th>
                    <th style={{ padding: "12px 16px", fontWeight: 700 }}>Snapshot Frame</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLoading ? (
                    <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Loading visit history...</td></tr>
                  ) : historyItems.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", color: "#64748b" }}>No detection history logs found for this person.</td></tr>
                  ) : (
                    historyItems.map((item) => (
                      <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>
                          {new Date(item.created_at).toLocaleString()}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#334155" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Cctv size={14} color="#0ea5e9" />
                            {item.camera_name || item.camera_id || "Camera"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", fontWeight: 700, color: "#10b981" }}>
                          {(item.confidence * 100).toFixed(1)}%
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {item.snapshot_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.snapshot_url} alt="Snap" style={{ width: 38, height: 38, borderRadius: 8, objectFit: "cover" }} />
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: 11 }}>N/A</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─────────────── TAB: CAMERAS ─────────────── */}
        {activeTab === "cameras" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
              {cameraActivities.map((cam) => (
                <div key={cam.camera_id} style={{ padding: 20, borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Cctv size={18} color="#0ea5e9" />
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{cam.camera_name || cam.camera_id}</h3>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 99, background: "#dcfce7", color: "#166534", display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} /> {cam.status.toUpperCase()}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, padding: 12, borderRadius: 12, background: "#f8fafc", marginBottom: 12, textAlign: "center" }}>
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b" }}>Total Today</span>
                      <p style={{ margin: "2px 0 0 0", fontSize: 18, fontWeight: 900, color: "#0f172a" }}>{cam.total_detections_today}</p>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b" }}>Known</span>
                      <p style={{ margin: "2px 0 0 0", fontSize: 18, fontWeight: 900, color: "#10b981" }}>{cam.total_known_detections}</p>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b" }}>Unknown</span>
                      <p style={{ margin: "2px 0 0 0", fontSize: 18, fontWeight: 900, color: "#f59e0b" }}>{cam.total_unknown_detections}</p>
                    </div>
                  </div>

                  <div style={{ fontSize: 11.5, color: "#64748b" }}>
                    Last Detection: <strong>{cam.last_seen_at ? new Date(cam.last_seen_at).toLocaleTimeString() : "No detections yet"}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─────────────── TAB: UNKNOWN ─────────────── */}
        {activeTab === "unknown" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ padding: 16, borderRadius: 14, background: "#ffffff", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Unknown / Unmatched CCTV Security Events Today</h3>
                <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "#64748b" }}>Logged automatically with person_id = null for security auditing.</p>
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#f59e0b", background: "#fef3c7", padding: "4px 10px", borderRadius: 99 }}>
                {unknownLogs.length} Detections
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
              {unknownLogs.map((log) => (
                <div key={log.id} style={{ padding: 14, borderRadius: 14, background: "#ffffff", border: "1px solid #e2e8f0", display: "flex", gap: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 10, overflow: "hidden", background: "#f1f5f9", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {log.snapshot_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={log.snapshot_url} alt="Unknown Face" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <UserX size={24} color="#94a3b8" />
                    )}
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#0f172a" }}>Unknown Person</h4>
                    <p style={{ margin: "2px 0 0 0", fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
                      <Cctv size={12} color="#0ea5e9" /> {log.camera_name || log.camera_id || "Camera"}
                    </p>
                    <p style={{ margin: "2px 0 0 0", fontSize: 10.5, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock size={11} /> {new Date(log.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─────────────── TAB: API REFERENCE ─────────────── */}
        {activeTab === "reference" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ padding: 20, borderRadius: 16, background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "#ffffff" }}>
              <h2 style={{ margin: "0 0 8px 0", fontSize: 18, fontWeight: 800, display: "flex", alignItems: "center", gap: 10 }}>
                <BookOpen size={20} color="#38bdf8" /> Full API Reference
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
                Every endpoint exposed by Sentinel. Expand a row to copy a ready-to-run <code style={{ color: "#38bdf8" }}>curl</code> command and see a sample response.
                Code is generated live from the auto-detected domains above.
              </p>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(14,165,233,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Globe size={17} color="#0ea5e9" />
                </div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Next.js SDK Routes</h3>
                <code style={{ marginLeft: 6, background: "#f1f5f9", padding: "2px 8px", borderRadius: 6, fontSize: 11.5, fontFamily: "monospace", color: "#0ea5e9", fontWeight: 700 }}>{base.frontend || "/api/…"}</code>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#475569" }}>({nextEndpoints.length} endpoints)</span>
              </div>
              {renderEndpointTable(nextEndpoints, base.frontend || "/")}
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Server size={17} color="#6366f1" />
                </div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Python Flask Backend</h3>
                <code style={{ marginLeft: 6, background: "#f1f5f9", padding: "2px 8px", borderRadius: 6, fontSize: 11.5, fontFamily: "monospace", color: "#6366f1", fontWeight: 700 }}>{base.backend || "http://…:5000"}</code>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#475569" }}>({flaskEndpoints.length} endpoints)</span>
              </div>
              {renderEndpointTable(flaskEndpoints, base.backend || "http://localhost:5000")}
            </div>
          </div>
        )}

        {/* ─────────────── TAB: INTEGRATION GUIDE ─────────────── */}
        {activeTab === "guide" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ padding: 24, borderRadius: 16, background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "#ffffff" }}>
              <h2 style={{ margin: "0 0 8px 0", fontSize: 18, fontWeight: 800, display: "flex", alignItems: "center", gap: 10 }}>
                <Rocket size={20} color="#38bdf8" /> How to Integrate a Third-Party System
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.6, maxWidth: 880 }}>
                Step-by-step walkthrough for connecting an external app — attendance sync, HRMS, visitor kiosk, or your own dashboard —
                to Sentinel. All examples use the auto-detected domain <code style={{ color: "#38bdf8" }}>{base.frontend || "this origin"}</code>.
              </p>
            </div>

            {[
              {
                n: "01",
                icon: KeyRound,
                color: "#f59e0b",
                title: "Create an integration partner key",
                body: (
                  <p style={{ margin: 0, fontSize: 12.5, color: "#475569", lineHeight: 1.7 }}>
                    Open the <strong>Partner Keys</strong> tab and generate a key named after your system (e.g. <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5 }}>HRMS Bridge</code>). Pick scopes:
                    <strong> read</strong> for presence/history/logs, <strong>write</strong> for enrollment/cameras, <strong>admin</strong> for everything.
                    Copy the full key immediately — it is hashed at rest and shown only once.
                  </p>
                ),
                code: `# .env of your third-party app — never hardcode the key in source code.
SENTINEL_API_KEY="sentinel_live_1a2b3c4d.<your-secret>"
SENTINEL_BACKEND="${base.backend || "http://your-host:5000"}";
SENTINEL_SDK="${base.frontend || "https://your-app.com"}"`,
              },
              {
                n: "02",
                icon: Globe,
                color: "#0ea5e9",
                title: "Verify connectivity",
                body: (
                  <p style={{ margin: 0, fontSize: 12.5, color: "#475569", lineHeight: 1.7 }}>
                    Hit the health endpoint to confirm the backend is up, the database is connected and the model is loaded.
                    The <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5 }}>/api/health</code> endpoint is public — no key needed.
                  </p>
                ),
                code: `curl "${base.backend || "http://your-host:5000"}/api/health" \\
  -H "x-api-key: ${activeKey}"`,
              },
              {
                n: "03",
                icon: Users,
                color: "#10b981",
                title: "Read live presence",
                body: (
                  <p style={{ margin: 0, fontSize: 12.5, color: "#475569", lineHeight: 1.7 }}>
                    Pull the list of people currently present. Use <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5 }}>/api/presence?minutes=10</code>
                    (same-origin SDK) or <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5 }}>/api/presence/all</code> (Flask, live engine).
                  </p>
                ),
                code: `# Python — poll every 30 seconds from your service.
import requests

BASE = "${base.frontend || "https://your-app.com"}"

r = requests.get(f"{BASE}/api/presence?minutes=10")
data = r.json()
for person in data["present"]:
    print(person["person_name"], person["camera_name"], f'{person["confidence"]*100:.0f}%')`,
              },
              {
                n: "04",
                icon: Clock,
                color: "#6366f1",
                title: "Pull per-person visit history",
                body: (
                  <p style={{ margin: 0, fontSize: 12.5, color: "#475569", lineHeight: 1.7 }}>
                    Get the full detection timeline for an enrolled person for attendance / reporting.
                    Pass the person id you received from <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5 }}>/api/registered_faces</code>.
                  </p>
                ),
                code: `PERSON_ID="<from /api/registered_faces>"

curl "${base.frontend || "https://your-app.com"}/api/presence/history?person_id=$PERSON_ID&limit=50" \\
  -H "x-api-key: ${activeKey}"`,
              },
              {
                n: "05",
                icon: UserCheck,
                color: "#8b5cf6",
                title: "Enroll employees / sync HRMS",
                body: (
                  <p style={{ margin: 0, fontSize: 12.5, color: "#475569", lineHeight: 1.7 }}>
                    Two options: enroll one face at a time with <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5 }}>POST /api/register</code>, or bulk-sync a batch of
                    employees with <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5 }}>POST /api/hrms/bulk_register</code> — attaching employee_code, department and designation so every
                    future detection is enriched automatically.
                  </p>
                ),
                code: `curl -X POST "${base.frontend || "https://your-app.com"}/api/hrms/bulk_register" \\
  -H "Content-Type: application/json" \\
  -d '{
    "employees": [
      { "name": "Raja", "employee_code": "1111", "department": "Engineering", "designation": "Dev", "photo_base64": "<image>" }
    ]
  }'`,
              },
              {
                n: "06",
                icon: BarChart3,
                color: "#f59e0b",
                title: "Consume the partner log feed (attendance)",
                body: (
                  <p style={{ margin: 0, fontSize: 12.5, color: "#475569", lineHeight: 1.7 }}>
                    The Flask endpoint <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5 }}>GET /api/hrms/logs</code> (API key required) returns face-matching logs
                    enriched with employee_code, department, designation and camera info — ideal for attendance engines.
                    Filter by <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5 }}>since</code>, <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5 }}>employee_code</code>, and page with <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5 }}>limit</code>/<code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5 }}>offset</code>.
                  </p>
                ),
                code: `# Python — sync attendance every minute.
import os, time, requests

API_KEY = os.environ["SENTINEL_API_KEY"]
BASE = "${base.backend || "http://your-host:5000"}"

r = requests.get(
    f"{BASE}/api/hrms/logs",
    params={"since": "2026-01-01T00:00:00", "limit": 200},
    headers={"x-api-key": API_KEY},
)
for log in r.json()["logs"]:
    print(log["person_name"], log.get("employee_code"), log["timestamp"], log.get("department"))`,
              },
              {
                n: "07",
                icon: ShieldCheck,
                color: "#10b981",
                title: "Security & operations best practices",
                body: (
                  <p style={{ margin: 0, fontSize: 12.5, color: "#475569", lineHeight: 1.7 }}>
                    Keys are SHA-256 hashed at rest and tracked with <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5 }}>last_used_at</code>. Keep them in environment variables, rotate by revoking the old key and creating a new one —
                    revocation takes effect immediately without restarting the backend. Use <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 5 }}>read</code>-only keys where possible.
                  </p>
                ),
                code: `# Revoke a compromised key instantly.
curl -X POST "${base.frontend || "https://your-app.com"}/api/api_keys/<key_id>/revoke"`,
              },
            ].map((step) => (
              <div key={step.n} style={{ padding: 20, borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", flexDirection: "column" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: `${step.color}18`, border: `1px solid ${step.color}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <step.icon size={19} color={step.color} />
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: step.color, fontFamily: "monospace" }}>STEP {step.n}</span>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{step.title}</h3>
                    </div>
                    {step.body}
                    <div style={{ marginTop: 12, borderRadius: 12, background: "#0f172a", overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid #1e293b" }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: "#38bdf8", display: "flex", alignItems: "center", gap: 6 }}>
                          <Terminal size={12} /> EXAMPLE
                        </span>
                        <button
                          onClick={() => quickCopy(step.code)}
                          style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.1)", border: "none", color: "#ffffff", fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 6, cursor: "pointer" }}
                        >
                          {copied ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                          {copied ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <pre style={{ margin: 0, padding: 12, fontSize: 11.5, color: "#e2e8f0", overflowX: "auto", fontFamily: "monospace", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {step.code}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div style={{ padding: 20, borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0" }}>
              <h4 style={{ margin: "0 0 10px 0", fontSize: 14, fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}>
                <ExternalLink size={15} color="#6366f1" /> Next Steps
              </h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button onClick={() => setActiveTab("reference")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10, background: "#f1f5f9", border: "1px solid #cbd5e1", fontSize: 12.5, fontWeight: 700, color: "#334155", cursor: "pointer" }}>
                  <BookOpen size={14} /> Browse full API reference <ArrowRight size={13} />
                </button>
                <button onClick={() => setActiveTab("keys")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10, background: "#f1f5f9", border: "1px solid #cbd5e1", fontSize: 12.5, fontWeight: 700, color: "#334155", cursor: "pointer" }}>
                  <KeyRound size={14} /> Manage partner keys <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────── TAB: KEYS ─────────────── */}
        {activeTab === "keys" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ padding: 24, borderRadius: 16, background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <div>
                <h2 style={{ margin: "0 0 6px 0", fontSize: 18, fontWeight: 800, display: "flex", alignItems: "center", gap: 10 }}>
                  <KeyRound size={20} color="#38bdf8" /> Integration Partner API Keys
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.5, maxWidth: 640 }}>
                  Generate one key per partner or external system. Keys are stored as SHA-256 hashes and shown in full <strong style={{ color: "#e2e8f0" }}>only once</strong> at creation.
                  Pass them via <code style={{ color: "#38bdf8" }}>x-api-key</code> or <code style={{ color: "#38bdf8" }}>Authorization: Bearer</code>.
                </p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8", background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.3)", padding: "4px 10px", borderRadius: 99 }}>
                {apiKeys.filter((k) => !k.revoked).length} active / {apiKeys.length} total
              </span>
            </div>

            <div style={{ padding: 20, borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              <h4 style={{ margin: "0 0 14px 0", fontSize: 14, fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}>
                <Plus size={16} color="#6366f1" /> Create a New Partner Key
              </h4>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "#475569", marginBottom: 4 }}>Partner / Integration Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Attendance Sync, HRMS Bridge, Visitor Kiosk"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13, fontWeight: 600, outline: "none" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "#475569", marginBottom: 4 }}>Description (optional)</label>
                    <input
                      type="text"
                      placeholder="What this integration does"
                      value={newKeyDesc}
                      onChange={(e) => setNewKeyDesc(e.target.value)}
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13, fontWeight: 600, outline: "none" }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "#475569", marginBottom: 4 }}>Permission Scopes</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {["read", "write", "admin"].map((s) => (
                      <button
                        key={s}
                        onClick={() =>
                          setNewKeyScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
                        }
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          border: newKeyScopes.includes(s) ? "1px solid #6366f1" : "1px solid #e2e8f0",
                          background: newKeyScopes.includes(s) ? "rgba(99,102,241,0.08)" : "#f8fafc",
                          color: newKeyScopes.includes(s) ? "#4338ca" : "#64748b",
                          cursor: "pointer",
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <p style={{ margin: "6px 0 0 0", fontSize: 11, color: "#94a3b8" }}>
                    read = presence/history/logs • write = register/enroll/cameras • admin = full access
                  </p>
                </div>

                {keysError && (
                  <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 12.5, fontWeight: 700 }}>
                    {keysError}
                  </div>
                )}

                <button
                  onClick={createApiKey}
                  disabled={creatingKey || !newKeyName.trim()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    alignSelf: "flex-start",
                    padding: "10px 20px",
                    borderRadius: 10,
                    background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                    color: "#ffffff",
                    border: "none",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: creatingKey || !newKeyName.trim() ? "not-allowed" : "pointer",
                    opacity: creatingKey || !newKeyName.trim() ? 0.6 : 1,
                    boxShadow: "0 4px 14px rgba(99,102,241,0.3)",
                  }}
                >
                  <KeyRound size={15} /> {creatingKey ? "Generating..." : "Generate API Key"}
                </button>
              </div>
            </div>

            {revealedKey && (
              <div style={{ padding: 20, borderRadius: 16, background: "linear-gradient(135deg, #052e16 0%, #064e3b 100%)", border: "1px solid #10b981", color: "#ffffff" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
                    <Lock size={16} color="#34d399" /> New Key Created for "{revealedKey.name}"
                  </h4>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#34d399", background: "rgba(52,211,153,0.15)", padding: "4px 10px", borderRadius: 99 }}>
                    COPY NOW — shown only once
                  </span>
                </div>
                <pre style={{ margin: 0, padding: 12, borderRadius: 10, background: "#022c22", color: "#6ee7b7", fontFamily: "monospace", fontSize: 12.5, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {revealedKey.secret_key}
                </pre>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button
                    onClick={() => copyToClipboard(revealedKey.secret_key)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, background: "#10b981", color: "#022c22", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied!" : "Copy Full Key"}
                  </button>
                  <button
                    onClick={() => setRevealedKey(null)}
                    style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.1)", color: "#a7f3d0", border: "1px solid rgba(255,255,255,0.2)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Issued Keys</h4>
                <button onClick={fetchApiKeys} style={{ display: "flex", alignItems: "center", gap: 6, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", fontSize: 11.5, fontWeight: 700, color: "#475569", cursor: "pointer" }}>
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>

              {apiKeysLoading ? (
                <div style={{ padding: 32, textAlign: "center", color: "#64748b", fontSize: 13 }}>Loading keys...</div>
              ) : apiKeys.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  <KeyRound size={28} color="#cbd5e1" style={{ marginBottom: 8 }} />
                  <p style={{ margin: 0, fontWeight: 700, color: "#475569" }}>No API keys yet</p>
                  <p style={{ margin: "4px 0 0 0" }}>Generate your first partner key above to start integrating.</p>
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
                      <th style={{ padding: "12px 16px", fontWeight: 700 }}>Partner</th>
                      <th style={{ padding: "12px 16px", fontWeight: 700 }}>Key Prefix</th>
                      <th style={{ padding: "12px 16px", fontWeight: 700 }}>Scopes</th>
                      <th style={{ padding: "12px 16px", fontWeight: 700 }}>Created</th>
                      <th style={{ padding: "12px 16px", fontWeight: 700 }}>Last Used</th>
                      <th style={{ padding: "12px 16px", fontWeight: 700 }}>Status</th>
                      <th style={{ padding: "12px 16px", fontWeight: 700 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map((k) => (
                      <tr key={k.id} style={{ borderBottom: "1px solid #f1f5f9", opacity: k.revoked ? 0.5 : 1 }}>
                        <td style={{ padding: "12px 16px", fontWeight: 800, color: "#0f172a" }}>
                          {k.name}
                          {k.description && <span style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#64748b" }}>{k.description}</span>}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <code style={{ background: "#f1f5f9", padding: "2px 8px", borderRadius: 6, fontSize: 11.5, color: "#6366f1", fontFamily: "monospace" }}>
                            {k.prefix}...
                          </code>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {(k.scopes || []).map((s: string) => (
                              <span key={s} style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 99, background: s === "admin" ? "#fef3c7" : "#e0e7ff", color: s === "admin" ? "#92400e" : "#4338ca" }}>
                                {s}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#475569", fontSize: 12 }}>
                          {new Date(k.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: 12 }}>
                          {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {k.revoked ? (
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: "#b91c1c", background: "#fef2f2", padding: "3px 10px", borderRadius: 99 }}>REVOKED</span>
                          ) : (
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: "#166534", background: "#dcfce7", padding: "3px 10px", borderRadius: 99 }}>ACTIVE</span>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          {!k.revoked && (
                            <button
                              onClick={() => revokeApiKey(k.id)}
                              disabled={revokingId === k.id}
                              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
                              title="Revoke key"
                            >
                              <Trash2 size={12} /> {revokingId === k.id ? "Revoking..." : "Revoke"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <CodeSnippetCard
              title="Integrate Your Partner System (Python)"
              snippet={`# Python — add this key to your .env, never hardcode it.
SENTINEL_API_KEY="${revealedKey ? revealedKey.secret_key : "YOUR_SECRET_API_KEY"}"
SENTINEL_URL="${base.backend || "http://localhost:5000"}"

import os
import requests

response = requests.get(
    f"{os.environ['SENTINEL_URL']}/api/presence/all?minutes=10",
    headers={"x-api-key": os.environ["SENTINEL_API_KEY"]},
)
data = response.json()
print(data)`}
              codeLang="python"
              setCodeLang={setCodeLang}
              onCopy={copyToClipboard}
              copied={copied}
            />
          </div>
        )}

        {activeTab === "orgs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ padding: 24, borderRadius: 16, background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <div>
                <h2 style={{ margin: "0 0 6px 0", fontSize: 18, fontWeight: 800, display: "flex", alignItems: "center", gap: 10 }}>
                  <Building2 size={20} color="#38bdf8" /> Multi-Tenant Organization Platform
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.5, maxWidth: 680 }}>
                  Manage tenant organizations, their integration apps, app-scoped API keys, webhook endpoints, usage metering and org-scoped detection logs.
                  All mutations require a <strong style={{ color: "#e2e8f0" }}>master / admin-scoped key</strong>.
                </p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8", background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.3)", padding: "4px 10px", borderRadius: 99 }}>
                {orgs.length} organization(s)
              </span>
            </div>

            <div style={{ padding: 20, borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              <h4 style={{ margin: "0 0 10px 0", fontSize: 14, fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}>
                <Lock size={16} color="#6366f1" /> Admin Key (required for org APIs)
              </h4>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  type="password"
                  value={orgAdminKey}
                  onChange={(e) => saveOrgAdminKey(e.target.value)}
                  placeholder="Paste your master / admin-scoped API key (from Partner Keys tab)"
                  style={{ flex: 1, minWidth: 280, padding: "9px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 12.5, fontFamily: "monospace", fontWeight: 600, outline: "none" }}
                />
                <button
                  onClick={fetchOrgs}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 10, background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)", color: "#ffffff", border: "none", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
                >
                  <Building2 size={14} /> Load Organizations
                </button>
              </div>
            </div>

            {orgError && (
              <div style={{ padding: "12px 16px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 12.5, fontWeight: 700 }}>
                {orgError}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ padding: 20, borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0" }}>
                <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}>
                  <Plus size={16} color="#10b981" /> Create Organization
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <input
                    type="text"
                    placeholder="Name (required)"
                    value={orgForm.name}
                    onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                    style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13, fontWeight: 600, outline: "none" }}
                  />
                  <input
                    type="text"
                    placeholder="Slug (optional, auto-generated)"
                    value={orgForm.slug}
                    onChange={(e) => setOrgForm({ ...orgForm, slug: e.target.value })}
                    style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13, fontWeight: 600, outline: "none" }}
                  />
                  <select
                    value={orgForm.plan}
                    onChange={(e) => setOrgForm({ ...orgForm, plan: e.target.value })}
                    style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13, fontWeight: 600, outline: "none" }}
                  >
                    <option value="free">free</option>
                    <option value="pro">pro</option>
                    <option value="enterprise">enterprise</option>
                  </select>
                  <button
                    onClick={createOrg}
                    disabled={creatingOrg || !orgForm.name.trim()}
                    style={{ padding: "10px 16px", borderRadius: 10, background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", color: "#ffffff", border: "none", fontSize: 13, fontWeight: 700, cursor: creatingOrg || !orgForm.name.trim() ? "not-allowed" : "pointer", opacity: creatingOrg || !orgForm.name.trim() ? 0.6 : 1 }}
                  >
                    {creatingOrg ? "Creating..." : "Create Organization"}
                  </button>
                </div>
              </div>

              <div style={{ padding: 20, borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0" }}>
                <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}>
                  <Building2 size={16} color="#f59e0b" /> Organizations
                </h4>
                {orgsLoading ? (
                  <div style={{ padding: 20, textAlign: "center", color: "#64748b", fontSize: 13 }}>Loading...</div>
                ) : orgs.length === 0 ? (
                  <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                    No organizations visible with this key.
                    <div style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.6 }}>
                      Org management requires the master key or an admin-scoped key with an assigned org.
                      Keys created in the "Partner Keys" tab are unscoped and show nothing here.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {orgs.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => selectOrg(o)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "12px 14px",
                          borderRadius: 10,
                          border: selectedOrg?.id === o.id ? "1px solid #6366f1" : "1px solid #e2e8f0",
                          background: selectedOrg?.id === o.id ? "rgba(99,102,241,0.06)" : "#f8fafc",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#0f172a" }}>{o.name}</div>
                          <div style={{ fontSize: 11.5, color: "#64748b" }}>
                            {o.slug} • plan: {o.plan} • {o.status}
                          </div>
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: "#4338ca", background: "#e0e7ff", padding: "3px 9px", borderRadius: 99 }}>
                          OPEN
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {selectedOrg && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ padding: 18, borderRadius: 14, background: "linear-gradient(135deg, #f5f3ff 0%, #eef2ff 100%)", border: "1px solid #c7d2fe", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#312e81" }}>{selectedOrg.name}</h3>
                    <span style={{ fontSize: 12, color: "#6d28d9" }}>
                      {selectedOrg.id} • plan: {selectedOrg.plan} • status: {selectedOrg.status}
                    </span>
                  </div>
                  {orgUsage && (
                    <div style={{ display: "flex", gap: 14 }}>
                      <div style={{ textAlign: "center", background: "#ffffff", border: "1px solid #e0e7ff", borderRadius: 10, padding: "6px 14px" }}>
                        <div style={{ fontSize: 17, fontWeight: 900, color: "#0f172a" }}>{orgUsage.total_requests}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Requests</div>
                      </div>
                      <div style={{ textAlign: "center", background: "#ffffff", border: "1px solid #fecaca", borderRadius: 10, padding: "6px 14px" }}>
                        <div style={{ fontSize: 17, fontWeight: 900, color: "#b91c1c" }}>{orgUsage.error_requests}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Errors</div>
                      </div>
                    </div>
                  )}
                </div>

                {orgLoading && <div style={{ padding: 16, textAlign: "center", color: "#64748b", fontSize: 13 }}>Loading org data...</div>}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={{ padding: 20, borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0" }}>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Integration Apps</h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                      {orgApps.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>No apps yet.</div>}
                      {orgApps.map((a) => (
                        <div key={a.id} style={{ padding: "10px 12px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 12.5 }}>
                          <strong style={{ color: "#0f172a" }}>{a.name}</strong>
                          <span style={{ float: "right", fontSize: 10.5, fontWeight: 800, color: "#4338ca", background: "#e0e7ff", padding: "2px 8px", borderRadius: 99 }}>{a.app_type}</span>
                          {a.description && <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>{a.description}</div>}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        placeholder="App name"
                        value={appForm.name}
                        onChange={(e) => setAppForm({ ...appForm, name: e.target.value })}
                        style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12, outline: "none" }}
                      />
                      <select
                        value={appForm.app_type}
                        onChange={(e) => setAppForm({ ...appForm, app_type: e.target.value })}
                        style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12, outline: "none" }}
                      >
                        {["hrms", "attendance", "erp", "visitor_kiosk", "mobile", "dashboard", "analytics", "iot", "other"].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <button onClick={createOrgApp} style={{ padding: "8px 14px", borderRadius: 8, background: "#6366f1", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Add
                      </button>
                    </div>
                  </div>

                  <div style={{ padding: 20, borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0" }}>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 800, color: "#0f172a" }}>App-Scoped API Keys</h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                      {orgKeys.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>No keys yet.</div>}
                      {orgKeys.map((k) => (
                        <div key={k.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 12.5 }}>
                          <div>
                            <strong style={{ color: "#0f172a" }}>{k.name}</strong>
                            <span style={{ display: "block", fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{k.prefix}...</span>
                          </div>
                          <div style={{ display: "flex", gap: 4 }}>
                            {(k.scopes || []).map((s: string) => (
                              <span key={s} style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 99, background: s === "admin" ? "#fef3c7" : "#e0e7ff", color: s === "admin" ? "#92400e" : "#4338ca" }}>{s}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        placeholder="Key name"
                        value={orgKeyForm.name}
                        onChange={(e) => setOrgKeyForm({ ...orgKeyForm, name: e.target.value })}
                        style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12, outline: "none" }}
                      />
                      <select
                        value={orgKeyForm.scopes}
                        onChange={(e) => setOrgKeyForm({ ...orgKeyForm, scopes: e.target.value })}
                        style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12, outline: "none" }}
                      >
                        <option value="read">read</option>
                        <option value="read,write">read,write</option>
                        <option value="read,write,admin">read,write,admin</option>
                      </select>
                      <button onClick={createOrgKey} style={{ padding: "8px 14px", borderRadius: 8, background: "#10b981", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Issue
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ padding: 20, borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0" }}>
                  <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}>
                    <Webhook size={16} color="#f59e0b" /> Webhook Endpoints
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                    {orgWebhooks.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>No webhook endpoints. Events (face_detected, unknown_person, ...) are delivered to subscribed URLs with HMAC-SHA256 signatures.</div>}
                    {orgWebhooks.map((w) => (
                      <div key={w.id} style={{ padding: "10px 12px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 12.5 }}>
                        <strong style={{ color: "#0f172a" }}>{w.name}</strong>
                        <span style={{ float: "right", fontSize: 10.5, fontWeight: 800, color: w.active ? "#166534" : "#b91c1c", background: w.active ? "#dcfce7" : "#fee2e2", padding: "2px 8px", borderRadius: 99 }}>{w.active ? "ACTIVE" : "INACTIVE"}</span>
                        <div style={{ fontSize: 11.5, color: "#64748b", fontFamily: "monospace", marginTop: 3 }}>{w.url}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                          events: {(w.event_types || []).join(", ") || "all"}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Webhook name"
                      value={webhookForm.name}
                      onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })}
                      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12, outline: "none" }}
                    />
                    <input
                      type="text"
                      placeholder="https://your-app.example.com/webhook"
                      value={webhookForm.url}
                      onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
                      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12, outline: "none", fontFamily: "monospace" }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        placeholder="event_types (comma separated, blank = all)"
                        value={webhookForm.event_types}
                        onChange={(e) => setWebhookForm({ ...webhookForm, event_types: e.target.value })}
                        style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12, outline: "none", fontFamily: "monospace" }}
                      />
                      <button onClick={createOrgWebhook} style={{ padding: "8px 16px", borderRadius: 8, background: "#f59e0b", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Add Webhook
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ padding: 20, borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0" }}>
                  <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}>
                    <Activity size={16} color="#0ea5e9" /> Org-Scoped Detection Logs (recent 50)
                  </h4>
                  {orgLogs.length === 0 ? (
                    <div style={{ padding: 16, textAlign: "center", color: "#94a3b8", fontSize: 12.5 }}>
                      No detection logs tagged to this organization yet. Assign org_id to cameras in the DB to start feeding this feed.
                    </div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
                          <th style={{ padding: "8px 10px" }}>Person</th>
                          <th style={{ padding: "8px 10px" }}>Confidence</th>
                          <th style={{ padding: "8px 10px" }}>Camera</th>
                          <th style={{ padding: "8px 10px" }}>Employee Code</th>
                          <th style={{ padding: "8px 10px" }}>Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orgLogs.map((l, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "8px 10px", fontWeight: 700, color: "#0f172a" }}>{l.person_name}</td>
                            <td style={{ padding: "8px 10px" }}>{(l.confidence ?? 0).toFixed(4)}</td>
                            <td style={{ padding: "8px 10px", color: "#475569" }}>{l.camera_name || l.camera_id}</td>
                            <td style={{ padding: "8px 10px", color: "#475569" }}>{l.employee_code || "-"}</td>
                            <td style={{ padding: "8px 10px", color: "#64748b" }}>{l.timestamp ? new Date(l.timestamp).toLocaleString() : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

function CodeSnippetCard({
  title,
  snippet,
  codeLang,
  setCodeLang,
  onCopy,
  copied,
}: {
  title: string;
  snippet: string;
  codeLang: "curl" | "fetch" | "python";
  setCodeLang: (l: any) => void;
  onCopy: (t: string) => void;
  copied: boolean;
}) {
  return (
    <div style={{ borderRadius: 16, background: "#0f172a", color: "#ffffff", padding: 20, border: "1px solid #1e293b" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#38bdf8", display: "flex", alignItems: "center", gap: 8 }}>
          <Terminal size={16} /> {title}
        </h4>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {(["fetch", "python", "curl"] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setCodeLang(lang)}
              style={{
                padding: "3px 8px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                border: "none",
                background: codeLang === lang ? "#6366f1" : "rgba(255,255,255,0.1)",
                color: "#ffffff",
                cursor: "pointer",
              }}
            >
              {lang.toUpperCase()}
            </button>
          ))}

          <button
            onClick={() => onCopy(snippet)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              background: copied ? "#10b981" : "rgba(255,255,255,0.15)",
              color: "#ffffff",
              border: "none",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied!" : "Copy Code"}
          </button>
        </div>
      </div>

      <pre style={{ margin: 0, fontFamily: "monospace", fontSize: 12, color: "#e2e8f0", overflowX: "auto", lineHeight: 1.5 }}>
        {snippet}
      </pre>
    </div>
  );
}
