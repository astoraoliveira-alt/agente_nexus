import pypdf
import sys

def extract_text(pdf_path, txt_path):
    try:
        print(f"Extracting {pdf_path} to {txt_path}...")
        reader = pypdf.PdfReader(pdf_path)
        text = ""
        for i, page in enumerate(reader.pages):
            text += f"\n--- PAGE {i+1} ---\n"
            text += page.extract_text() or ""
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"Success! Extracted {len(reader.pages)} pages.")
    except Exception as e:
        print(f"Error extracting {pdf_path}: {e}")

extract_text("/Users/user/SaaS - Davos Nexus/agent-nexus-hub/database/json n8n/Clover Capital - Partners.pdf", "/Users/user/SaaS - Davos Nexus/agent-nexus-hub/scratch/clover_capital_partners.txt")
extract_text("/Users/user/SaaS - Davos Nexus/agent-nexus-hub/database/json n8n/Edenred - Agente Comercial - Alinhamento Fiserv sessão 2.pdf", "/Users/user/SaaS - Davos Nexus/agent-nexus-hub/scratch/edenred_alinhamento_sessao2.txt")
print("All done!")
