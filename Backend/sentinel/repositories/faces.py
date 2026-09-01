"""Repository: known_faces / visitors (enrollment data)."""

from . import db
from .logging_setup import get_logger

log = get_logger("sentinel.repos.faces")


def fetch_known_faces():
    """Only ACTIVE employees are recognized; inactive are excluded from the
    matching cache. Falls back to all faces if is_active is missing."""
    client = db.get_client()
    if client is None:
        return []
    select_cols = "id, name, employee_code, department, designation, email, embedding, photo_url"
    try:
        try:
            res = client.table("known_faces").select(select_cols).eq("is_active", True).execute()
        except Exception:
            log.warning("known_faces is_active filter failed, falling back to all faces")
            res = client.table("known_faces").select(select_cols).execute()
        return res.data or []
    except Exception as e:
        log.error("Error fetching known faces: %s", e)
        return []


def fetch_visitors():
    """Only ACTIVE visitors are recognized; falls back to all visitors when
    the is_active column does not exist yet (migration not applied)."""
    client = db.get_client()
    if client is None:
        return []
    select_cols = "visitor_id, full_name, photo_image, embedding"
    try:
        try:
            res = client.table("visitors").select(select_cols).eq("is_active", True).execute()
        except Exception:
            log.warning("is_active filter failed (column missing?), falling back to all visitors")
            res = client.table("visitors").select(select_cols).execute()
        visitors_list = []
        for r in (res.data or []):
            if r.get("embedding"):
                visitors_list.append({
                    "id": r["visitor_id"],
                    "name": f"Visitor: {r['full_name']}",
                    "employee_code": None,
                    "department": "Visitor",
                    "designation": "Visitor",
                    "photo_url": r["photo_image"],
                    "embedding": r["embedding"],
                    "is_visitor": True
                })
        return visitors_list
    except Exception as e:
        log.error("Error fetching visitors from DB: %s", e)
        return []


def fetch_registered_faces():
    client = db.get_client()
    if client is None:
        return []
    try:
        res = client.table("known_faces").select(
            "id, name, employee_code, department, designation, email, mobile, photo_url, created_at"
        ).order("name").execute()
        return res.data or []
    except Exception as e:
        log.error("Error fetching registered faces: %s", e)
        return []


def find_by_employee_code(employee_code):
    client = db.get_client()
    if client is None:
        return []
    try:
        res = client.table("known_faces").select(
            "id, name, employee_code, department, designation, email, mobile, photo_url, created_at"
        ).eq("employee_code", employee_code).execute()
        return res.data or []
    except Exception as e:
        log.error("Error fetching employee '%s': %s", employee_code, e)
        return []


def find_ids_by_employee_code(employee_code):
    client = db.get_client()
    if client is None:
        return []
    try:
        res = client.table("known_faces").select("id").eq("employee_code", employee_code).execute()
        return res.data or []
    except Exception as e:
        log.error("Error looking up employee '%s': %s", employee_code, e)
        return []


def find_ids_by_name(name):
    client = db.get_client()
    if client is None:
        return []
    try:
        res = client.table("known_faces").select("id").eq("name", name).execute()
        return res.data or []
    except Exception as e:
        log.error("Error looking up employee by name: %s", e)
        return []


def upsert(payload: dict, by_employee_code: str = None, by_name: str = None):
    """Insert or update a known face. Tries employee_code, then name, then
    inserts — identical resolution order to the original register route."""
    client = db.get_client()
    if client is None:
        return None
    if by_employee_code:
        return client.table("known_faces").update(payload).eq("employee_code", by_employee_code).execute()
    if by_name:
        return client.table("known_faces").update(payload).eq("name", by_name).execute()
    return client.table("known_faces").insert(payload).execute()


def update_by_employee_code(employee_code: str, payload: dict):
    client = db.get_client()
    if client is None:
        return None
    return client.table("known_faces").update(payload).eq("employee_code", employee_code).execute()


def delete_by_id(face_id: str):
    client = db.get_client()
    if client is None:
        return None
    return client.table("known_faces").delete().eq("id", face_id).execute()


def delete_by_employee_code(employee_code: str):
    client = db.get_client()
    if client is None:
        return None
    return client.table("known_faces").delete().eq("employee_code", employee_code).execute()


def fetch_sample_embeddings(limit=10):
    client = db.get_client()
    if client is None:
        return []
    try:
        res = client.table("known_faces").select("id, name, embedding, photo_url").limit(limit).execute()
        return res.data or []
    except Exception as e:
        log.error("Error sampling known faces: %s", e)
        return []


def fetch_all_ids():
    client = db.get_client()
    if client is None:
        return []
    try:
        res = client.table("known_faces").select("id, name, photo_url").execute()
        return res.data or []
    except Exception as e:
        log.error("Error fetching all known faces: %s", e)
        return []


def update_embedding(face_id: str, embedding: list):
    client = db.get_client()
    if client is None:
        return
    try:
        client.table("known_faces").update({"embedding": embedding}).eq("id", face_id).execute()
    except Exception as e:
        log.error("Error updating embedding for '%s': %s", face_id, e)


def fetch_all_visitors():
    client = db.get_client()
    if client is None:
        return []
    try:
        res = client.table("visitors").select("visitor_id, full_name, photo_image").execute()
        return res.data or []
    except Exception as e:
        log.error("Error fetching all visitors: %s", e)
        return []


def update_visitor_embedding(visitor_id: str, embedding: list):
    client = db.get_client()
    if client is None:
        return
    try:
        client.table("visitors").update({"embedding": embedding}).eq("visitor_id", visitor_id).execute()
    except Exception as e:
        log.error("Error updating visitor embedding for '%s': %s", visitor_id, e)
