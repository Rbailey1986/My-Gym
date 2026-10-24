# One-off: McCance & Widdowson CoFID 2021 workbook (Open Government Licence v3.0) -> cofid.csv.
# Usage: python export-cofid.py <workbook.xlsx>   (needs openpyxl; the app build itself needs no Python)
import csv, sys, openpyxl

def num(v):
    if v is None: return ''
    if isinstance(v, (int, float)): return str(v)
    v = str(v).strip().strip('[]()')
    if v in ('Tr', 'tr'): return '0'
    try: float(v); return v
    except ValueError: return ''  # N / empty: not analysed

wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
prox = {r[0]: r for r in wb['1.3 Proximates'].iter_rows(min_row=4, values_only=True) if r[0]}
inorg = {r[0]: r for r in wb['1.4 Inorganics'].iter_rows(min_row=4, values_only=True) if r[0]}
with open('cofid.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['code', 'name', 'group', 'kcal', 'protein', 'fat', 'satfat', 'carbs', 'sugars', 'fibre', 'sodium'])
    for code, r in prox.items():
        w.writerow([code, r[1], r[3], num(r[12]), num(r[9]), num(r[10]), num(r[27]), num(r[11]), num(r[16]), num(r[25]), num(inorg.get(code, [None] * 8)[7])])
print(len(prox), 'foods')
