import os
from supabase import create_client, Client

SUPABASE_URL = "http://localhost:8000"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE"

def test_connection():
    print(f"Connecting to Supabase at {SUPABASE_URL}...")
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("Client initialized successfully.")
        
        # Print available attributes to see client interface
        print("Available methods on client:", [attr for attr in dir(supabase) if not attr.startswith('_')])
        
        # Try a simple select query to a dummy table to test the actual endpoint/API key
        try:
            print("Trying to query database schema...")
            # This will query a dummy table. If the connection fails, it throws a network error.
            # If the database connection works, it might return empty or error saying table doesn't exist.
            res = supabase.table("_dummy_table_test_").select("*").limit(1).execute()
            print("Query executed. Response:", res)
        except Exception as query_err:
            # Check if this is a standard Postgrest/API error or network error
            err_msg = str(query_err)
            if "relation \"_dummy_table_test_\" does not exist" in err_msg or "404" in err_msg or "PGRST" in err_msg:
                print("Database connection verified! (Endpoint resolved and database answered that the dummy table does not exist).")
            else:
                raise query_err
            
        print("\nConnection Success: Yes!")
        return True
    except Exception as e:
        print(f"\nConnection Success: No!")
        print(f"Error details: {e}")
        return False

if __name__ == "__main__":
    test_connection()
