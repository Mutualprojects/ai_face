"use client";

import { useEffect, useState } from "react";
import {
  Video,
  Plus,
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle,
  X,
  MapPin,
  Map,
  Link as LinkIcon
} from "lucide-react";

interface Camera {
  id: string;
  name: string;
  rtsp_url: string | null;
  location: string | null;
  zone: string | null;
  status: string;
  last_seen_at?: string;
  created_at?: string;
}

const fieldClass = "input-dark w-full px-4 py-2.5 text-[14px]";
const labelClass = "block text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 mb-2";

function Stat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center leading-tight">
      <span className={`text-[20px] font-bold ${highlight ? "text-[#6366f1]" : "text-slate-800"}`}>
        {value}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 mt-0.5">
        {label}
      </span>
    </div>
  );
}

export default function CamerasPage() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [showDrawer, setShowDrawer] = useState(false);
  const [editCamId, setEditCamId] = useState<string | null>(null);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [rtspUrl, setRtspUrl] = useState("");
  const [location, setLocation] = useState("");
  const [zone, setZone] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const fetchCameras = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cameras");
      if (!res.ok) throw new Error("Failed to load cameras.");
      const data = await res.json();
      setCameras(data);
      setError("");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error retrieving camera list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCameras();
  }, []);

  const openCreateDrawer = () => {
    setEditCamId(null);
    setId("");
    setName("");
    setRtspUrl("");
    setLocation("");
    setZone("");
    setIsActive(true);
    setFormError("");
    setFormSuccess("");
    setShowDrawer(true);
  };

  const openEditDrawer = (cam: Camera) => {
    setEditCamId(cam.id);
    setId(cam.id);
    setName(cam.name);
    setRtspUrl(cam.rtsp_url || "");
    setLocation(cam.location || "");
    setZone(cam.zone || "");
    setIsActive(cam.status === "active");
    setFormError("");
    setFormSuccess("");
    setShowDrawer(true);
  };

  const handleToggleStatus = async (cam: Camera) => {
    try {
      const newStatus = cam.status === "active" ? "inactive" : "active";
      const res = await fetch(`/api/cameras/${cam.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status.");
      setCameras((prev) =>
        prev.map((c) => (c.id === cam.id ? { ...c, status: newStatus } : c))
      );
    } catch (err: any) {
      alert(err.message || "Status update failed.");
    }
  };

  const handleDelete = async (deleteId: string, camName: string) => {
    if (!confirm(`Are you sure you want to delete camera "${camName}"?`)) return;
    try {
      const res = await fetch(`/api/cameras/${deleteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete camera.");
      setCameras((prev) => prev.filter((c) => c.id !== deleteId));
    } catch (err: any) {
      alert(err.message || "Delete failed.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !name.trim()) {
      setFormError("Camera ID and Name are required.");
      return;
    }

    setSubmitting(true);
    setFormError("");
    setFormSuccess("");

    try {
      const isEdit = Boolean(editCamId);
      const url = isEdit ? `/api/cameras/${editCamId}` : "/api/cameras";
      const method = isEdit ? "PATCH" : "POST";

      const payload = {
        id: id.trim(),
        name: name.trim(),
        rtsp_url: rtspUrl.trim() || null,
        location: location.trim() || null,
        zone: zone.trim() || null,
        status: isActive ? "active" : "inactive",
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Operation failed.");

      setFormSuccess(`Camera "${name}" successfully ${isEdit ? "updated" : "created"}!`);
      fetchCameras();

      setTimeout(() => {
        setShowDrawer(false);
      }, 1200);
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || "Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCameras = cameras.filter((c) => {
    const query = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(query) ||
      c.id.toLowerCase().includes(query) ||
      (c.location && c.location.toLowerCase().includes(query)) ||
      (c.zone && c.zone.toLowerCase().includes(query))
    );
  });

  const activeCamerasCount = cameras.filter((c) => c.status === "active").length;

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 py-8 pb-16 animate-fadeinup">
      {/* Header / Hero */}
      <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-[#6366f1] mb-2.5">
            <Video size={16} strokeWidth={2.5} />
            Hardware & Surveillance
          </div>
          <h1 className="text-[32px] leading-none font-extrabold tracking-tight text-slate-900">
            Camera Management
          </h1>
          <p className="text-[14px] mt-3 text-slate-500 font-medium">
            Configure video feeds, locations, and stream statuses for your facial recognition system.
          </p>
        </div>

        <div className="glass flex items-center gap-6 rounded-2xl px-7 py-4">
          <Stat label="Total Cameras" value={cameras.length} />
          <div className="h-10 w-px bg-slate-200" />
          <Stat label="Active Streams" value={activeCamerasCount} highlight />
        </div>
      </div>

      {/* Toolbar */}
      <div className="glass rounded-2xl p-4 flex flex-wrap gap-4 items-center mb-8">
        <button onClick={openCreateDrawer} className="btn-primary btn-glow px-6 py-2.5 text-[14px]">
          <Plus size={18} strokeWidth={2.5} />
          Add Camera
        </button>

        {/* Search */}
        <div className="relative flex-1 min-w-[280px]">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by ID, name, or location…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-dark w-full pl-11 py-2.5 text-[14px]"
          />
        </div>

        {/* Refresh */}
        <button
          onClick={fetchCameras}
          title="Reload camera list"
          className="btn-secondary w-11 h-11 !p-0"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Camera Cards Grid */}
      {loading ? (
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="card-elevated h-[240px] skeleton" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-4 py-16 px-6 rounded-2xl bg-white border border-red-100 text-red-500 shadow-sm">
          <AlertTriangle size={36} />
          <div className="text-[15px] font-semibold text-center">{error}</div>
          <button onClick={fetchCameras} className="btn-secondary !text-red-500 !border-red-200 mt-2">
            Retry Fetch
          </button>
        </div>
      ) : filteredCameras.length === 0 ? (
        <div className="text-center py-24 px-6 glass rounded-2xl text-slate-500">
          <Video size={48} className="mx-auto mb-5 opacity-30" />
          <h3 className="text-[18px] font-bold mb-2 text-slate-800">
            No Cameras Found
          </h3>
          <p className="text-[14.5px] font-medium">
            {searchQuery
              ? "No cameras match your search term. Try another keyword."
              : "Click 'Add Camera' to configure your first surveillance feed."}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {filteredCameras.map((cam) => (
            <div
              key={cam.id}
              className="card-elevated overflow-hidden flex flex-col relative transition-all duration-200 hover:-translate-y-1 hover:shadow-xl group"
            >
              {/* Status accent strip */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1.5 transition-colors"
                style={{ background: cam.status === "active" ? "var(--violet)" : "#cbd5e1" }}
              />

              {/* Status Badge */}
              <button
                onClick={() => handleToggleStatus(cam)}
                title="Click to toggle status"
                className="absolute top-5 right-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all"
                style={{
                  background: cam.status === "active" ? "var(--violet-soft)" : "#f1f5f9",
                  color: cam.status === "active" ? "var(--violet)" : "#64748b",
                  border: cam.status === "active" ? "1px solid var(--violet-glow)" : "1px solid #e2e8f0",
                }}
              >
                {cam.status === "active" ? (
                  <><span className="dot-live !w-1.5 !h-1.5" /> Active</>
                ) : (
                  "Inactive"
                )}
              </button>

              {/* Card Header */}
              <div className="p-6 pl-7 flex items-start gap-4 border-b border-slate-100 bg-slate-50/50">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-white shadow-sm border border-slate-200 text-[#6366f1] flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Video size={22} strokeWidth={2.5} />
                </div>
                <div className="min-w-0 flex-1 pr-16 mt-0.5">
                  <h3 className="text-[17px] font-bold truncate text-slate-800">
                    {cam.name}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-1.5 font-mono text-[11px] text-slate-500">
                    <span className="font-semibold uppercase tracking-wider text-slate-400">ID:</span>
                    <span className="truncate">{cam.id}</span>
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6 pl-7 flex-1 flex flex-col gap-4.5 bg-white">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-400 uppercase tracking-wide">
                      <MapPin size={13} className="text-[#6366f1]" /> Location
                    </div>
                    <div className="text-[14px] font-medium text-slate-700 truncate">
                      {cam.location || "Not specified"}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-400 uppercase tracking-wide">
                      <Map size={13} className="text-[#6366f1]" /> Zone
                    </div>
                    <div className="text-[14px] font-medium text-slate-700 truncate">
                      {cam.zone || "Not assigned"}
                    </div>
                  </div>
                </div>
                
                {cam.rtsp_url && (
                  <div className="flex flex-col gap-1 mt-1">
                    <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-400 uppercase tracking-wide">
                      <LinkIcon size={13} className="text-[#6366f1]" /> Stream URL
                    </div>
                    <div className="font-mono text-[12px] text-slate-500 truncate bg-slate-50 border border-slate-100 rounded-md px-2.5 py-1.5 mt-0.5" title={cam.rtsp_url}>
                      {cam.rtsp_url}
                    </div>
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="px-6 pl-7 py-3.5 flex justify-between items-center border-t border-slate-100 bg-slate-50/50">
                <div className="text-[11.5px] font-semibold text-slate-400">
                  Added: {cam.created_at ? new Date(cam.created_at).toLocaleDateString() : "Unknown"}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openEditDrawer(cam)}
                    title="Edit Camera"
                    className="p-2 rounded-lg transition-colors hover:bg-white hover:shadow-sm text-[#6366f1] border border-transparent hover:border-slate-200"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(cam.id, cam.name)}
                    title="Delete Camera"
                    className="p-2 rounded-lg transition-colors hover:bg-white hover:shadow-sm text-red-500 border border-transparent hover:border-red-100"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Drawer */}
      {showDrawer && (
        <>
          <div
            className="fixed inset-0 z-[99] bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => setShowDrawer(false)}
          />
          <div className="fixed top-0 right-0 bottom-0 w-full sm:w-[480px] bg-white z-[100] flex flex-col shadow-2xl animate-slideInRight">
            <div className="px-7 py-6 flex justify-between items-center border-b border-slate-100 bg-slate-50/50">
              <div>
                <h2 className="text-[20px] font-bold text-slate-800 mb-1">
                  {editCamId ? "Edit Camera" : "Configure New Camera"}
                </h2>
                <p className="text-[13px] text-slate-500 font-medium">
                  {editCamId ? "Update hardware and stream details." : "Add a new video feed to the system."}
                </p>
              </div>
              <button
                onClick={() => setShowDrawer(false)}
                className="btn-secondary !w-9 !h-9 !p-0 !rounded-full"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-7 py-7">
              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <div>
                  <label className={labelClass}>Camera ID (Key) *</label>
                  <input
                    type="text"
                    required
                    disabled={!!editCamId}
                    placeholder="e.g. camera_entrance"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    className={`${fieldClass} font-mono ${editCamId ? "opacity-60 cursor-not-allowed bg-slate-100" : ""}`}
                  />
                  {!editCamId && <span className="text-[11px] text-slate-400 mt-1.5 block font-medium">Must match the backend camera config identifier.</span>}
                </div>

                <div>
                  <label className={labelClass}>Display Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Main Entrance Feed"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>RTSP URL</label>
                  <input
                    type="text"
                    placeholder="rtsp://user:pass@192.168.1.100:554/stream1"
                    value={rtspUrl}
                    onChange={(e) => setRtspUrl(e.target.value)}
                    className={`${fieldClass} font-mono`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className={labelClass}>Location</label>
                    <input
                      type="text"
                      placeholder="e.g. Lobby Ceiling"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Zone</label>
                    <input
                      type="text"
                      placeholder="e.g. Entry, Exit"
                      value={zone}
                      onChange={(e) => setZone(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                </div>

                <label
                  htmlFor="isActiveCamToggle"
                  className="flex items-center gap-3 mt-2 rounded-xl px-4 py-3.5 cursor-pointer transition-colors border border-slate-200 bg-slate-50 hover:bg-slate-100"
                >
                  <input
                    type="checkbox"
                    id="isActiveCamToggle"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 cursor-pointer accent-[#6366f1]"
                  />
                  <span className="text-[14px] font-semibold text-slate-700">
                    Set stream as active
                  </span>
                </label>

                {formError && (
                  <div className="flex gap-3 rounded-xl p-3.5 text-[13.5px] font-semibold items-center bg-red-50 border border-red-200 text-red-600">
                    <AlertTriangle size={18} className="flex-shrink-0" />
                    <div>{formError}</div>
                  </div>
                )}

                {formSuccess && (
                  <div className="flex gap-3 rounded-xl p-3.5 text-[13.5px] font-semibold items-center bg-emerald-50 border border-emerald-200 text-emerald-600">
                    <CheckCircle size={18} className="flex-shrink-0" />
                    <div>{formSuccess}</div>
                  </div>
                )}

                <div className="flex gap-4 mt-4 pt-6 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowDrawer(false)}
                    className="btn-secondary flex-1 py-3 text-[14px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !name.trim() || !id.trim()}
                    className="btn-primary btn-glow flex-[2] py-3 text-[14px]"
                  >
                    {submitting ? "Saving…" : editCamId ? "Save Changes" : "Configure Camera"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
