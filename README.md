# Sentinel Facial Recognition & Visitor Management System

A high-performance real-time facial recognition, visitor tracking, and surveillance management suite powered by Python Flask (InsightFace + YOLOv8) and Next.js.

---

## 1. Presence Derivation Architecture

### Overview
In Sentinel AI, **presence is a dynamically derived state** computed on-the-fly from the immutable `face_logs` event stream.

> [!NOTE]
> Presence is **never stored as a mutable state table or boolean column**. Instead, active presence is calculated at query time by finding the most recent detection event per `person_id` within a trailing time window $N$ (default: 10 minutes).

### Why Dynamic Presence Derivation?
1. **Eliminates State Sync Anomalies**: Avoids dangling "Present" flags if a person exits without a camera detecting their departure.
2. **Stateless & Resilient**: Server restarts or crashes never corrupt presence records; presence calculation relies solely on immutable detection event timestamps.
3. **Flexible Time Windows**: Admins can query `GET /api/presence?minutes=15` or `GET /api/presence?minutes=60` to adjust physical presence thresholds dynamically.

---

## 2. Detection Logging & Cooldown Rules

- **Universal Detection Logging**: Every face detected by camera workers (both matched enrolled individuals AND unmatched/unknown faces) writes a record to `face_logs`.
- **60-Second Cooldown**: To prevent continuous camera frames from flooding the database, an in-memory thread-safe cooldown prevents duplicate logs for the same `(camera_id, person_id/person_name)` key within a 60-second window.
- **Unmatched Faces**: Unrecognized faces are logged with `person_id = NULL` and `person_name = "Unknown"`.

---

## 3. Database Schema & Migration

Run `Backend/migration_cameras_presence.sql` in your Supabase SQL Editor to provision:
- `cameras` table (`id`, `name`, `rtsp_url`, `location`, `zone`, `status`, `last_seen_at`, `created_at`).
- `face_logs` table updates (`camera_id` FK to `cameras`, `person_id` FK to `known_faces`).

---

## 4. Next.js API Endpoints

- `GET /api/presence?minutes=10` — List currently present individuals derived from recent `face_logs`.
- `GET /api/presence/history?person_id=X&page=1&limit=20` — Full visit history for one person, paginated.
- `GET /api/cameras/[id]/activity` — Camera health metrics, detection count, and last-seen timestamp.
- `GET /api/logs/unknown?date=today` — List of unmatched/unknown face detections for a specific date.
