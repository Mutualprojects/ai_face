export type StreamMode = "webrtc" | "hls";
export type PlayState = "connecting" | "playing" | "error" | "offline";

export interface Detection {
  matched: boolean;
  confirmed?: boolean;      // true = presence confirmed (≥2 frames); false/undefined = tentative match
  name: string;
  id?: string | null;
  confidence: number;
  photo_url?: string | null;
  bbox: [number, number, number, number];
  crop_b64?: string | null;
  det_score?: number;
  landmarks?: [number, number][];
  top3?: { name: string; score: number; photo_url?: string | null }[];
}

export interface MatchResponse {
  detections: Detection[];
  bodies?: [number, number, number, number, number][];
  matched: boolean;
  message?: string;
}

export interface RegisteredFace {
  id: string;
  name: string;
  photo_url?: string;
  created_at?: string;
}

export interface FaceLog {
  id: string;
  person_name: string;
  confidence: number;
  snapshot_url?: string;
  created_at?: string;
  timestamp?: string;
}
