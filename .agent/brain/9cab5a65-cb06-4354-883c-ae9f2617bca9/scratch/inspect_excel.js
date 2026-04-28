import * as XLSX from 'xlsx';
import * as fs from 'fs';

function inspectExcel() {
    const filePath = 'docs/Base de teste270426_100.xlsx';
    if (!fs.existsSync(filePath)) {
        console.error(`Arquivo nao encontrado: ${filePath}`);
        return;
    }
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Ler como array de arrays para ver a estrutura bruta
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    console.log(`--- Inspecionando Arquivo: ${filePath} ---`);
    console.log(`Total de linhas: ${data.length}`);
    
    console.log("\nPrimeiras 10 linhas (Estrutura Bruta):");
    data.slice(0, 10).forEach((row, i) => {
        console.log(`Row ${i}:`, row);
    });
    
    console.log("\nAnálise da Coluna B (Índice 1):");
    data.slice(0, 20).forEach((row, i) => {
        const val = row[1];
        const clean = String(val ?? '').replace(/\D/g, '');
        console.log(`Row ${i} | Valor Original: "${val}" | Apenas Dígitos: "${clean}" | Tamanho: ${clean.length}`);
    });
}

inspectExcel();
