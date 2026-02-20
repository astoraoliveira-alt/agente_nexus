#!/bin/bash

# Load variables from .env.local
API_KEY=$(grep VITE_OPENAI_API_KEY .env.local | cut -d '=' -f2)
ORG_ID=$(grep OPENAI_ORG_ID .env.local | cut -d '=' -f2)
PROJECT_ID=$(grep OPENAI_PROJECT_ID .env.local | cut -d '=' -f2)

if [ -z "$API_KEY" ]; then
    echo "❌ Error: VITE_OPENAI_API_KEY not found in .env.local"
    exit 1
fi

# Clean potentially hidden characters from grep
API_KEY=$(echo "$API_KEY" | tr -d '\r\n ')

echo "--- OpenAI Key Diagnostic (Shell v2) ---"
echo "Key Length: ${#API_KEY}"
echo "Key Prefix: ${API_KEY:0:15}..."
echo "Key Suffix: ...${API_KEY: -4}"

if [ ! -z "$ORG_ID" ]; then echo "Org ID found: $ORG_ID"; fi
if [ ! -z "$PROJECT_ID" ]; then echo "Project ID found: $PROJECT_ID"; fi

echo -e "\n1. Testing Standard Chat Completions API..."

HEADERS=(-H "Content-Type: application/json" -H "Authorization: Bearer $API_KEY")
if [ ! -z "$ORG_ID" ]; then HEADERS+=(-H "OpenAI-Organization: $ORG_ID"); fi
if [ ! -z "$PROJECT_ID" ]; then HEADERS+=(-H "OpenAI-Project: $PROJECT_ID"); fi

curl -s -X POST "https://api.openai.com/v1/chat/completions" \
  "${HEADERS[@]}" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Say hello"}],
    "max_tokens": 5
  }' | python3 -m json.tool

echo -e "\n2. Testing with gpt-3.5-turbo (Fallback check)..."

curl -s -X POST "https://api.openai.com/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Say hello"}],
    "max_tokens": 5
  }' | python3 -m json.tool

echo -e "\n--- End of Diagnostic ---"
echo "If you see a 'choices' block in either test, the key is VALID."
echo "If you see 'Incorrect API key', the key in .env.local is INVALID, REVOKED, or missing a Project/Org match."
