import pypdf
import sys

def extract_text(pdf_path, txt_path):
    print(f"Extracting {pdf_path} to {txt_path}...")
    reader = pypdf.PdfReader(pdf_path)
    text = ""
    for i, page in enumerate(reader.pages):
        text += f"\n--- PAGE {i+1} ---\n"
        text += page.extract_text()
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(text)

extract_text("edenred/Edenred - POC Agente Comercial - Pre KO.pdf", "scratch/pre_ko.txt")
extract_text("edenred/Edenred - POC Agente Comercial - Liberação para Testes.pdf", "scratch/liberacao_testes.txt")
print("Done!")
