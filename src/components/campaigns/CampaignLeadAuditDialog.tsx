import React, { useState, useRef, useMemo } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import {
    FileUp,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Search,
    Download,
    Loader2,
    Users,
    Trash2,
    ArrowRight,
    ShieldAlert,
    RefreshCw
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Campaign, AuditedLeadItem, AuditedLeadCategory } from '@/lib/types';
import { campaignsService } from '@/services/campaigns.service';

interface CampaignLeadAuditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    campaigns: Campaign[];
    selectedCampaignId: string | null;
    onSelectCampaign: (campaignId: string) => void;
    tenantId: string;
    onConfirmDispatch: (
        selectedLeads: AuditedLeadItem[],
        allAuditedLeads: AuditedLeadItem[],
        fileName: string,
        campaignId: string
    ) => Promise<void>;
    isImporting: boolean;
}

const isValidCNPJ = (cnpj: string): boolean => {
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(clean)) return false;

    let size = clean.length - 2;
    let numbers = clean.substring(0, size);
    const digits = clean.substring(size);
    let sum = 0;
    let pos = size - 7;

    for (let i = size; i >= 1; i--) {
        sum += Number(numbers.charAt(size - i)) * pos--;
        if (pos < 2) pos = 9;
    }

    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== Number(digits.charAt(0))) return false;

    size = size + 1;
    numbers = clean.substring(0, size);
    sum = 0;
    pos = size - 7;

    for (let i = size; i >= 1; i--) {
        sum += Number(numbers.charAt(size - i)) * pos--;
        if (pos < 2) pos = 9;
    }

    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return result === Number(digits.charAt(1));
};

const sanitizeUrlValue = (raw: any): string => {
    if (!raw) return '';
    let url = String(raw).trim();
    if (url.toLowerCase().startsWith('http://') || url.toLowerCase().startsWith('https://')) {
        return url;
    }
    return `https://${url}`;
};

const formatCnpjMask = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 14);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
};

const formatPhoneMask = (val: string) => {
    let clean = val.replace(/\D/g, '');
    if (clean.startsWith('55') && clean.length > 11) {
        clean = clean.slice(2);
    }
    if (clean.length === 11) {
        return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    }
    if (clean.length === 10) {
        return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
    }
    return val;
};

export const CampaignLeadAuditDialog: React.FC<CampaignLeadAuditDialogProps> = ({
    open,
    onOpenChange,
    campaigns,
    selectedCampaignId,
    onSelectCampaign,
    tenantId,
    onConfirmDispatch,
    isImporting
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState<string>('');
    const [isParsing, setIsParsing] = useState<boolean>(false);
    const [isAuditing, setIsAuditing] = useState<boolean>(false);
    const [auditedLeads, setAuditedLeads] = useState<AuditedLeadItem[]>([]);
    const [activeTab, setActiveTab] = useState<AuditedLeadCategory>('valid');
    const [searchTerm, setSearchTerm] = useState<string>('');

    // Reseta estado ao fechar
    const handleClose = (newOpen: boolean) => {
        if (!newOpen && !isImporting) {
            setAuditedLeads([]);
            setFileName('');
            setSearchTerm('');
        }
        onOpenChange(newOpen);
    };

    // Processamento do arquivo após parse
    const processRowsAndAudit = async (rows: any[][], uploadedName: string) => {
        setIsParsing(true);
        try {
            let identifierIdx = 0;
            let phoneIdx = 1;
            let nameIdx = 2;
            let ctaLinkIdx = -1;
            let startRow = 0;

            const normalizeHeader = (value: any) =>
                String(value ?? '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .trim()
                    .toLowerCase();

            let bestHeaderRowIdx = -1;
            let maxMatches = 0;

            for (let i = 0; i < Math.min(rows.length, 15); i++) {
                const row = Array.from(rows[i] || [], normalizeHeader);
                const matchesCount = row.filter(c =>
                    c.includes('cnpj') ||
                    c.includes('cpf') ||
                    c.includes('documento') ||
                    c.includes('whatsapp') ||
                    c.includes('telefone') ||
                    c.includes('phone') ||
                    c.includes('tel') ||
                    c.includes('cel') ||
                    c.includes('razao social') ||
                    c.includes('razao') ||
                    c.includes('nome') ||
                    c.includes('empresa') ||
                    c.includes('estabelecimento') ||
                    c === 'link' ||
                    c.includes('cta') ||
                    c.includes('url')
                ).length;

                if (matchesCount > maxMatches) {
                    maxMatches = matchesCount;
                    bestHeaderRowIdx = i;
                }
            }

            if (bestHeaderRowIdx !== -1 && maxMatches >= 2) {
                const headerRow = Array.from(rows[bestHeaderRowIdx] || [], normalizeHeader);
                const foundId = headerRow.findIndex(c => c.includes('cnpj') || c.includes('cpf') || c.includes('documento') || c.includes('identifier'));
                const foundPhone = headerRow.findIndex(c => c.includes('tel') || c.includes('phone') || c.includes('cel') || c.includes('whatsapp'));
                const foundName = headerRow.findIndex(c => c.includes('razao social') || c.includes('razao') || c.includes('nome') || c.includes('name') || c.includes('empresa') || c.includes('estabelecimento'));
                const foundCta = headerRow.findIndex(c => c === 'link' || c.includes('cta') || c.includes('url'));

                if (foundId !== -1) identifierIdx = foundId;
                if (foundPhone !== -1) phoneIdx = foundPhone;
                if (foundName !== -1) nameIdx = foundName;
                ctaLinkIdx = foundCta;
                startRow = bestHeaderRowIdx + 1;
            }

            const rawProcessed = rows.slice(startRow).map((row, idx) => {
                let identifier = row[identifierIdx] !== undefined ? String(row[identifierIdx]).trim() : '';
                const cleanDigits = identifier.replace(/\D/g, '');
                if (cleanDigits && cleanDigits.length > 0 && cleanDigits.length < 14) {
                    identifier = cleanDigits.padStart(14, '0');
                }
                const phone = row[phoneIdx] !== undefined ? String(row[phoneIdx]).trim() : '';
                const name = row[nameIdx] !== undefined ? String(row[nameIdx]).trim().substring(0, 100) : 'Sem Nome';
                const ctaLink = (ctaLinkIdx !== -1 && row[ctaLinkIdx] !== undefined) ? sanitizeUrlValue(row[ctaLinkIdx]) : '';

                return {
                    name,
                    phone,
                    identifier,
                    ctaLink,
                    rowNumber: startRow + idx + 1,
                    rawData: { identifier, phone, name, ctaLink }
                };
            }).filter(r => r.identifier || r.phone || r.name !== 'Sem Nome');

            if (rawProcessed.length === 0) {
                toast({
                    title: 'Nenhum dado válido encontrado',
                    description: 'Certifique-se de que a planilha possui colunas com CNPJ, Whatsapp e Razão Social.',
                    variant: 'destructive'
                });
                setIsParsing(false);
                return;
            }

            setFileName(uploadedName);
            setIsParsing(false);
            setIsAuditing(true);

            // Executa a auditoria inteligente contra outbound_queue e agent_leads
            const audited = await campaignsService.auditCampaignLeads(tenantId, rawProcessed);
            setAuditedLeads(audited);
            setIsAuditing(false);
        } catch (error: any) {
            console.error('Erro ao auditar arquivo:', error);
            toast({
                title: 'Erro no processamento',
                description: error.message || 'Falha ao processar o arquivo.',
                variant: 'destructive'
            });
            setIsParsing(false);
            setIsAuditing(false);
        }
    };

    // Upload de arquivo
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const extension = file.name.split('.').pop()?.toLowerCase();

        if (extension === 'csv') {
            Papa.parse(file, {
                complete: (results) => {
                    processRowsAndAudit(results.data as any[][], file.name);
                },
                error: (err) => {
                    toast({ title: 'Erro ao ler CSV', description: err.message, variant: 'destructive' });
                }
            });
        } else if (extension === 'xlsx' || extension === 'xls') {
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const rangeData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                    processRowsAndAudit(rangeData, file.name);
                } catch (err: any) {
                    toast({ title: 'Erro ao ler Excel', description: err.message, variant: 'destructive' });
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            toast({ title: 'Formato inválido', description: 'Envie um arquivo CSV, XLS ou XLSX.', variant: 'destructive' });
        }

        // Limpa input para permitir selecionar o mesmo arquivo novamente
        e.target.value = '';
    };

    // Métricas calculadas
    const stats = useMemo(() => {
        const validList = auditedLeads.filter(l => l.category === 'valid');
        const undeliveredList = auditedLeads.filter(l => l.category === 'undelivered');
        const refusedList = auditedLeads.filter(l => l.category === 'refused_60d');

        const selectedValid = validList.filter(l => l.selected).length;
        const selectedUndelivered = undeliveredList.filter(l => l.selected).length;
        const selectedRefused = refusedList.filter(l => l.selected).length;

        const totalSelected = selectedValid + selectedUndelivered + selectedRefused;

        return {
            totalUploaded: auditedLeads.length,
            totalSelected,
            valid: {
                total: validList.length,
                selected: selectedValid
            },
            undelivered: {
                total: undeliveredList.length,
                selected: selectedUndelivered
            },
            refused60d: {
                total: refusedList.length,
                selected: selectedRefused
            }
        };
    }, [auditedLeads]);

    // Alternar seleção individual
    const toggleLeadSelection = (id: string) => {
        setAuditedLeads(prev =>
            prev.map(item => item.id === id ? { ...item, selected: !item.selected } : item)
        );
    };

    // Marcar/Desmarcar todos da categoria atual
    const toggleSelectAllCategory = (category: AuditedLeadCategory, select: boolean) => {
        setAuditedLeads(prev =>
            prev.map(item => item.category === category ? { ...item, selected: select } : item)
        );
    };

    // Filtro da aba ativa
    const currentTabLeads = useMemo(() => {
        let list = auditedLeads.filter(l => l.category === activeTab);
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            list = list.filter(l =>
                l.name.toLowerCase().includes(term) ||
                l.identifier.includes(term) ||
                l.phone.includes(term) ||
                l.reason.toLowerCase().includes(term)
            );
        }
        return list;
    }, [auditedLeads, activeTab, searchTerm]);

    // Exportação em Excel (.xlsx) de aba individual
    const handleExportTab = (category: AuditedLeadCategory) => {
        const list = auditedLeads.filter(l => l.category === category);
        if (list.length === 0) {
            toast({ title: 'Aba vazia', description: 'Não há contatos para exportar nesta categoria.' });
            return;
        }

        const categoryNames = {
            valid: 'aptos_envio',
            undelivered: 'falha_entrega_previa',
            refused_60d: 'recusados_ultimos_60dias'
        };

        const rows = list.map(l => ({
            'Linha Arquivo': l.rowNumber,
            'Razão Social / Nome': l.name,
            'CNPJ': formatCnpjMask(l.identifier),
            'WhatsApp': formatPhoneMask(l.phone),
            'Marcado para Envio': l.selected ? 'SIM' : 'NÃO',
            'Motivo / Status': l.reason,
            'Dias desde Recusa': l.refusalDaysAgo !== null && l.refusalDaysAgo !== undefined ? l.refusalDaysAgo : '-'
        }));

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Contatos');
        XLSX.writeFile(workbook, `relatorio_${categoryNames[category]}_${new Date().toISOString().slice(0, 10)}.xlsx`);

        toast({
            title: 'Download iniciado',
            description: `Planilha com ${rows.length} contatos da aba exportada.`
        });
    };

    // Exportação do relatório consolidado completo
    const handleExportCompleteReport = () => {
        if (auditedLeads.length === 0) {
            toast({ title: 'Nenhum dado', description: 'Carregue um arquivo para gerar o relatório.' });
            return;
        }

        const categoryLabels: Record<AuditedLeadCategory, string> = {
            valid: 'Pronto p/ Envio (Válido)',
            undelivered: 'Tentado sem Entrega',
            refused_60d: 'Recusado (<60 dias)'
        };

        const rows = auditedLeads.map(l => ({
            'Linha': l.rowNumber,
            'Razão Social': l.name,
            'CNPJ': formatCnpjMask(l.identifier),
            'Telefone': formatPhoneMask(l.phone),
            'Aba / Categoria': categoryLabels[l.category],
            'Marcado p/ Envio': l.selected ? 'SIM' : 'NÃO',
            'Motivo de Auditoria': l.reason,
            'Dias desde a Recusa': l.refusalDaysAgo !== null && l.refusalDaysAgo !== undefined ? l.refusalDaysAgo : '-'
        }));

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Auditoria Geral');
        XLSX.writeFile(workbook, `auditoria_carga_completa_${new Date().toISOString().slice(0, 10)}.xlsx`);

        toast({
            title: 'Relatório Completo Exportado',
            description: `Relatório geral com ${rows.length} contatos exportado com sucesso.`
        });
    };

    // Ação de confirmação de envio
    const handleConfirm = async () => {
        if (!selectedCampaignId) {
            toast({ title: 'Campanha não selecionada', description: 'Selecione a campanha ativa de destino.', variant: 'destructive' });
            return;
        }

        const selected = auditedLeads.filter(l => l.selected);
        if (selected.length === 0) {
            toast({
                title: 'Nenhum contato selecionado',
                description: 'Marque ao menos um contato para iniciar o disparo da campanha.',
                variant: 'destructive'
            });
            return;
        }

        await onConfirmDispatch(selected, auditedLeads, fileName, selectedCampaignId);
    };

    const isCurrentTabAllSelected = useMemo(() => {
        const list = auditedLeads.filter(l => l.category === activeTab);
        return list.length > 0 && list.every(l => l.selected);
    }, [auditedLeads, activeTab]);

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[950px] w-[95vw] max-h-[92vh] flex flex-col p-0 overflow-hidden border-accent/20 bg-background shadow-2xl">
                {/* Header */}
                <DialogHeader className="p-6 pb-4 border-b border-border/50 bg-slate-50/50">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <DialogTitle className="text-xl font-bold text-accent flex items-center gap-2">
                                <Users className="h-5 w-5" />
                                Auditoria Prévia & Seleção de Leads
                            </DialogTitle>
                            <DialogDescription className="text-xs text-muted-foreground mt-1">
                                {fileName ? (
                                    <span>Arquivo carregado: <strong className="text-foreground">{fileName}</strong> ({auditedLeads.length} contatos)</span>
                                ) : (
                                    'Carregue a planilha para analisar o histórico de entrega e recusas de crédito antes do envio.'
                                )}
                            </DialogDescription>
                        </div>

                        {/* Seletor de Campanha */}
                        <div className="min-w-[240px]">
                            <Select onValueChange={onSelectCampaign} value={selectedCampaignId || ''}>
                                <SelectTrigger className="h-9 text-xs bg-background">
                                    <SelectValue placeholder="Selecione a Campanha Ativa" />
                                </SelectTrigger>
                                <SelectContent>
                                    {campaigns.filter(c => c.status === 'active').map(c => (
                                        <SelectItem key={c.id} value={c.id} className="text-xs">
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </DialogHeader>

                {/* Conteúdo Central */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                    {/* Caso 1: Nenhum arquivo carregado */}
                    {auditedLeads.length === 0 && !isParsing && !isAuditing && (
                        <div className="space-y-4">
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-accent/25 hover:border-accent/50 rounded-2xl p-10 flex flex-col items-center justify-center gap-3 bg-accent/5 hover:bg-accent/10 cursor-pointer transition-all duration-200 text-center"
                            >
                                <div className="p-3 bg-accent/10 rounded-full text-accent">
                                    <FileUp className="h-8 w-8" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-foreground">Clique para selecionar a planilha</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Suporta arquivos <strong>.CSV</strong>, <strong>.XLSX</strong> ou <strong>.XLS</strong>
                                    </p>
                                    <p className="text-[11px] text-muted-foreground/80 mt-2">
                                        Colunas recomendadas: <strong>CNPJ</strong>, <strong>Whatsapp</strong> e <strong>Razão Social</strong>
                                    </p>
                                </div>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept=".csv, .xlsx, .xls"
                                    onChange={handleFileUpload}
                                />
                            </div>
                        </div>
                    )}

                    {/* Caso 2: Em processamento / Auditoria */}
                    {(isParsing || isAuditing) && (
                        <div className="py-16 flex flex-col items-center justify-center gap-4 text-center">
                            <Loader2 className="h-10 w-10 text-accent animate-spin" />
                            <div>
                                <h4 className="text-base font-bold text-foreground">
                                    {isParsing ? 'Lendo linhas do arquivo...' : 'Auditando histórico no banco de dados...'}
                                </h4>
                                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                                    Cruzando contatos com envios passados, falhas de entrega e histórico de propostas de crédito recusadas nos últimos 60 dias.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Caso 3: Arquivo auditado com sucesso */}
                    {auditedLeads.length > 0 && !isAuditing && !isParsing && (
                        <div className="space-y-5 animate-in fade-in duration-200">
                            {/* Cards de Métricas Rápidas */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {/* Total Carga */}
                                <div className="p-3 bg-slate-50 border border-border/50 rounded-xl">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Carregado</p>
                                    <div className="flex items-baseline justify-between mt-1">
                                        <span className="text-xl font-black text-foreground">{stats.totalUploaded}</span>
                                        <Badge variant="outline" className="text-[10px] font-bold bg-background">
                                            {stats.totalSelected} marcados
                                        </Badge>
                                    </div>
                                </div>

                                {/* Aba 1: Válidos */}
                                <div 
                                    onClick={() => setActiveTab('valid')}
                                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                        activeTab === 'valid' 
                                            ? 'bg-emerald-500/15 border-emerald-500/50 ring-2 ring-emerald-500/30 shadow-sm' 
                                            : 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10'
                                    }`}
                                >
                                    <div className="flex items-center justify-between text-emerald-600">
                                        <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            Prontos p/ Envio
                                        </span>
                                    </div>
                                    <div className="flex items-baseline justify-between mt-1.5">
                                        <span className="text-2xl font-black text-emerald-700">{stats.valid.total}</span>
                                        <span className="text-[10px] font-bold text-emerald-600">
                                            {stats.valid.selected} de {stats.valid.total} marcados
                                        </span>
                                    </div>
                                </div>

                                {/* Aba 2: Falha de Entrega */}
                                <div 
                                    onClick={() => setActiveTab('undelivered')}
                                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                        activeTab === 'undelivered' 
                                            ? 'bg-amber-500/15 border-amber-500/50 ring-2 ring-amber-500/30 shadow-sm' 
                                            : 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10'
                                    }`}
                                >
                                    <div className="flex items-center justify-between text-amber-600">
                                        <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                            <AlertTriangle className="h-3.5 w-3.5" />
                                            Tentados s/ Entrega
                                        </span>
                                    </div>
                                    <div className="flex items-baseline justify-between mt-1.5">
                                        <span className="text-2xl font-black text-amber-700">{stats.undelivered.total}</span>
                                        <span className="text-[10px] font-bold text-amber-600">
                                            {stats.undelivered.selected} marcados
                                        </span>
                                    </div>
                                </div>

                                {/* Aba 3: Recusados <60d */}
                                <div 
                                    onClick={() => setActiveTab('refused_60d')}
                                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                        activeTab === 'refused_60d' 
                                            ? 'bg-rose-500/15 border-rose-500/50 ring-2 ring-rose-500/30 shadow-sm' 
                                            : 'bg-rose-500/5 border-rose-500/20 hover:bg-rose-500/10'
                                    }`}
                                >
                                    <div className="flex items-center justify-between text-rose-600">
                                        <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                            <XCircle className="h-3.5 w-3.5" />
                                            Recusados &lt;60d
                                        </span>
                                    </div>
                                    <div className="flex items-baseline justify-between mt-1.5">
                                        <span className="text-2xl font-black text-rose-700">{stats.refused60d.total}</span>
                                        <span className="text-[10px] font-bold text-rose-600">
                                            {stats.refused60d.selected} marcados
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Alerta de Contatos Recusados Marcados */}
                            {stats.refused60d.selected > 0 && (
                                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2 animate-in fade-in">
                                    <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" />
                                    <span>
                                        <strong>Atenção:</strong> Você marcou <strong>{stats.refused60d.selected} contato(s)</strong> que tiveram crédito recusado nos últimos 60 dias. Eles serão incluídos no disparo conforme solicitado.
                                    </span>
                                </div>
                            )}

                            {/* Listagem controlada diretamente pelos Cards Superiores */}
                            <div className="w-full space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/50">
                                    {/* Indicador da Categoria Selecionada */}
                                    <div className="flex items-center gap-2">
                                        {activeTab === 'valid' && (
                                            <>
                                                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                                <span className="text-xs font-bold text-foreground">Visualizando: Prontos para Envio</span>
                                                <Badge variant="outline" className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border-emerald-200">
                                                    {stats.valid.selected} de {stats.valid.total} marcados
                                                </Badge>
                                            </>
                                        )}
                                        {activeTab === 'undelivered' && (
                                            <>
                                                <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                                                <span className="text-xs font-bold text-foreground">Visualizando: Tentados sem Entrega</span>
                                                <Badge variant="outline" className="text-[10px] font-semibold text-amber-700 bg-amber-50 border-amber-200">
                                                    {stats.undelivered.selected} de {stats.undelivered.total} marcados
                                                </Badge>
                                            </>
                                        )}
                                        {activeTab === 'refused_60d' && (
                                            <>
                                                <div className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                                                <span className="text-xs font-bold text-foreground">Visualizando: Recusados nos últimos 60 dias</span>
                                                <Badge variant="outline" className="text-[10px] font-semibold text-rose-700 bg-rose-50 border-rose-200">
                                                    {stats.refused60d.selected} de {stats.refused60d.total} marcados
                                                </Badge>
                                            </>
                                        )}
                                    </div>

                                    {/* Ações da Aba: Busca + Marcar/Desmarcar + Exportar Esta Lista */}
                                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                        <div className="relative w-44 md:w-52">
                                            <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                                            <Input
                                                placeholder="Filtrar nesta lista..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="h-8 pl-8 text-xs bg-background"
                                            />
                                        </div>

                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8 text-xs font-semibold gap-1 shrink-0 border-border/70 text-slate-700 hover:text-slate-900 hover:bg-slate-100 shadow-sm"
                                            onClick={() => toggleSelectAllCategory(activeTab, !isCurrentTabAllSelected)}
                                        >
                                            {isCurrentTabAllSelected ? 'Desmarcar Todos' : 'Marcar Todos'}
                                        </Button>

                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8 text-xs font-semibold gap-1.5 shrink-0 border-border/70 text-slate-700 hover:text-slate-900 hover:bg-slate-100 shadow-sm"
                                            onClick={() => handleExportTab(activeTab)}
                                            title="Exportar contatos desta lista em planilha"
                                        >
                                            <Download className="h-3.5 w-3.5 text-accent" />
                                            <span>Exportar Lista</span>
                                        </Button>
                                    </div>
                                </div>

                                {/* Conteúdo da Tabela da Categoria Selecionada */}
                                {currentTabLeads.length === 0 ? (
                                    <div className="py-12 text-center text-muted-foreground border border-dashed border-border/60 rounded-xl bg-muted/10">
                                        <p className="text-xs font-semibold">Nenhum registro encontrado nesta categoria.</p>
                                        {searchTerm && (
                                            <p className="text-[11px] text-muted-foreground mt-1">Tente remover o filtro de busca.</p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="border border-border/50 rounded-xl overflow-hidden shadow-sm bg-background">
                                        <div className="max-h-[340px] overflow-y-auto custom-scrollbar">
                                            <table className="w-full text-left text-xs">
                                                <thead className="sticky top-0 bg-slate-100/90 backdrop-blur-sm z-10 border-b border-border/60 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                                                    <tr>
                                                        <th className="py-2.5 px-3 w-10 text-center">
                                                            <Checkbox
                                                                checked={isCurrentTabAllSelected}
                                                                onCheckedChange={(checked) => toggleSelectAllCategory(activeTab, !!checked)}
                                                                aria-label="Selecionar todos os contatos da lista"
                                                            />
                                                        </th>
                                                        <th className="py-2.5 px-3">Razão Social / Nome</th>
                                                        <th className="py-2.5 px-3 w-36">CNPJ</th>
                                                        <th className="py-2.5 px-3 w-32">WhatsApp</th>
                                                        <th className="py-2.5 px-3">Diagnóstico / Motivo</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border/30">
                                                    {currentTabLeads.map((item) => (
                                                        <tr
                                                            key={item.id}
                                                            onClick={() => toggleLeadSelection(item.id)}
                                                            className={`cursor-pointer transition-colors hover:bg-muted/40 ${
                                                                item.selected ? 'bg-accent/5' : 'opacity-70'
                                                            }`}
                                                        >
                                                            <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                                <Checkbox
                                                                    checked={item.selected}
                                                                    onCheckedChange={() => toggleLeadSelection(item.id)}
                                                                />
                                                            </td>
                                                            <td className="py-2 px-3 font-medium text-foreground truncate max-w-[220px]" title={item.name}>
                                                                {item.name}
                                                            </td>
                                                            <td className="py-2 px-3 font-mono text-muted-foreground text-[11px]">
                                                                {formatCnpjMask(item.identifier)}
                                                            </td>
                                                            <td className="py-2 px-3 font-mono font-bold text-accent text-[11px]">
                                                                {formatPhoneMask(item.phone)}
                                                            </td>
                                                            <td className="py-2 px-3">
                                                                {item.category === 'valid' && (
                                                                    <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 border-emerald-500/30 text-[10px] font-medium gap-1">
                                                                        <CheckCircle2 className="h-3 w-3" />
                                                                        {item.reason}
                                                                    </Badge>
                                                                )}
                                                                {item.category === 'undelivered' && (
                                                                    <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 border-amber-500/30 text-[10px] font-medium gap-1">
                                                                        <AlertTriangle className="h-3 w-3" />
                                                                        {item.reason}
                                                                    </Badge>
                                                                )}
                                                                {item.category === 'refused_60d' && (
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <Badge className="bg-rose-500/15 text-rose-700 hover:bg-rose-500/20 border-rose-500/30 text-[10px] font-bold gap-1">
                                                                            <XCircle className="h-3 w-3" />
                                                                            {item.refusalDaysAgo !== null && item.refusalDaysAgo !== undefined
                                                                                ? `Recusado há ${item.refusalDaysAgo} dia(s)`
                                                                                : 'Recusado recentemente'}
                                                                        </Badge>
                                                                        <span className="text-[10px] text-muted-foreground truncate max-w-[180px]" title={item.reason}>
                                                                            {item.reason}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer com Ações */}
                <DialogFooter className="p-4 px-6 bg-slate-50/80 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                        {auditedLeads.length > 0 && (
                            <>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setAuditedLeads([]);
                                        setFileName('');
                                    }}
                                    className="text-xs text-slate-700 hover:text-rose-600 hover:bg-rose-50 border-border/70 hover:border-rose-300 transition-colors gap-1.5 shadow-sm"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Trocar Arquivo
                                </Button>

                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleExportCompleteReport}
                                    className="text-xs font-semibold gap-1.5 border-border/70 text-slate-700 hover:text-slate-900 hover:bg-slate-100 shadow-sm"
                                >
                                    <Download className="h-3.5 w-3.5 text-accent" />
                                    Exportar Auditoria Completa (.xlsx)
                                </Button>
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => handleClose(false)}
                            className="text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                            disabled={isImporting}
                        >
                            Cancelar
                        </Button>

                        {auditedLeads.length > 0 && (
                            <Button
                                type="button"
                                onClick={handleConfirm}
                                disabled={stats.totalSelected === 0 || !selectedCampaignId || isImporting}
                                className="bg-accent hover:bg-accent/90 text-white font-bold text-xs px-6 gap-2 shadow-sm"
                            >
                                {isImporting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Disparando Campanha...
                                    </>
                                ) : (
                                    <>
                                        <span>Importar e Enviar ({stats.totalSelected} contatos)</span>
                                        <ArrowRight className="h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
