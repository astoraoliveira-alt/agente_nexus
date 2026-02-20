import * as pdfjsLib from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

// Use Vite's explicit ?worker import to force local instantiation, bypassing all CDNs
pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

export async function extractTextFromFile(file: File): Promise<string> {
    const fileType = file.type;
    const fileName = file.name.toLowerCase();

    try {
        if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
            return await extractTextFromPDF(file);
        } else if (
            fileType === 'application/msword' ||
            fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            fileName.endsWith('.doc') ||
            fileName.endsWith('.docx')
        ) {
            return await extractTextFromWord(file);
        } else if (
            fileType === 'application/vnd.ms-excel' ||
            fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            fileName.endsWith('.xls') ||
            fileName.endsWith('.xlsx')
        ) {
            return await extractTextFromExcel(file);
        } else {
            // Fallback for TXT, JSON, CSV
            return await file.text();
        }
    } catch (error) {
        console.error('Error parsing file:', error);
        throw new Error(`Failed to parse ${fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function extractTextFromPDF(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n\n';
    }

    return fullText.trim();
}

async function extractTextFromWord(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim();
}

async function extractTextFromExcel(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    let fullText = '';

    workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        // Convert sheet to a CSV-like text format which is highly readable by LLMs
        const sheetText = XLSX.utils.sheet_to_csv(sheet);
        if (sheetText.trim()) {
            fullText += `[Sheet: ${sheetName}]\n${sheetText}\n\n`;
        }
    });

    return fullText.trim();
}
