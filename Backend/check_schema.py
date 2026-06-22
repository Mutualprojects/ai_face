import os
from supabase import create_client
from dotenv import load_dotenv
load_dotenv()
supa = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
res = supa.table("face_logs").select("*").limit(1).execute()
if res.data:
    print(res.data[0].keys())
else:
    print("No data, try insert to test embedding column...")
    try:
        supa.table("face_logs").insert({"person_name": "Test", "confidence": 0, "embedding": [0.1, 0.2]}).execute()
        print("Success, embedding column exists!")
    except Exception as e:
        print(e)
