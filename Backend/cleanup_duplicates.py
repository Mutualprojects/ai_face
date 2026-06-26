import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv(".env")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

sb = create_client(SUPABASE_URL, SUPABASE_KEY)
res = sb.table("known_faces").select("*").execute()
faces = res.data or []

seen = {}
for f in faces:
    name = f["name"]
    if name not in seen:
        seen[name] = []
    seen[name].append(f)

for name, recs in seen.items():
    if len(recs) > 1:
        # Sort by created_at descending
        recs.sort(key=lambda x: x.get("created_at", x.get("id")), reverse=True)
        keep = recs[0]
        delete_ids = [r["id"] for r in recs[1:]]
        print(f"Keeping latest '{name}', deleting {len(delete_ids)} duplicates...")
        for did in delete_ids:
            sb.table("known_faces").delete().eq("id", did).execute()

print("Cleanup complete!")
