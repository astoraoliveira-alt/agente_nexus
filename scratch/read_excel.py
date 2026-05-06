import pandas as pd

file_path = r'c:\Users\User\OneDrive - Davos\Davos\Codigo Fonte\Davos Nexus\agente_nexus\docs\Base de teste270426_100.xlsx'
try:
    df = pd.read_excel(file_path)
    print("Columns:", df.columns.tolist())
    print("\nFirst 5 rows:")
    print(df.head())
except Exception as e:
    print(f"Error reading file: {e}")
