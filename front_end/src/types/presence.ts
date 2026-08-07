/**
 * TypeScript type definitions for Presence, Camera Management, and Face Logging.
 */

export interface Camera {
  id: string;
  name: string;
  rtsp_url?: string | null;
  location?: string | null;
  zone?: string | null;
  status: "active" | "inactive" | "maintenance";
  last_seen_at?: string | null;
  created_at?: string | null;
}

export interface FaceLog {
  id: string;
  person_id?: string | null;
  person_name: string;
  camera_id?: string | null;
  confidence: number;
  snapshot_url?: string | null;
  created_at?: string | null;
  timestamp?: string | null;
  cameras?: Camera | null;
}

export interface PresenceRecord {
  person_id: string;
  person_name: string;
  employee_code?: string | null;
  department?: string | null;
  designation?: string | null;
  photo_url?: string | null;
  last_seen_at: string;
  camera_id?: string | null;
  camera_name?: string | null;
  confidence: number;
  snapshot_url?: string | null;
}

export interface PresenceHistoryItem {
  id: string;
  person_id: string;
  person_name: string;
  camera_id?: string | null;
  camera_name?: string | null;
  confidence: number;
  snapshot_url?: string | null;
  created_at: string;
}

export interface CameraActivity {
  camera_id: string;
  camera_name?: string | null;
  location?: string | null;
  zone?: string | null;
  status: string;
  last_seen_at?: string | null;
  total_detections_today: number;
  total_known_detections: number;
  total_unknown_detections: number;
}
