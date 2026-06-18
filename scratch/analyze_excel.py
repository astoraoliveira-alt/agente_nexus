import pandas as pd
import collections

df = pd.read_excel('docs/exportacao_disparo_10_jun (1).xlsx')
print(df.columns)
print("\nComportamento counts:")
print(df['Comportamento'].value_counts() if 'Comportamento' in df.columns else 'No Comportamento col')
print("\nÚltimo Status counts:")
print(df['Último Status'].value_counts() if 'Último Status' in df.columns else 'No Último Status col')
