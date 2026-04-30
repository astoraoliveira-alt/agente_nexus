import re

path = "database/json n8n/Agente Nexus - Whatts Fila (14).json"
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

# Try to find the corrupted JS Code line and fix it or just replace the whole file with a clean string replace
