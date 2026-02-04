
import os
import json
import requests
from datetime import datetime

# Config
SUPABASE_URL = "https://wdgceirfninfozukoqet.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkZ2NlaXJmbmluZm96dWtvcWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwODMyMzEsImV4cCI6MjA4NTY1OTIzMX0.xIGQqWk1D0417EZqAHU36zk8DnAbY6BmyCO8lAtA0qw"
CONVERSATION_ID = "e0c15836-d41d-4f95-a92e-70bd19647943"

def fetch_messages():
    url = f"{SUPABASE_URL}/rest/v1/messages?conversation_id=eq.{CONVERSATION_ID}&select=*"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        messages = response.json()
        
        print(f"Found {len(messages)} messages for conversation {CONVERSATION_ID}")
        print(json.dumps(messages, indent=2))
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fetch_messages()
