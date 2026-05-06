import { useState, useEffect, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { api } from "@/services/api";
import { Campaign, CampaignStatus, Agent, CampaignImportLog } from "@/lib/types";
import { normalizeMessagingText } from "@/lib/message-formatting";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import {
    Megaphone,
    Plus,
    Search,
    Calendar,
    TrendingUp,
    Users,
    MessageSquare,
    MoreVertical,
    Play,
    Pause,
    Trash2,
    FileUp,
    Clock,
    Bot,
    ShieldCheck,
    Pencil,
    Eye,
    X,
    Download,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    AlertCircle,
    Zap,
    Activity,
    ImageIcon,
    Link2
} from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MainLayout } from "@/components/layout/MainLayout";

const parseLocalDate = (dateString: string): Date => {
    if (!dateString) return new Date();
    const parts = dateString.split('-');
    if (parts.length === 3) {
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
    }
    return new Date(dateString);
};

type CampaignImportRow = {
    name: string;
    phone: string;
    identifier: string;
    ctaLink: string;
    rowNumber: number;
    rawData?: Record<string, any>;
};

export default function Campaigns() {
    const { currentTenant, hasPermission } = useApp();
    const { toast } = useToast();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [queueMetricsByCampaign, setQueueMetricsByCampaign] = useState<Record<string, { total: number; sent: number }>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isContactsViewOpen, setIsContactsViewOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [importData, setImportData] = useState<CampaignImportRow[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [isLoadingContacts, setIsLoadingContacts] = useState(false);
    const [selectedCampaignForImport, setSelectedCampaignForImport] = useState<string | null>(null);
    const [viewContacts, setViewContacts] = useState<any[]>([]);
    const [contactSearch, setContactSearch] = useState("");
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
    const [isImportErrorsOpen, setIsImportErrorsOpen] = useState(false);
    const [importErrors, setImportErrors] = useState<CampaignImportLog[]>([]);
    const [isLoadingErrors, setIsLoadingErrors] = useState(false);
    const [selectedCampaignForErrors, setSelectedCampaignForErrors] = useState<Campaign | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const sanitizeUrlValue = (value: any) =>
        String(value ?? '')
            .trim()
            .replace(/^["'`\s]+|["'`\s]+$/g, '');

    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
    const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);

    const decodeJwtPayload = (token: string) => {
        try {
            const payload = token.split('.')[1];
            if (!payload) return null;
            const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
            const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
            return JSON.parse(atob(padded));
        } catch {
            return null;
        }
    };

    const getLinkCnpj = (ctaLink: string) => {
        try {
            const sanitized = sanitizeUrlValue(ctaLink);
            if (!sanitized) return '';
            const url = new URL(sanitized);
            const token = url.searchParams.get('t');
            if (!token) return '';
            const payload = decodeJwtPayload(token);
            return String(payload?.cnpj_sanitize || payload?.cnpj || '').replace(/\D/g, '');
        } catch {
            return '';
        }
    };

    const defaultInitialMessage =
        "Já pensou em reforçar o caixa *sem burocracia*?\n\n" +
        "Você pode ter *até R$500 mil* disponíveis, usando apenas seus recebíveis Ticket como garantia. A consulta é *rápida e sem compromisso*.\n\n" +
        "✅Taxas a partir de *1,89% a.m*;\n" +
        "✅Crédito disponível entre *10 mil a 500 mil reais*;\n" +
        "✅Recebimento do dinheiro *em até 24h*;\n\n" +
        "👉 Posso enviar o link para simular o valor disponível para o seu CNPJ ou ficou com alguma dúvida?";

    // New Campaign Form State
    const [newCampaign, setNewCampaign] = useState({
        name: "",
        description: "",
        agentId: "",
        dailyLimit: 1000,
        startDate: format(new Date(), "yyyy-MM-dd"),
        endDate: "",
        startTime: "09:00",
        endTime: "18:00",
        initialMessage: defaultInitialMessage,
        templateId: "",
        zenviaImageUrl: "",
        zenviaCtaLink: "",
        successCriteria: ['LINK_SENT'] as string[],
        successLinkFilter: "fiservcapital",
        reengagementEnabled: false,
        reengagementWaitHours: 24,
        reengagementMaxAttempts: 1,
        reengagementMessage: ""
    });

    useEffect(() => {
        // If there's only one agent available for this tenant, preselect it to reduce friction.
        if (agents.length === 1 && !newCampaign.agentId) {
            setNewCampaign((prev) => ({ ...prev, agentId: agents[0].id }));
        }
    }, [agents, newCampaign.agentId]);

    useEffect(() => {
        if (currentTenant) {
            loadData();
        }
    }, [currentTenant]);

    const loadData = async () => {
        if (!currentTenant) return;
        setIsLoading(true);
        try {
            const [campaignsData, agentsData, queueMetricsData] = await Promise.all([
                api.getCampaigns(currentTenant.id),
                api.getAgents(currentTenant.id),
                api.getOutboundQueueMetricsByCampaign(currentTenant.id)
            ]);

            const statsResults = await Promise.allSettled(
                campaignsData.map(async (campaign) => ({
                    campaignId: campaign.id,
                    stats: await api.getCampaignStats(campaign.id, currentTenant.id)
                }))
            );

            const statsByCampaignId = new Map(
                statsResults
                    .filter((result): result is PromiseFulfilledResult<{ campaignId: string; stats: Awaited<ReturnType<typeof api.getCampaignStats>> }> => result.status === 'fulfilled')
                    .map((result) => [result.value.campaignId, result.value.stats])
            );

            const campaignsWithLiveStats = campaignsData.map((campaign) => {
                const liveStats = statsByCampaignId.get(campaign.id);
                if (!liveStats) return campaign;

                return {
                    ...campaign,
                    sentCount: liveStats.sent_count,
                    deliveredCount: liveStats.delivered_count || 0,
                    responseCount: liveStats.response_count,
                    conversionCount: liveStats.conversion_count,
                    conversionRate: liveStats.conversion_rate,
                    importErrorCount: liveStats.import_errors
                };
            });

            setCampaigns(campaignsWithLiveStats);
            setAgents(agentsData);
            setQueueMetricsByCampaign(queueMetricsData);
        } catch (error) {
            console.error("Error loading campaigns:", error);
            toast({
                title: "Erro ao carregar dados",
                description: "Não foi possível carregar as campanhas e agentes.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateCampaign = async () => {
        if (!currentTenant || !newCampaign.agentId || !newCampaign.name) {
            toast({
                title: "Campos obrigatórios",
                description: "Preencha o nome da campanha e selecione um agente.",
                variant: "destructive",
            });
            return;
        }

        try {
            const createdCampaign = await api.createCampaign({
                tenantId: currentTenant.id,
                agentId: newCampaign.agentId,
                name: newCampaign.name,
                description: newCampaign.description,
                startDate: parseLocalDate(newCampaign.startDate),
                endDate: newCampaign.endDate ? parseLocalDate(newCampaign.endDate) : undefined,
                startTime: newCampaign.startTime,
                endTime: newCampaign.endTime,
                initialMessage: normalizeMessagingText(newCampaign.initialMessage),
                metadata: {
                    template_id: newCampaign.templateId || undefined,
                    zenvia_image_url: newCampaign.zenviaImageUrl || undefined,
                    zenvia_cta_link: newCampaign.zenviaCtaLink || undefined
                },
                dailyLimit: newCampaign.dailyLimit,
                successCriteria: newCampaign.successCriteria,
                successLinkFilter: newCampaign.successCriteria.includes('LINK_SENT') ? newCampaign.successLinkFilter : undefined,
                reengagementEnabled: newCampaign.reengagementEnabled,
                reengagementWaitHours: newCampaign.reengagementWaitHours,
                reengagementMaxAttempts: newCampaign.reengagementMaxAttempts,
                reengagementMessage: newCampaign.reengagementMessage,
                status: "active" as CampaignStatus,
            });

            toast({
                title: "Campanha criada!",
                description: "Sua campanha estratégica foi salva e está pronta para disparos.",
            });
            setIsCreateOpen(false);
            setSelectedCampaignForImport(createdCampaign.id);
            setImportData([]);
            if (fileInputRef.current) fileInputRef.current.value = "";
            setNewCampaign({
                name: "",
                description: "",
                agentId: agents.length === 1 ? agents[0].id : "",
                dailyLimit: 1000,
                startDate: format(new Date(), "yyyy-MM-dd"),
                endDate: "",
                startTime: "09:00",
                endTime: "18:00",
                initialMessage: defaultInitialMessage,
                templateId: "",
                zenviaImageUrl: "",
                zenviaCtaLink: "",
                successCriteria: ['LINK_SENT'],
                successLinkFilter: "fiservcapital",
                reengagementEnabled: false,
                reengagementWaitHours: 24,
                reengagementMaxAttempts: 1,
                reengagementMessage: ""
            });
            await loadData();
            setIsImportOpen(true);
        } catch (error) {
            toast({
                title: "Erro ao criar",
                description: "Erro ao salvar a campanha no banco de dados.",
                variant: "destructive",
            });
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        const extension = file.name.split('.').pop()?.toLowerCase();

        if (extension === 'csv') {
            Papa.parse(file, {
                header: false, // Ler como array de arrays para flexibilidade
                skipEmptyLines: true,
                complete: (results) => {
                    processImportData(results.data as any[][]);
                },
                error: (error) => {
                    toast({ title: "Erro ao ler CSV", description: error.message, variant: "destructive" });
                }
            });
        } else if (extension === 'xlsx' || extension === 'xls') {
            reader.onload = (e) => {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                // Ler como array de arrays (header: 1)
                const rangeData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                processImportData(rangeData);
            };
            reader.readAsArrayBuffer(file);
        } else {
            toast({ title: "Formato inválido", description: "Use apenas CSV, XLS ou XLSX.", variant: "destructive" });
        }
    };

    const processImportData = (rows: any[][]) => {
        if (!rows || rows.length === 0) return;

        let identifierIdx = 0;
        let phoneIdx = 1;
        let nameIdx = 2;
        let ctaLinkIdx = 3;
        let startRow = 0;

        const normalizeHeader = (value: any) =>
            String(value ?? '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim()
                .toLowerCase();

        let bestHeaderRowIdx = -1;
        let maxMatches = 0;

        // Escaneia as primeiras 15 linhas em busca do melhor cabeçalho (o que tiver mais colunas correspondentes)
        for (let i = 0; i < Math.min(rows.length, 15); i++) {
            const row = Array.from(rows[i] || [], normalizeHeader);
            const matchesCount = row.filter(c =>
                c.includes('cnpj') ||
                c.includes('whatsapp') ||
                c.includes('telefone') ||
                c.includes('phone') ||
                c.includes('razao social') ||
                c.includes('nome') ||
                c === 'link' ||
                c.includes('cta')
            ).length;

            if (matchesCount > maxMatches) {
                maxMatches = matchesCount;
                bestHeaderRowIdx = i;
            }
        }

        // Só consideramos cabeçalho se houver pelo menos 2 colunas identificadas
        if (bestHeaderRowIdx !== -1 && maxMatches >= 2) {
            const headerRow = Array.from(rows[bestHeaderRowIdx] || [], normalizeHeader);
            identifierIdx = headerRow.findIndex(c => c.includes('cnpj') || c.includes('cpf') || c.includes('documento') || c.includes('identifier'));
            phoneIdx = headerRow.findIndex(c => c.includes('tel') || c.includes('phone') || c.includes('cel') || c.includes('whatsapp'));
            nameIdx = headerRow.findIndex(c => c.includes('razao social') || c.includes('nome') || c.includes('name') || c.includes('empresa') || c.includes('estabelecimento'));
            ctaLinkIdx = headerRow.findIndex(c => c === 'link' || c.includes('cta') || c.includes('url'));
            startRow = bestHeaderRowIdx + 1;

            if (identifierIdx === -1) identifierIdx = 0;
            if (phoneIdx === -1) phoneIdx = 1;
            if (nameIdx === -1) nameIdx = 2;
            if (ctaLinkIdx === -1) ctaLinkIdx = 3;
        }

        const processed = rows.slice(startRow).map((row, idx) => {
            let identifier = row[identifierIdx] ? String(row[identifierIdx]).trim() : "";
            
            // Auto-pad para a amostra também
            const cleanIdDigits = identifier.replace(/\D/g, '');
            if (cleanIdDigits && cleanIdDigits.length > 0 && cleanIdDigits.length < 14) {
                identifier = cleanIdDigits.padStart(14, '0');
            }
            const phone = row[phoneIdx] ? String(row[phoneIdx]).trim() : "";
            const name = row[nameIdx] ? String(row[nameIdx]).trim().substring(0, 100) : "Sem Nome";
            const ctaLink = row[ctaLinkIdx] ? sanitizeUrlValue(row[ctaLinkIdx]) : "";

            return {
                name,
                phone,
                identifier,
                ctaLink,
                rowNumber: startRow + idx + 1,
                rawData: {
                    identifier,
                    phone,
                    name,
                    ctaLink,
                }
            };
        }).filter((row) => row.identifier || row.phone || row.name !== "Sem Nome" || row.ctaLink);

        if (processed.length === 0) {
            toast({
                title: "Nenhum dado válido",
                description: "Certifique-se de que o arquivo segue a estrutura CNPJ, Whatsapp, Razão Social e LINK.",
                variant: "destructive"
            });
            return;
        }

        setImportData(processed);
        toast({
            title: "Arquivo carregado!",
            description: `${processed.length} contatos prontos para importação.`
        });
    };

    const handleImportContacts = async () => {
        if (!currentTenant || !selectedCampaignForImport || importData.length === 0) return;

        setIsImporting(true);
        const campaign = campaigns.find(c => c.id === selectedCampaignForImport);
        if (!campaign) {
            setIsImporting(false);
            return;
        }

        const normalizePhone = (raw: string) => {
            let clean = raw.replace(/\D/g, '');
            // Se for número brasileiro (DDD + 8 ou 9 dígitos) sem o 55
            if ((clean.length === 10 || clean.length === 11) && !clean.startsWith('55')) {
                clean = '55' + clean;
            }
            return clean;
        };

        try {
            const importLogs: any[] = [];
            const validContactsMap: Record<string, any> = {};
            const validLeadsByIdentifier: Record<string, any> = {};
            
            importData.forEach((item) => {
                const rawPhone = item.phone;
                const rawIdentifier = item.identifier;
                const sanitizedLink = sanitizeUrlValue(item.ctaLink);
                // 1. Validação de Telefone (Verifica se contém caracteres inválidos e se tem tamanho mínimo)
                const hasLetters = /[a-zA-Z]/.test(rawPhone);
                const cleanPhone = rawPhone.replace(/\D/g, '');
                let cleanIdentifier = rawIdentifier.replace(/\D/g, '');
                
                // Auto-pad com zeros à esquerda se for menor que 14 (correção para Excel que remove zeros)
                if (cleanIdentifier && cleanIdentifier.length > 0 && cleanIdentifier.length < 14) {
                    cleanIdentifier = cleanIdentifier.padStart(14, '0');
                }
                
                if (!cleanIdentifier || cleanIdentifier.length < 14) {
                    importLogs.push({
                        campaignId: campaign.id,
                        tenantId: currentTenant.id,
                        rowNumber: item.rowNumber,
                        contactName: item.name,
                        contactPhone: rawPhone,
                        errorType: 'OTHER',
                        errorMessage: 'CNPJ/identificador inválido ou ausente.',
                        rawData: item
                    });
                    return;
                }

                if (hasLetters || cleanPhone.length < 10) {
                    importLogs.push({
                        campaignId: campaign.id,
                        tenantId: currentTenant.id,
                        rowNumber: item.rowNumber,
                        contactName: item.name,
                        contactPhone: rawPhone,
                        errorType: 'INVALID_PHONE',
                        errorMessage: hasLetters 
                            ? 'Telefone contém caracteres inválidos (letras não permitidas).' 
                            : 'Telefone inválido (mínimo 10 dígitos com DDD).',
                        rawData: item
                    });
                    return;
                }



                // 2. Normalização
                let phone = cleanPhone;
                if ((phone.length === 10 || phone.length === 11) && !phone.startsWith('55')) {
                    phone = '55' + phone;
                }

                // 3. Deduplicação Local
                if (validContactsMap[phone]) {
                    importLogs.push({
                        campaignId: campaign.id,
                        tenantId: currentTenant.id,
                        rowNumber: item.rowNumber,
                        contactName: item.name,
                        contactPhone: phone,
                        errorType: 'DUPLICATE',
                        errorMessage: 'Contato duplicado detectado no arquivo.',
                        rawData: item
                    });
                    return;
                }

                validContactsMap[phone] = {
                    ...item,
                    phone,
                    identifier: cleanIdentifier,
                    ctaLink: sanitizedLink
                };

                validLeadsByIdentifier[cleanIdentifier] = {
                    tenantId: currentTenant.id,
                    campaignId: campaign.id,
                    identifier: cleanIdentifier,
                    identifierType: 'cnpj',
                    name: item.name,
                    whatsapp: phone,
                    ctaLink: sanitizedLink || null,
                    status: 'pending',
                    metadata: {
                        source: 'campaign_import',
                        campaign_id: campaign.id,
                        cnpj: cleanIdentifier,
                        razao_social: item.name,
                        cta_link: sanitizedLink || null,
                    }
                };
            });

            const finalContactsToInsert = Object.values(validContactsMap).map(item => {
                const baseMessage = normalizeMessagingText(campaign.initialMessage || "");
                const personalizedMessage = baseMessage.replace(/{{nome}}/gi, item.name || "Cliente");

                return {
                    tenantId: currentTenant.id,
                    agentId: campaign.agentId,
                    campaignId: campaign.id,
                    contactName: item.name,
                    contactPhone: item.phone,
                    status: 'pending' as const,
                    metadata: {
                        content: personalizedMessage,
                        cnpj: item.identifier,
                        identifier: item.identifier,
                        razao_social: item.name,
                        cta_link: item.ctaLink || campaign.metadata?.zenvia_cta_link || null,
                        template_id: campaign.metadata?.template_id || null,
                        zenvia_image_url: campaign.metadata?.zenvia_image_url || null,
                    }
                };
            });

            // Persistir Logs de Erro se houver
            if (importLogs.length > 0) {
                await api.logImportErrors(importLogs);
                
                // Atualizar o contador acumulado de erros na campanha
                const currentErrors = campaign.importErrorCount || 0;
                await api.updateCampaign(campaign.id, {
                    importErrorCount: currentErrors + importLogs.length
                });
            }

            // Batch upload
            const chunkSize = 500;
            for (let i = 0; i < finalContactsToInsert.length; i += chunkSize) {
                const chunk = finalContactsToInsert.slice(i, i + chunkSize);
                await api.addToOutboundQueue(chunk);
            }

            const leadsToUpsert = Object.values(validLeadsByIdentifier);
            for (let i = 0; i < leadsToUpsert.length; i += chunkSize) {
                const chunk = leadsToUpsert.slice(i, i + chunkSize);
                await api.upsertAgentLeads(chunk);
            }

            // Sincronização de Contador Real
            const allContacts = await api.getOutboundQueue(currentTenant.id, undefined, campaign.id);
            const realTotal = allContacts.length;

            await api.updateCampaign(campaign.id, {
                totalContacts: realTotal
            });

            const added = finalContactsToInsert.length;
            const errors = importLogs.length;

            toast({
                title: "Importação concluída!",
                description: `${added} contatos adicionados e sincronizados em agent_leads. ${errors > 0 ? `${errors} inconsistências registradas.` : ''}`,
            });
            setIsImportOpen(false);
            setImportData([]);
            if (fileInputRef.current) fileInputRef.current.value = "";
            await loadData();
            await handleViewContacts(campaign.id);
        } catch (error: any) {
            console.error("Import error:", error);
            toast({
                title: "Erro na importação",
                description: getImportErrorMessage(error),
                variant: "destructive",
            });
        } finally {
            setIsImporting(false);
        }
    };

    const getImportErrorMessage = (error: any) => {
        const rawMessage = String(error?.message || '');
        const isAgentLeadsRls =
            error?.code === '42501' &&
            rawMessage.includes('agent_leads');

        if (isAgentLeadsRls) {
            return 'O banco bloqueou a gravação em agent_leads por política de segurança. Aplique a migration de RLS de agent_leads e tente novamente.';
        }

        if (error?.code === '42501') {
            return 'Seu usuário não tem permissão para concluir esta importação. Verifique as políticas de acesso do tenant.';
        }

        return 'Houve um problema ao processar a base de dados.';
    };

    const getImportLogsErrorMessage = (error: any) => {
        if (error?.code === '42501') {
            return 'Seu usuário não tem permissão para visualizar os logs de inconsistência desta campanha.';
        }

        return 'Não foi possível buscar os erros de importação.';
    };

    const handleDownloadImportErrors = () => {
        if (!importErrors.length) return;

        const rows = importErrors.map((log) => ({
            Linha: log.rowNumber,
            "Razão Social / Nome": log.rawData?.name || log.contactName || '',
            CNPJ: log.rawData?.identifier || '',
            Telefone: log.rawData?.phone || log.contactPhone || '',
            Motivo: log.errorMessage || '',
        }));

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Inconsistencias');

        const campaignName = (selectedCampaignForErrors?.name || 'campanha')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .toLowerCase();

        XLSX.writeFile(workbook, `inconsistencias-${campaignName || 'campanha'}.xlsx`);

        toast({
            title: "Planilha gerada",
            description: "O download das inconsistências foi iniciado."
        });
    };

    const handleTogglePause = async (campaign: Campaign) => {
        try {
            const newStatus = campaign.status === 'active' ? 'paused' : 'active';
            await api.updateCampaign(campaign.id, { status: newStatus as CampaignStatus });
            toast({
                title: newStatus === 'paused' ? "Campanha Pausada" : "Campanha Retomada",
                description: `O status da campanha ${campaign.name} foi atualizado.`,
            });
            loadData();
        } catch (error) {
            toast({
                title: "Erro ao atualizar",
                description: "Não foi possível mudar o status da campanha.",
                variant: "destructive",
            });
        }
    };

    const handleDeleteCampaign = (id: string) => {
        const campaign = campaigns.find(c => c.id === id);
        if (campaign) {
            setCampaignToDelete(campaign);
            setDeleteConfirmationInput("");
            setIsDeleteDialogOpen(true);
        }
    };

    const confirmDeleteCampaign = async () => {
        if (!campaignToDelete || deleteConfirmationInput !== "EXCLUIR") return;

        setIsDeleting(true);
        try {
            await api.deleteCampaign(campaignToDelete.id);
            
            // Atualização imediata do estado local para feedback instantâneo
            setCampaigns(prev => prev.filter(c => c.id !== campaignToDelete.id));
            
            toast({
                title: "Campanha excluída",
                description: "A campanha e seus dados relacionados foram removidos com sucesso.",
            });
            
            setIsDeleteDialogOpen(false);
            setCampaignToDelete(null);
            
            // Recarrega dados para garantir sincronia total
            await loadData();
        } catch (error) {
            console.error("Erro ao excluir campanha:", error);
            toast({
                title: "Erro ao excluir",
                description: "Ocorreu um erro ao tentar excluir a campanha.",
                variant: "destructive",
            });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleOpenEdit = (campaign: Campaign) => {
        setEditingCampaign({ ...campaign });
        setIsEditOpen(true);
    };

    const handleUpdateCampaign = async () => {
        if (!editingCampaign) return;

        try {
            await api.updateCampaign(editingCampaign.id, {
                name: editingCampaign.name,
                description: editingCampaign.description,
                dailyLimit: editingCampaign.dailyLimit,
                startDate: editingCampaign.startDate,
                endDate: editingCampaign.endDate,
                startTime: editingCampaign.startTime,
                endTime: editingCampaign.endTime,
                initialMessage: normalizeMessagingText(editingCampaign.initialMessage),
                metadata: { 
                    ...(editingCampaign.metadata || {}), 
                    template_id: editingCampaign.metadata?.template_id || undefined,
                    zenvia_image_url: editingCampaign.metadata?.zenvia_image_url || undefined,
                    zenvia_cta_link: editingCampaign.metadata?.zenvia_cta_link || undefined
                },
                agentId: editingCampaign.agentId,
                successCriteria: editingCampaign.successCriteria,
                successLinkFilter: editingCampaign.successLinkFilter,
                reengagementEnabled: editingCampaign.reengagementEnabled,
                reengagementWaitHours: editingCampaign.reengagementWaitHours,
                reengagementMaxAttempts: editingCampaign.reengagementMaxAttempts,
                reengagementMessage: editingCampaign.reengagementMessage,
            });

            toast({
                title: "Campanha atualizada!",
                description: "As alterações foram salvas com sucesso.",
            });
            setIsEditOpen(false);
            setEditingCampaign(null);
            loadData();
        } catch (error) {
            toast({
                title: "Erro ao atualizar",
                description: "Não foi possível salvar as alterações.",
                variant: "destructive",
            });
        }
    };

    const handleViewContacts = async (campaignId: string) => {
        if (!currentTenant) return;

        setIsLoadingContacts(true);
        setIsContactsViewOpen(true);
        try {
            const contacts = await api.getEnrichedOutboundQueue(currentTenant.id, campaignId);
            console.log("DEBUG - Contatos recebidos da API:", contacts.length, contacts);
            setViewContacts(contacts);
        } catch (error) {
            toast({
                title: "Erro ao carregar contatos",
                description: "Não foi possível buscar a lista de contatos.",
                variant: "destructive",
            });
        } finally {
            setIsLoadingContacts(false);
        }
    };

    const handleViewImportErrors = async (campaign: Campaign) => {
        setSelectedCampaignForErrors(campaign);
        setIsLoadingErrors(true);
        setIsImportErrorsOpen(true);
        try {
            const logs = await api.getImportLogs(campaign.id);
            setImportErrors(logs);
        } catch (error: any) {
            setImportErrors([]);
            toast({
                title: "Erro ao carregar logs",
                description: getImportLogsErrorMessage(error),
                variant: "destructive",
            });
        } finally {
            setIsLoadingErrors(false);
        }
    };

    const getStatusBadge = (status: CampaignStatus) => {
        switch (status) {
            case "active":
                return <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20">Ativa</Badge>;
            case "paused":
                return <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20">Pausada</Badge>;
            case "completed":
                return <Badge className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20">Concluída</Badge>;
            case "cancelled":
                return <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20">Cancelada</Badge>;
            default:
                return <Badge variant="outline">Rascunho</Badge>;
        }
    };

    const totalCampaigns = campaigns.length;
    const totalInconsistencies = campaigns.reduce((acc, curr) => acc + (curr.importErrorCount || 0), 0);
    const totalLoadedLeads = campaigns.reduce((acc, curr) => {
        const queueMetrics = queueMetricsByCampaign[curr.id] || { total: 0, sent: 0 };
        return acc + queueMetrics.total + (curr.importErrorCount || 0);
    }, 0);
    const totalValidLeads = campaigns.reduce((acc, curr) => {
        const queueMetrics = queueMetricsByCampaign[curr.id] || { total: 0, sent: 0 };
        return acc + queueMetrics.total;
    }, 0);
    const totalLinksSent = campaigns.reduce((acc, curr) => acc + (curr.conversionCount || 0), 0);
    const totalLoadedPct = totalValidLeads > 0 ? (totalLoadedLeads / totalValidLeads) * 100 : 0;
    const totalValidPct = totalValidLeads > 0 ? 100 : 0;
    const totalInconsistenciesPct = totalValidLeads > 0 ? (totalInconsistencies / totalValidLeads) * 100 : 0;
    const totalLinksSentPct = totalValidLeads > 0 ? (totalLinksSent / totalValidLeads) * 100 : 0;

    const filteredCampaigns = campaigns.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Lógica de Filtro e Ordenação dos Contatos
    const processedContacts = viewContacts.filter(contact => {
        if (!contactSearch) return true;
        const searchLower = contactSearch.toLowerCase();
        if (contact.contactName && contact.contactName.toLowerCase().includes(searchLower)) return true;
        if (contact.establishmentName && contact.establishmentName.toLowerCase().includes(searchLower)) return true;
        if (contact.cnpj && String(contact.cnpj).toLowerCase().includes(searchLower)) return true;
        if (contact.contactPhone && contact.contactPhone.includes(searchLower)) return true;
        return false;
    }).sort((a, b) => {
        if (!sortConfig) return 0;

        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Tratamento especial para status e nome (string)
        if (typeof aValue === 'string') aValue = aValue.toLowerCase();
        if (typeof bValue === 'string') bValue = bValue.toLowerCase();

        // Tratamento para data (sentAt) - assumindo string ISO ou Date
        if (sortConfig.key === 'sentAt') {
            aValue = a.sentAt ? new Date(a.sentAt).getTime() : 0;
            bValue = b.sentAt ? new Date(b.sentAt).getTime() : 0;
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (key: string) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <ArrowUpDown className="ml-2 h-3 w-3 text-muted-foreground opacity-50" />;
        }
        return sortConfig.direction === 'asc'
            ? <ArrowUp className="ml-2 h-3 w-3 text-accent" />
            : <ArrowDown className="ml-2 h-3 w-3 text-accent" />;
    };

    const headerBaseClass = "bg-slate-50/90 px-2.5 py-3 text-xs font-bold tracking-tight text-slate-600 border-b border-slate-200/80 leading-tight";
    const headerLeftClass = `${headerBaseClass} text-left`;
    const headerCenterClass = `${headerBaseClass} text-center`;
    const headerRightClass = `${headerBaseClass} text-right`;

    return (
        <MainLayout>
            <div className="h-full overflow-y-auto">
                <div className="sticky top-0 z-10 bg-background border-b border-border">
                    <div className="px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2">
                                <Megaphone className="h-6 w-6 text-accent" />
                                Gestão de Campanhas
                            </h1>
                            <p className="text-sm text-muted-foreground">Gerencie o ciclo de vida das suas abordagens proativas inteligentes (Outbound).</p>
                        </div>
                        <div className="flex gap-2">
                            {hasPermission('campaigns.import') && (
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        if (campaigns.length === 0) {
                                            toast({ title: "Crie uma campanha primeiro" });
                                            return;
                                        }
                                        setIsImportOpen(true);
                                    }}
                                    className="border-accent text-accent hover:bg-accent/10 h-9"
                                >
                                    <FileUp className="mr-2 h-4 w-4" /> Importar Lista
                                </Button>
                            )}
                            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                                {hasPermission('campaigns.create') && (
                                <DialogTrigger asChild>
                                    <Button className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold shadow-lg shadow-accent/20 h-9">
                                        <Plus className="mr-2 h-4 w-4" /> Nova Campanha
                                    </Button>
                                </DialogTrigger>
                                )}
                                <DialogContent className="sm:max-w-[850px] max-h-[95vh] flex flex-col p-0 overflow-hidden border-accent/20">
                                    <DialogHeader className="p-5 pb-2">
                                        <DialogTitle className="text-xl font-bold text-accent">Criar Nova Campanha Outbound</DialogTitle>
                                        <DialogDescription className="text-[11px]">
                                            Defina o agente, a audiência e a estratégia de reengajamento em um único lugar.
                                        </DialogDescription>
                                    </DialogHeader>
                                    
                                    <div className="flex-1 overflow-y-auto px-5 py-2 space-y-4 custom-scrollbar pb-6">
                                        {/* Seção 1: Identidade e Agente */}
                                        <div className="grid grid-cols-12 gap-4 items-start">
                                            <Card className="col-span-12 lg:col-span-8 border-accent/5 shadow-none bg-slate-50/50">
                                                <CardContent className="p-3 space-y-3">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="grid gap-1.5">
                                                            <Label htmlFor="name" className="text-[10px] uppercase font-bold text-slate-400">Nome da Campanha</Label>
                                                            <Input
                                                                id="name"
                                                                placeholder="Ex: Reengajamento Janeiro"
                                                                className="bg-white h-9 border-slate-200 text-sm"
                                                                value={newCampaign.name}
                                                                onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                                                            />
                                                        </div>
                                                        <div className="grid gap-1.5">
                                                            <Label htmlFor="agent" className="text-[10px] uppercase font-bold text-slate-400">Agente IA Executor</Label>
                                                            <Select value={newCampaign.agentId} onValueChange={(v) => setNewCampaign({ ...newCampaign, agentId: v })}>
                                                                <SelectTrigger className="bg-white h-9 border-slate-200 text-sm">
                                                                    <SelectValue placeholder="Selecione..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {agents.map(agent => (
                                                                        <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                    <div className="grid gap-1.5">
                                                        <Label htmlFor="description" className="text-[10px] uppercase font-bold text-slate-400">Objetivo Estratégico</Label>
                                                        <Input
                                                            id="description"
                                                            placeholder="Ex: Converter leads inativos de Jan"
                                                            className="bg-white h-9 border-slate-200 text-sm"
                                                            value={newCampaign.description}
                                                            onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
                                                        />
                                                    </div>
                                                </CardContent>
                                            </Card>

                                            {/* Seção 2: Execução (Compacta) */}
                                            <Card className="col-span-12 lg:col-span-4 border-accent/5 shadow-none bg-slate-50/50">
                                                <CardContent className="p-3">
                                                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                                                        <div className="grid gap-1">
                                                            <Label htmlFor="start" className="text-[10px] uppercase font-bold text-slate-400">Início</Label>
                                                            <Input id="start" type="date" className="bg-white h-8 border-slate-200 text-[12px] p-1" value={newCampaign.startDate} onChange={(e) => setNewCampaign({ ...newCampaign, startDate: e.target.value })} />
                                                        </div>
                                                        <div className="grid gap-1">
                                                            <Label htmlFor="limit" className="text-[10px] uppercase font-bold text-slate-400">Lmt Diário</Label>
                                                            <Input id="limit" type="number" className="bg-white h-8 border-slate-200 text-[12px] p-1" value={newCampaign.dailyLimit} onChange={(e) => setNewCampaign({ ...newCampaign, dailyLimit: parseInt(e.target.value) })} />
                                                        </div>
                                                        <div className="grid gap-1">
                                                            <Label htmlFor="startTime" className="text-[10px] uppercase font-bold text-slate-400">Janela Abr</Label>
                                                            <Input id="startTime" type="time" className="bg-white h-8 border-slate-200 text-[12px] p-1" value={newCampaign.startTime} onChange={(e) => setNewCampaign({ ...newCampaign, startTime: e.target.value })} />
                                                        </div>
                                                        <div className="grid gap-1">
                                                            <Label htmlFor="endTime" className="text-[10px] uppercase font-bold text-slate-400">Janela Fec</Label>
                                                            <Input id="endTime" type="time" className="bg-white h-8 border-slate-200 text-[12px] p-1" value={newCampaign.endTime} onChange={(e) => setNewCampaign({ ...newCampaign, endTime: e.target.value })} />
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </div>

                                        {/* Seção 3: Estratégia de Mensagem e Reengajamento (UNIFICADA) */}
                                        <Card className="border-accent/10 shadow-none bg-white">
                                            <CardHeader className="py-2.5 px-4 border-b border-accent/5 bg-slate-50/50">
                                                <div className="flex items-center justify-between">
                                                    <CardTitle className="text-[10px] uppercase font-bold tracking-wider text-slate-600 flex items-center gap-2">
                                                        <MessageSquare className="w-3 h-3" /> Estratégia de Mensagem
                                                    </CardTitle>
                                                    <div className="flex items-center gap-4 bg-white px-3 py-1 rounded-full border border-accent/10">
                                                        <div className="flex items-center gap-2">
                                                            <input type="checkbox" className="accent-accent w-3 h-3" checked={newCampaign.reengagementEnabled} onChange={(e) => setNewCampaign({ ...newCampaign, reengagementEnabled: e.target.checked })} />
                                                            <span className="text-[10px] font-bold text-accent">Ativar Reengajamento</span>
                                                        </div>
                                                        <div className="h-3 w-[1px] bg-slate-200" />
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] text-slate-400 font-bold">TEMPO:</span>
                                                            <select className="text-[10px] font-bold bg-transparent outline-none" value={newCampaign.reengagementWaitHours} onChange={(e) => setNewCampaign({ ...newCampaign, reengagementWaitHours: parseInt(e.target.value) })} disabled={!newCampaign.reengagementEnabled}>
                                                                <option value={12}>12h</option>
                                                                <option value={24}>24h</option>
                                                                <option value={48}>48h</option>
                                                                <option value={72}>72h</option>
                                                            </select>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] text-slate-400 font-bold">TENTATIVAS:</span>
                                                            <select className="text-[10px] font-bold bg-transparent outline-none" value={newCampaign.reengagementMaxAttempts} onChange={(e) => setNewCampaign({ ...newCampaign, reengagementMaxAttempts: parseInt(e.target.value) })} disabled={!newCampaign.reengagementEnabled}>
                                                                <option value={1}>1x</option>
                                                                <option value={2}>2x</option>
                                                                <option value={3}>3x</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="p-4 space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="grid gap-1.5">
                                                        <div className="flex justify-between items-center">
                                                            <Label className="text-[10px] uppercase font-bold text-slate-400">1. Impacto Inicial</Label>
                                                            <span className="text-[8px] text-accent/60 font-mono italic">{"{{nome}}"}</span>
                                                        </div>
                                                        <textarea
                                                            placeholder="Olá {{nome}}, tudo bem? Gostaríamos de conversar sobre..."
                                                            className="flex min-h-[120px] w-full rounded-lg border border-slate-200 bg-slate-50/30 px-3 py-2 text-sm focus:ring-2 focus:ring-accent/10 outline-none transition-all"
                                                            value={newCampaign.initialMessage}
                                                            onChange={(e) => setNewCampaign({ ...newCampaign, initialMessage: e.target.value })}
                                                        />
                                                    </div>
                                                    <div className={cn("grid gap-1.5 transition-opacity duration-300", !newCampaign.reengagementEnabled && "opacity-40 grayscale")}>
                                                        <Label className="text-[10px] uppercase font-bold text-slate-400">2. Reengajamento (Opcional)</Label>
                                                        <textarea
                                                            placeholder="Olá {{nome}}, passando para saber se conseguiu ver nossa mensagem anterior..."
                                                            className="flex min-h-[120px] w-full rounded-lg border border-slate-200 bg-slate-50/30 px-3 py-2 text-sm focus:ring-2 focus:ring-accent/10 outline-none transition-all"
                                                            value={newCampaign.reengagementMessage}
                                                            onChange={(e) => setNewCampaign({ ...newCampaign, reengagementMessage: e.target.value })}
                                                            disabled={!newCampaign.reengagementEnabled}
                                                        />
                                                    </div>
                                                </div>
                                                
                                                <div className="pt-3 border-t border-slate-100 space-y-4">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="grid gap-1.5">
                                                            <Label htmlFor="templateId" className="text-[9px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
                                                                <Zap className="w-2.5 h-2.5 text-accent" /> ID Template Zenvia (Opcional)
                                                            </Label>
                                                            <Input
                                                                id="templateId"
                                                                placeholder="Ex: f1af4efa-92b5-49cd-ba91-990d69989167"
                                                                className="bg-white h-8 border-slate-200 text-xs"
                                                                value={newCampaign.templateId}
                                                                onChange={(e) => setNewCampaign({ ...newCampaign, templateId: e.target.value })}
                                                            />
                                                        </div>
                                                        <div className="grid gap-1.5">
                                                            <Label htmlFor="zenviaImageUrl" className="text-[9px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
                                                                <ImageIcon className="w-2.5 h-2.5 text-accent" /> URL da Imagem do Cabeçalho
                                                            </Label>
                                                            <Input
                                                                id="zenviaImageUrl"
                                                                placeholder="https://sua-imagem.com/foto.png"
                                                                className="bg-white h-8 border-slate-200 text-xs"
                                                                value={newCampaign.zenviaImageUrl}
                                                                onChange={(e) => setNewCampaign({ ...newCampaign, zenviaImageUrl: e.target.value })}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-1 gap-1.5">
                                                        <Label htmlFor="zenviaCtaLink" className="text-[9px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
                                                            <Link2 className="w-2.5 h-2.5 text-accent" /> Link do Botão (variavellink)
                                                        </Label>
                                                        <Input
                                                            id="zenviaCtaLink"
                                                            placeholder="https://seu-link.com/proposta"
                                                            className="bg-white h-8 border-slate-200 text-xs"
                                                            value={newCampaign.zenviaCtaLink}
                                                            onChange={(e) => setNewCampaign({ ...newCampaign, zenviaCtaLink: e.target.value })}
                                                        />
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 leading-tight italic">
                                                        Se usar um template com imagem e botão, preencha a URL da imagem e o link do botão acima.
                                                    </p>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* Seção 4: Sucesso / Conversão */}
                                        <Card className="border-emerald-500/10 shadow-none bg-emerald-50/30">
                                            <CardContent className="p-3 space-y-3">
                                                <div className="flex items-center gap-3">
                                                    <Label className="text-[10px] uppercase font-bold text-emerald-600 flex items-center gap-2 whitespace-nowrap">
                                                        <ShieldCheck className="w-3 h-3" /> Gatilhos de Sucesso:
                                                    </Label>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {[
                                                            { id: 'CLIENT_RESPONDED', label: 'Resposta' },
                                                            { id: 'LINK_SENT', label: 'Link Enviado' },
                                                            { id: 'APPOINTMENT', label: 'Agendamento' },
                                                            { id: 'SALE', label: 'Fechamento' }
                                                        ].map(opt => (
                                                            <Badge
                                                                key={opt.id}
                                                                variant={newCampaign.successCriteria.includes(opt.id) ? "default" : "outline"}
                                                                className={cn(
                                                                    "cursor-pointer px-2.5 py-0.5 text-[10px] transition-all font-bold",
                                                                    newCampaign.successCriteria.includes(opt.id) ? "bg-emerald-600 hover:bg-emerald-700 border-transparent" : "bg-white hover:bg-emerald-50 border-emerald-100 text-emerald-600/70"
                                                                )}
                                                                onClick={() => {
                                                                    const current = [...newCampaign.successCriteria];
                                                                    if (current.includes(opt.id)) {
                                                                        setNewCampaign({ ...newCampaign, successCriteria: current.filter(id => id !== opt.id) });
                                                                    } else {
                                                                        setNewCampaign({ ...newCampaign, successCriteria: [...current, opt.id] });
                                                                    }
                                                                }}
                                                            >
                                                                {opt.label}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>

                                                {newCampaign.successCriteria.includes('LINK_SENT') && (
                                                    <div className="flex items-center gap-3 p-2 bg-white rounded-md border border-emerald-100 animate-in fade-in slide-in-from-left-2">
                                                        <Label htmlFor="linkFilter" className="text-[10px] font-bold uppercase text-emerald-600/50">Termo do Link:</Label>
                                                        <Input
                                                            id="linkFilter"
                                                            placeholder="Ex: checkout, proposta"
                                                            className="h-7 text-xs border-emerald-50 focus:ring-emerald-500/10 flex-1"
                                                            value={newCampaign.successLinkFilter}
                                                            onChange={(e) => setNewCampaign({ ...newCampaign, successLinkFilter: e.target.value })}
                                                        />
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </div>

                                    <DialogFooter className="p-4 bg-slate-50 border-t border-border/50 gap-2">
                                        <Button variant="ghost" onClick={() => setIsCreateOpen(false)} className="text-slate-500 h-9 px-6">Cancelar</Button>
                                        <Button
                                            onClick={handleCreateCampaign}
                                            className="bg-accent hover:bg-accent/90 px-10 font-bold h-9 shadow-lg shadow-accent/10"
                                            disabled={!newCampaign.name || !newCampaign.agentId}
                                        >
                                            🚀 Lançar Estratégia
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        <Card className="bg-slate-500/5 border-slate-300/60">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-muted-foreground">Campanha</span>
                                    <Megaphone className="h-4 w-4 text-slate-500" />
                                </div>
                                <div className="text-2xl font-bold text-slate-700">{totalCampaigns}</div>
                                <div className="text-xs text-muted-foreground mt-1">Campanhas criadas</div>
                            </CardContent>
                        </Card>

                        <Card className="bg-blue-500/5 border-blue-500/20">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-muted-foreground">Leads Carregados</span>
                                    <Clock className="h-4 w-4 text-blue-500" />
                                </div>
                                <div className="text-2xl font-bold text-blue-600">{totalLoadedLeads}</div>
                                <div className="text-xs text-muted-foreground mt-1">Leads importados na operação</div>
                            </CardContent>
                        </Card>

                        <Card className="bg-emerald-500/5 border-emerald-500/20">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-muted-foreground">Leads válidos</span>
                                    <MessageSquare className="h-4 w-4 text-emerald-500" />
                                </div>
                                <div className="flex items-end gap-2">
                                    <div className="text-2xl font-bold text-emerald-600">{totalValidLeads}</div>
                                    <div className="pb-0.5 text-xs font-bold text-emerald-500">{totalValidPct.toFixed(1)}%</div>
                                </div>
                                <p className="text-xs text-muted-foreground">Base elegível para disparo</p>
                            </CardContent>
                        </Card>

                        <Card className="bg-red-500/5 border-red-500/20">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-muted-foreground">Inconsistentes</span>
                                    <AlertCircle className="h-4 w-4 text-red-500" />
                                </div>
                                <div className="flex items-end gap-2">
                                    <div className="text-2xl font-bold text-red-500">{totalInconsistencies}</div>
                                    <div className="pb-0.5 text-xs font-bold text-red-400">{totalInconsistenciesPct.toFixed(1)}%</div>
                                </div>
                                <p className="text-xs text-muted-foreground">Registros inválidos na importação</p>
                            </CardContent>
                        </Card>

                        <Card className="bg-emerald-500/5 border-emerald-500/20">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-muted-foreground">Links Enviados</span>
                                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                                </div>
                                <div className="flex items-end gap-2">
                                    <div className="text-2xl font-bold text-emerald-600">{totalLinksSent}</div>
                                    <div className="pb-0.5 text-xs font-bold text-emerald-500">{totalLinksSentPct.toFixed(1)}%</div>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">Conversões registradas por link</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Campaigns Table */}
                    <Card className="border-accent/10">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                Histórico de Estratégias
                                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                            </CardTitle>
                            <CardDescription>Acompanhe a performance de cada campanha cadastrada.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="flex justify-center items-center py-20">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
                                </div>
                            ) : filteredCampaigns.length === 0 ? (
                                <div className="text-center py-20">
                                    <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                                    <h3 className="text-lg font-medium">Nenhuma campanha estratégica</h3>
                                    <p className="text-muted-foreground text-sm">Crie sua primeira campanha para começar os disparos.</p>
                                </div>
                            ) : (
                                <div className="w-full rounded-xl border border-slate-100 overflow-hidden">
                                <Table className="w-full table-fixed">
                                    <TableHeader>
                                        <TableRow className="border-b-0">
                                            <TableHead rowSpan={2} className={cn(headerLeftClass, "w-[18%] align-middle rounded-tl-xl")}>Campanha / Agente</TableHead>
                                            <TableHead rowSpan={2} className={cn(headerLeftClass, "w-[9%] align-middle")}>Criada em</TableHead>
                                            <TableHead rowSpan={2} className={cn(headerCenterClass, "w-[8%] align-middle")}>Status</TableHead>
                                            <TableHead rowSpan={2} className={cn(headerCenterClass, "w-[7%] align-middle")}>Carregados</TableHead>
                                            <TableHead rowSpan={2} className={cn(headerCenterClass, "w-[8%] align-middle text-red-500")}>Inconsistentes</TableHead>
                                            <TableHead rowSpan={2} className={cn(headerCenterClass, "w-[7%] align-middle")}>Válidos</TableHead>
                                            <TableHead colSpan={2} className={cn(headerCenterClass, "w-[16%]")}>Conversas Iniciadas</TableHead>
                                            <TableHead rowSpan={2} className={cn(headerCenterClass, "w-[8%] align-middle")}>Links Enviados</TableHead>
                                            <TableHead rowSpan={2} className={cn(headerLeftClass, "w-[9%] align-middle")}>Vigência</TableHead>
                                            <TableHead rowSpan={2} className={cn(headerRightClass, "w-[10%] align-middle rounded-tr-xl")}>Ações</TableHead>
                                        </TableRow>
                                        <TableRow className="border-b border-slate-200/80">
                                            <TableHead className={cn(headerCenterClass, "w-[8%] border-t-0")}>Msgs<br />Enviadas</TableHead>
                                            <TableHead className={cn(headerCenterClass, "w-[8%] border-t-0")}>Msgs Entregues</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredCampaigns.map((campaign) => {
                                            const queueMetrics = queueMetricsByCampaign[campaign.id] || { total: 0, sent: 0, delivered: 0 };
                                            const totalLoaded = (campaign.totalContacts || 0) + (campaign.importErrorCount || 0);
                                            const validRecords = queueMetrics.total;
                                            const sentMessages = campaign.sentCount || queueMetrics.sent;
                                            const deliveredMessages = campaign.deliveredCount || queueMetrics.delivered || 0;
                                            const linksSent = campaign.conversionCount || 0;
                                            
                                            const validPct = totalLoaded > 0 ? (validRecords / totalLoaded) * 100 : 0;
                                            const sentPct = validRecords > 0 ? (sentMessages / validRecords) * 100 : 0;
                                            const deliveredPct = validRecords > 0 ? (deliveredMessages / validRecords) * 100 : 0;
                                            const linksPct = validRecords > 0 ? (linksSent / validRecords) * 100 : 0;

                                            return (
                                                <TableRow key={campaign.id} className="hover:bg-accent/5">
                                                    <TableCell className="px-3 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold leading-tight break-words">{campaign.name}</span>
                                                            <span className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                                                                <Bot className="h-3 w-3" />
                                                                {agents.find(a => a.id === campaign.agentId)?.name || 'Agente'}
                                                            </span>
                                                            <div className="mt-1">
                                                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-mono rounded-sm select-all hover:bg-slate-200 transition-colors cursor-help" title="ID da Campanha">
                                                                    {campaign.id}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="px-2 py-4">
                                                        <div className="text-xs text-muted-foreground font-medium">
                                                            {format(campaign.createdAt, "dd/MM/yyyy", { locale: ptBR })}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="px-2 py-4 text-center">{getStatusBadge(campaign.status)}</TableCell>
                                                    <TableCell className="px-2 py-4 text-center font-semibold">
                                                        {totalLoaded}
                                                    </TableCell>
                                                    <TableCell className="px-2 py-4 text-center">
                                                        <div 
                                                            className={cn(
                                                                "flex flex-col items-center cursor-pointer hover:bg-red-500/10 rounded p-1 transition-colors",
                                                                (campaign.importErrorCount || 0) > 0 ? "text-red-500 font-bold" : "text-muted-foreground opacity-50"
                                                            )}
                                                            onClick={() => handleViewImportErrors(campaign)}
                                                        >
                                                            <span className="text-sm">{campaign.importErrorCount || 0}</span>
                                                            <span className="text-[10px] uppercase">Logs</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="px-2 py-4 text-center">
                                                        <div className="flex flex-col items-center">
                                                            <span className="font-semibold text-accent">{validRecords}</span>
                                                            <span className="text-[11px] text-muted-foreground">{validPct.toFixed(0)}%</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="px-2 py-4 text-center">
                                                        <div className="flex flex-col items-center">
                                                            <span className="font-semibold text-blue-600">{sentMessages}</span>
                                                            <span className="text-[11px] text-muted-foreground">{sentPct.toFixed(0)}%</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="px-2 py-4 text-center">
                                                        <div className="flex flex-col items-center">
                                                            <span className="font-semibold text-emerald-600">{deliveredMessages}</span>
                                                            <span className="text-[11px] text-muted-foreground">{deliveredPct.toFixed(0)}%</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="px-2 py-4 text-center">
                                                        <div className="flex flex-col items-center">
                                                            <span className="font-semibold text-violet-600">{linksSent}</span>
                                                            <span className="text-[11px] text-muted-foreground">{linksPct.toFixed(1)}%</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="px-2 py-4">
                                                        <div className="text-xs space-y-1">
                                                            <div className="flex items-center gap-1">
                                                                <Clock className="h-3 w-3" />
                                                                {format(campaign.startDate, "dd MMM", { locale: ptBR })}
                                                            </div>
                                                            <div className="text-[10px] text-muted-foreground italic">Limite: {campaign.dailyLimit}/dia</div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="px-2 py-4 text-right">
                                                        <div className="flex justify-end gap-0.5">
                                                            {hasPermission('campaigns.import') && (
                                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => {
                                                                setSelectedCampaignForImport(campaign.id);
                                                                setIsImportOpen(true);
                                                            }}>
                                                                <FileUp className="h-4 w-4" />
                                                            </Button>
                                                            )}
                                                            {hasPermission('campaigns.view_contacts') && (
                                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-400" onClick={() => handleViewContacts(campaign.id)}>
                                                                <Eye className="h-4 w-4" />
                                                            </Button>
                                                            )}
                                                            {hasPermission('campaigns.edit') && (
                                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => handleOpenEdit(campaign)}>
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                            )}
                                                            {hasPermission('campaigns.pause') && (
                                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => handleTogglePause(campaign)}>
                                                                {campaign.status === 'paused' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                                                            </Button>
                                                            )}
                                                            {hasPermission('campaigns.delete') && (
                                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => handleDeleteCampaign(campaign.id)}>
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                </div>
            </div>

            {/* Import Modal */}
            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
                <DialogContent className="sm:max-w-[500px] max-h-[95vh] flex flex-col p-0 overflow-hidden border-accent/20">
                    <DialogHeader className="p-6 pb-2">
                        <DialogTitle className="text-2xl font-bold text-accent">Importar Leads</DialogTitle>
                        <DialogDescription className="text-xs">
                            Carregue arquivos .csv, .xls ou .xlsx com as informações dos seus contatos.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-2 pb-6 space-y-6 custom-scrollbar">
                        <div className="grid gap-2 text-sm">
                            <Label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Campanha de Destino</Label>
                            <Select onValueChange={setSelectedCampaignForImport} value={selectedCampaignForImport || ""}>
                                <SelectTrigger className="bg-accent/5 h-10">
                                    <SelectValue placeholder="Escolha a Campanha Ativa" />
                                </SelectTrigger>
                                <SelectContent>
                                    {campaigns.filter(c => c.status === 'active').map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-4">
                            <Label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Arquivo de Contatos</Label>
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-accent/20 rounded-xl p-8 flex flex-col items-center justify-center gap-3 bg-accent/5 hover:bg-accent/10 cursor-pointer transition-colors"
                            >
                                <FileUp className="h-8 w-8 text-accent opacity-50" />
                                <div className="text-center">
                                    <p className="text-sm font-bold">Clique para selecionar</p>
                                    <p className="text-xs text-muted-foreground mt-1">ou arraste o arquivo aqui</p>
                                </div>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept=".csv, .xlsx, .xls"
                                    onChange={handleFileUpload}
                                />
                            </div>

                            {importData.length > 0 && (
                                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                                    <div className="flex items-center justify-between p-3 bg-green-500/5 border border-green-500/15 rounded-xl text-[11px] text-green-600">
                                        <span className="flex items-center gap-1.5 font-bold">
                                            <ShieldCheck className="h-4 w-4" />
                                            {importData.length} registros prontos
                                        </span>
                                        <Button variant="ghost" size="sm" className="h-7 text-[10px] hover:bg-red-50 hover:text-red-500 font-bold" onClick={() => setImportData([])}>
                                            Limpar
                                        </Button>
                                    </div>
                                    
                                    <div className="p-4 bg-muted/30 border border-border/50 rounded-xl">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase mb-3 tracking-wider flex items-center gap-2">
                                            <Activity className="w-3 h-3" />
                                            Amostra dos Dados
                                        </p>
                                        <div className="space-y-2">
                                            {importData.slice(0, 3).map((item, i) => (
                                                <div key={i} className="flex items-center justify-between text-[11px] bg-background/80 p-2 rounded border border-border/20 shadow-sm">
                                                    <div className="min-w-0">
                                                        <div className="font-medium truncate max-w-[180px]">{item.name}</div>
                                                        <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{item.identifier}</div>
                                                    </div>
                                                    <span className="font-mono text-accent font-bold">{item.phone}</span>
                                                </div>
                                            ))}
                                            {importData.length > 3 && (
                                                <p className="text-[10px] text-center text-muted-foreground italic pt-2 border-t border-border/10">...e outros {importData.length - 3} contatos</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>


                    </div>

                    <DialogFooter className="p-6 bg-slate-50/50 border-t border-border/50 gap-3">
                        <Button variant="ghost" onClick={() => setIsImportOpen(false)} className="text-slate-500">Cancelar</Button>
                                                        <Button
                            onClick={handleImportContacts}
                            className="bg-accent hover:bg-accent/90 px-8 font-bold"
                            disabled={importData.length === 0 || !selectedCampaignForImport || isImporting}
                        >
                            {isImporting ? "Processando..." : `Importar Carga`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Campaign Modal */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="sm:max-w-[850px] max-h-[95vh] flex flex-col p-0 overflow-hidden border-accent/20">
                    <DialogHeader className="p-5 pb-2">
                        <DialogTitle className="text-xl font-bold text-accent">Editar Estratégia Outbound</DialogTitle>
                        <DialogDescription className="text-[11px]">
                            Atualize os parâmetros operacionais e estratégicos da sua campanha ativa.
                        </DialogDescription>
                    </DialogHeader>
                    {editingCampaign && (
                        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-4 custom-scrollbar pb-6">
                            {/* Seção 1: Identidade e Agente */}
                            <div className="grid grid-cols-12 gap-4 items-start">
                                <Card className="col-span-12 lg:col-span-8 border-accent/5 shadow-none bg-slate-50/50">
                                    <CardContent className="p-3 space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="grid gap-1.5">
                                                <Label htmlFor="edit-name" className="text-[10px] uppercase font-bold text-slate-400">Nome da Campanha</Label>
                                                <Input
                                                    id="edit-name"
                                                    className="bg-white h-9 border-slate-200 text-sm"
                                                    value={editingCampaign.name}
                                                    onChange={(e) => setEditingCampaign({ ...editingCampaign, name: e.target.value })}
                                                />
                                            </div>
                                            <div className="grid gap-1.5">
                                                <Label className="text-[10px] uppercase font-bold text-slate-400">Agente IA Executor</Label>
                                                <Select 
                                                    value={editingCampaign.agentId} 
                                                    onValueChange={(val) => setEditingCampaign({ ...editingCampaign, agentId: val })}
                                                >
                                                    <SelectTrigger className="bg-white h-9 border-slate-200 text-sm">
                                                        <SelectValue placeholder="Selecione..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {agents.map(agent => (
                                                            <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="edit-description" className="text-[10px] uppercase font-bold text-slate-400">Objetivo Estratégico</Label>
                                            <Input
                                                id="edit-description"
                                                className="bg-white h-9 border-slate-200 text-sm"
                                                value={editingCampaign.description || ""}
                                                onChange={(e) => setEditingCampaign({ ...editingCampaign, description: e.target.value })}
                                            />
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Seção 2: Execução (Compacta) */}
                                <Card className="col-span-12 lg:col-span-4 border-accent/5 shadow-none bg-slate-50/50">
                                    <CardContent className="p-3">
                                        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                                            <div className="grid gap-1">
                                                <Label htmlFor="edit-start" className="text-[10px] uppercase font-bold text-slate-400">Início</Label>
                                                <Input id="edit-start" type="date" className="bg-white h-8 border-slate-200 text-[12px] p-1" value={editingCampaign.startDate ? (editingCampaign.startDate instanceof Date ? editingCampaign.startDate.toISOString().split('T')[0] : editingCampaign.startDate) : ''} onChange={(e) => setEditingCampaign({ ...editingCampaign, startDate: e.target.value as any })} />
                                            </div>
                                            <div className="grid gap-1">
                                                <Label htmlFor="edit-limit" className="text-[10px] uppercase font-bold text-slate-400">Lmt Diário</Label>
                                                <Input id="edit-limit" type="number" className="bg-white h-8 border-slate-200 text-[12px] p-1" value={editingCampaign.dailyLimit} onChange={(e) => setEditingCampaign({ ...editingCampaign, dailyLimit: parseInt(e.target.value) })} />
                                            </div>
                                            <div className="grid gap-1">
                                                <Label htmlFor="edit-startTime" className="text-[10px] uppercase font-bold text-slate-400">Janela Abr</Label>
                                                <Input id="edit-startTime" type="time" className="bg-white h-8 border-slate-200 text-[12px] p-1" value={editingCampaign.startTime || "09:00"} onChange={(e) => setEditingCampaign({ ...editingCampaign, startTime: e.target.value })} />
                                            </div>
                                            <div className="grid gap-1">
                                                <Label htmlFor="edit-endTime" className="text-[10px] uppercase font-bold text-slate-400">Janela Fec</Label>
                                                <Input id="edit-endTime" type="time" className="bg-white h-8 border-slate-200 text-[12px] p-1" value={editingCampaign.endTime || "18:00"} onChange={(e) => setEditingCampaign({ ...editingCampaign, endTime: e.target.value })} />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Seção 3: Estratégia de Mensagem e Reengajamento (UNIFICADA) */}
                            <Card className="border-accent/10 shadow-none bg-white">
                                <CardHeader className="py-2.5 px-4 border-b border-accent/5 bg-slate-50/50">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-[10px] uppercase font-bold tracking-wider text-slate-600 flex items-center gap-2">
                                            <MessageSquare className="w-3 h-3" /> Estratégia de Mensagem
                                        </CardTitle>
                                        <div className="flex items-center gap-4 bg-white px-3 py-1 rounded-full border border-accent/10">
                                            <div className="flex items-center gap-2">
                                                <input type="checkbox" className="accent-accent w-3 h-3" checked={editingCampaign.reengagementEnabled || false} onChange={(e) => setEditingCampaign({ ...editingCampaign, reengagementEnabled: e.target.checked })} />
                                                <span className="text-[10px] font-bold text-accent">Ativar Reengajamento</span>
                                            </div>
                                            <div className="h-3 w-[1px] bg-slate-200" />
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-slate-400 font-bold">TEMPO:</span>
                                                <select className="text-[10px] font-bold bg-transparent outline-none" value={editingCampaign.reengagementWaitHours || 24} onChange={(e) => setEditingCampaign({ ...editingCampaign, reengagementWaitHours: parseInt(e.target.value) })} disabled={!editingCampaign.reengagementEnabled}>
                                                    <option value={12}>12h</option>
                                                    <option value={24}>24h</option>
                                                    <option value={48}>48h</option>
                                                    <option value={72}>72h</option>
                                                </select>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-slate-400 font-bold">TENTATIVAS:</span>
                                                <select className="text-[10px] font-bold bg-transparent outline-none" value={editingCampaign.reengagementMaxAttempts || 1} onChange={(e) => setEditingCampaign({ ...editingCampaign, reengagementMaxAttempts: parseInt(e.target.value) })} disabled={!editingCampaign.reengagementEnabled}>
                                                    <option value={1}>1x</option>
                                                    <option value={2}>2x</option>
                                                    <option value={3}>3x</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-1.5">
                                            <div className="flex justify-between items-center">
                                                <Label className="text-[10px] uppercase font-bold text-slate-400">1. Impacto Inicial</Label>
                                                <span className="text-[8px] text-accent/60 font-mono italic">{"{{nome}}"}</span>
                                            </div>
                                            <textarea
                                                className="flex min-h-[120px] w-full rounded-lg border border-slate-200 bg-slate-50/30 px-3 py-2 text-sm focus:ring-2 focus:ring-accent/10 outline-none transition-all"
                                                value={editingCampaign.initialMessage || ""}
                                                onChange={(e) => setEditingCampaign({ ...editingCampaign, initialMessage: e.target.value })}
                                            />
                                        </div>
                                        <div className={cn("grid gap-1.5 transition-opacity duration-300", !editingCampaign.reengagementEnabled && "opacity-40 grayscale")}>
                                            <Label className="text-[10px] uppercase font-bold text-slate-400">2. Reengajamento (Opcional)</Label>
                                            <textarea
                                                className="flex min-h-[120px] w-full rounded-lg border border-slate-200 bg-slate-50/30 px-3 py-2 text-sm focus:ring-2 focus:ring-accent/10 outline-none transition-all"
                                                value={editingCampaign.reengagementMessage || ""}
                                                onChange={(e) => setEditingCampaign({ ...editingCampaign, reengagementMessage: e.target.value })}
                                                disabled={!editingCampaign.reengagementEnabled}
                                            />
                                        </div>
                                    </div>
                                    
                                    <div className="pt-3 border-t border-slate-100 space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="grid gap-1.5">
                                                <Label htmlFor="edit-templateId" className="text-[9px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
                                                    <Zap className="w-2.5 h-2.5 text-accent" /> ID Template Zenvia (Opcional)
                                                </Label>
                                                <Input
                                                    id="edit-templateId"
                                                    placeholder="Ex: f1af4efa-92b5-49cd-ba91-990d69989167"
                                                    className="bg-white h-8 border-slate-200 text-xs"
                                                    value={editingCampaign.metadata?.template_id || ""}
                                                    onChange={(e) => setEditingCampaign({ ...editingCampaign, metadata: { ...editingCampaign.metadata, template_id: e.target.value } })}
                                                />
                                            </div>
                                            <div className="grid gap-1.5">
                                                <Label htmlFor="edit-imageUrl" className="text-[9px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
                                                    <ImageIcon className="w-2.5 h-2.5 text-accent" /> URL da Imagem do Cabeçalho
                                                </Label>
                                                <Input
                                                    id="edit-imageUrl"
                                                    placeholder="https://sua-imagem.com/foto.png"
                                                    className="bg-white h-8 border-slate-200 text-xs"
                                                    value={editingCampaign.metadata?.zenvia_image_url || ""}
                                                    onChange={(e) => setEditingCampaign({ ...editingCampaign, metadata: { ...editingCampaign.metadata, zenvia_image_url: e.target.value } })}
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-1.5">
                                            <Label htmlFor="edit-ctaLink" className="text-[9px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
                                                <Link2 className="w-2.5 h-2.5 text-accent" /> Link do Botão (variavellink)
                                            </Label>
                                            <Input
                                                id="edit-ctaLink"
                                                placeholder="https://seu-link.com/proposta"
                                                className="bg-white h-8 border-slate-200 text-xs"
                                                value={editingCampaign.metadata?.zenvia_cta_link || ""}
                                                onChange={(e) => setEditingCampaign({ ...editingCampaign, metadata: { ...editingCampaign.metadata, zenvia_cta_link: e.target.value } })}
                                            />
                                        </div>
                                        <p className="text-[10px] text-slate-400 leading-tight italic">
                                            Certifique-se de preencher a URL da imagem e o link do botão se estiver usando um template de mídia.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Seção 4: Sucesso / Conversão */}
                            <Card className="border-emerald-500/10 shadow-none bg-emerald-50/30">
                                <CardContent className="p-3 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <Label className="text-[10px] uppercase font-bold text-emerald-600 flex items-center gap-2 whitespace-nowrap">
                                            <ShieldCheck className="w-3 h-3" /> Gatilhos de Sucesso:
                                        </Label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {[
                                                { id: 'CLIENT_RESPONDED', label: 'Resposta' },
                                                { id: 'LINK_SENT', label: 'Link Enviado' },
                                                { id: 'APPOINTMENT', label: 'Agendamento' },
                                                { id: 'SALE', label: 'Fechamento' }
                                            ].map(opt => (
                                                <Badge
                                                    key={opt.id}
                                                    variant={editingCampaign.successCriteria.includes(opt.id) ? "default" : "outline"}
                                                    className={cn(
                                                        "cursor-pointer px-2.5 py-0.5 text-[10px] transition-all font-bold",
                                                        editingCampaign.successCriteria.includes(opt.id) ? "bg-emerald-600 hover:bg-emerald-700 border-transparent" : "bg-white hover:bg-emerald-50 border-emerald-100 text-emerald-600/70"
                                                    )}
                                                    onClick={() => {
                                                        const current = [...editingCampaign.successCriteria];
                                                        if (current.includes(opt.id)) {
                                                            setEditingCampaign({ ...editingCampaign, successCriteria: current.filter(id => id !== opt.id) });
                                                        } else {
                                                            setEditingCampaign({ ...editingCampaign, successCriteria: [...current, opt.id] });
                                                        }
                                                    }}
                                                >
                                                    {opt.label}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>

                                    {editingCampaign.successCriteria.includes('LINK_SENT') && (
                                        <div className="flex items-center gap-3 p-2 bg-white rounded-md border border-emerald-100 animate-in fade-in slide-in-from-left-2">
                                            <Label htmlFor="edit-linkFilter" className="text-[10px] font-bold uppercase text-emerald-600/50">Termo do Link:</Label>
                                            <Input
                                                id="edit-linkFilter"
                                                placeholder="Ex: checkout, proposta"
                                                className="h-7 text-xs border-emerald-50 focus:ring-emerald-500/10 flex-1"
                                                value={editingCampaign.successLinkFilter || ""}
                                                onChange={(e) => setEditingCampaign({ ...editingCampaign, successLinkFilter: e.target.value })}
                                            />
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    )}
                    <DialogFooter className="p-4 bg-slate-50 border-t border-border/50 gap-2">
                        <Button variant="ghost" onClick={() => setIsEditOpen(false)} className="text-slate-500 h-9 px-6">Cancelar</Button>
                        <Button onClick={handleUpdateCampaign} className="bg-accent hover:bg-accent/90 px-10 font-bold h-9 shadow-lg shadow-accent/10">
                            💾 Salvar Alterações
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* View Contacts Modal */}
            <Dialog open={isContactsViewOpen} onOpenChange={setIsContactsViewOpen}>
                <DialogContent className="sm:max-w-[1000px] max-h-[80vh] flex flex-col p-6 border-accent/20">
                    <DialogHeader>
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-xl font-bold flex items-center gap-2">
                                <Users className="h-5 w-5 text-accent" />
                                Lista de Contatos da Campanha ({processedContacts.length})
                            </DialogTitle>
                        </div>
                        <DialogDescription>
                            Visualize todos os leads importados e o status atual do processo.
                        </DialogDescription>

                        <div className="mt-4">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar por razão social, nome, CNPJ ou telefone..."
                                    className="pl-8 bg-accent/5 border-accent/20"
                                    value={contactSearch}
                                    onChange={(e) => setContactSearch(e.target.value)}
                                />
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto min-h-[300px] py-4 pr-1">
                        {isLoadingContacts ? (
                            <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
                                <Clock className="h-5 w-5 animate-spin" />
                                Carregando base de contatos...
                            </div>
                        ) : viewContacts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground opacity-50">
                                <Users className="h-12 w-12" />
                                <p>Nenhum contato encontrado nesta campanha.</p>
                            </div>
                        ) : processedContacts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground opacity-50">
                                <Search className="h-12 w-12" />
                                <p>Nenhum contato encontrado com este filtro.</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead
                                            className="cursor-pointer hover:text-accent select-none"
                                            onClick={() => requestSort('establishmentName')}
                                        >
                                            <div className="flex items-center">
                                                Razão Social {getSortIcon('establishmentName')}
                                            </div>
                                        </TableHead>
                                        <TableHead
                                            className="cursor-pointer hover:text-accent select-none"
                                            onClick={() => requestSort('cnpj')}
                                        >
                                            <div className="flex items-center">
                                                CNPJ {getSortIcon('cnpj')}
                                            </div>
                                        </TableHead>
                                        <TableHead
                                            className="cursor-pointer hover:text-accent select-none"
                                            onClick={() => requestSort('contactName')}
                                        >
                                            <div className="flex items-center">
                                                Nome {getSortIcon('contactName')}
                                            </div>
                                        </TableHead>
                                        <TableHead
                                            className="cursor-pointer hover:text-accent select-none"
                                            onClick={() => requestSort('contactPhone')}
                                        >
                                            <div className="flex items-center">
                                                Telefone {getSortIcon('contactPhone')}
                                            </div>
                                        </TableHead>
                                        <TableHead
                                            className="cursor-pointer hover:text-accent select-none"
                                            onClick={() => requestSort('status')}
                                        >
                                            <div className="flex items-center">
                                                Status {getSortIcon('status')}
                                            </div>
                                        </TableHead>


                                        <TableHead>Detalhes do Erro</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {processedContacts.map((contact, index) => (
                                        <TableRow key={`${contact.id}-${index}`} className={`hover:bg-accent/5 ${contact.status === 'failed' ? 'bg-red-500/5' : ''}`}>
                                            <TableCell className="font-medium text-xs">{contact.establishmentName || contact.metadata?.razao_social || "Sem Razão Social"}</TableCell>
                                            <TableCell className="text-xs font-mono">{contact.cnpj || contact.metadata?.cnpj || "-"}</TableCell>
                                            <TableCell className="font-medium text-xs">{contact.contactName || "Sem Nome"}</TableCell>
                                            <TableCell className="text-xs">{contact.contactPhone}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={`text-[10px] ${['sent', 'delivered', 'read'].includes(contact.status) ? 'border-green-500 text-green-500' :
                                                    contact.status === 'failed' ? 'border-red-500 text-red-500' :
                                                        'border-amber-500 text-amber-500'
                                                    }`}>
                                                    {contact.status === 'pending' ? 'Pendente' :
                                                        contact.status === 'sent' ? 'Enviado' :
                                                            contact.status === 'delivered' ? 'Entregue' :
                                                                contact.status === 'read' ? 'Lida' :
                                                                    contact.status === 'failed' ? 'Falhou' : contact.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate" title={contact.errorMessage || ""}>
                                                {contact.errorMessage ? (
                                                    <span className="text-red-400 flex items-center gap-1">
                                                        <AlertCircle className="h-3 w-3" />
                                                        {contact.errorMessage}
                                                    </span>
                                                ) : (
                                                    <span className="opacity-50">-</span>
                                                )}
                                            </TableCell>

                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                    <div className="pt-4 border-t border-accent/10">
                        <Button className="w-full" onClick={() => setIsContactsViewOpen(false)}>Fechar Listagem</Button>
                    </div>
                </DialogContent>
            </Dialog>
            {/* Import Errors Slide-over */}
            <Sheet open={isImportErrorsOpen} onOpenChange={setIsImportErrorsOpen}>
                <SheetContent className="sm:max-w-[500px] border-l border-accent/20">
                    <SheetHeader className="mb-6">
                        <SheetTitle className="text-2xl font-bold flex items-center gap-2 text-foreground">
                            <AlertCircle className="h-6 w-6 text-red-500" />
                            Inconsistências na Importação
                        </SheetTitle>
                        <SheetDescription>
                            Logs detalhados de problemas encontrados no arquivo de <strong>{selectedCampaignForErrors?.name}</strong>.
                        </SheetDescription>
                    </SheetHeader>

                    {isLoadingErrors ? (
                        <div className="flex flex-col items-center justify-center h-64 gap-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
                            <p className="text-sm text-muted-foreground font-medium">Analisando logs de auditoria...</p>
                        </div>
                    ) : importErrors.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center p-8 bg-green-500/5 rounded-xl border border-green-500/10 hover:bg-green-500/10 transition-all">
                            {selectedCampaignForErrors?.importErrorCount ? (
                                <>
                                    <AlertCircle className="h-12 w-12 text-amber-500 mb-4 opacity-70" />
                                    <h3 className="text-lg font-bold text-amber-700">Logs indisponíveis</h3>
                                    <p className="text-sm text-amber-700/80">
                                        Esta campanha possui inconsistências registradas, mas os detalhes não puderam ser carregados para o usuário atual.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <ShieldCheck className="h-12 w-12 text-green-500 mb-4 opacity-50" />
                                    <h3 className="text-lg font-bold text-green-700">Tudo limpo!</h3>
                                    <p className="text-sm text-green-600/80">Nenhuma inconsistência foi registrada para esta campanha até o momento.</p>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-200px)] pr-2 scrollbar-thin scrollbar-thumb-accent/20 scrollbar-track-transparent">
                            <div className="sticky top-0 bg-background/80 backdrop-blur-sm z-10 py-1 mb-2 flex items-center justify-between gap-3">
                                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                    <Clock className="w-3 h-3" /> Registros de Auditoria ({importErrors.length})
                                </p>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 border-accent/20 text-accent hover:bg-accent/5"
                                    onClick={handleDownloadImportErrors}
                                >
                                    <Download className="h-4 w-4 mr-2" />
                                    Baixar Excel
                                </Button>
                            </div>
                            {importErrors.map((log) => (
                                <div key={log.id} className="p-4 bg-muted/30 border border-border/50 rounded-xl hover:border-red-500/30 hover:bg-red-500/5 transition-all group relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-100 transition-opacity">
                                        <AlertCircle className="h-4 w-4 text-red-500" />
                                    </div>
                                    <div className="flex items-start justify-between mb-3">
                                        <Badge variant="outline" className={cn(
                                            "text-[9px] px-1.5 py-0 h-4 border-none font-bold uppercase tracking-tight",
                                            log.errorType === 'INVALID_PHONE' ? 'bg-red-500 text-white' : 
                                            log.errorType === 'DUPLICATE' ? 'bg-amber-500 text-white' : 'bg-slate-500 text-white'
                                        )}>
                                            {log.errorType === 'INVALID_PHONE' ? 'Tel Inválido' : 
                                             log.errorType === 'DUPLICATE' ? 'Duplicado' : 'Erro'}
                                        </Badge>
                                        <span className="text-[10px] font-mono text-muted-foreground bg-muted p-1 px-2 rounded-md group-hover:text-red-500 transition-colors">LINHA {log.rowNumber}</span>
                                    </div>
                                    <div className="space-y-2">
                                        <div>
                                            <p className="text-xs font-bold text-foreground/80 truncate mb-1">DADO CARREGADO:</p>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">{log.contactName || "Sem Nome"}</span>
                                                <span className="text-xs text-muted-foreground opacity-50">•</span>
                                                <span className="text-[11px] font-mono font-bold text-accent">{log.contactPhone || "Vazio"}</span>
                                            </div>
                                        </div>
                                        <div className="pt-2 border-t border-border/10">
                                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                <span className="font-bold text-red-500/70 mr-1">MOTIVO:</span>
                                                {log.errorMessage}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </SheetContent>
            </Sheet>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent className="max-w-[400px]">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-red-600 flex items-center gap-2">
                            <Trash2 className="h-5 w-5" />
                            Excluir Campanha
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-3 pt-2">
                            <p>Esta ação é <strong>irreversível</strong> e apagará:</p>
                            <ul className="text-xs list-disc list-inside space-y-1 bg-muted/50 p-2 rounded-md border border-border/10">
                                <li>Campanha: <span className="font-bold text-foreground">{campaignToDelete?.name}</span></li>
                                <li>Todos os leads importados</li>
                                <li>Fila de disparos e logs de execução</li>
                            </ul>
                            <p className="text-[11px] text-muted-foreground italic">
                                * As conversas e métricas financeiras serão preservadas.
                            </p>
                            <div className="pt-2">
                                <Label className="text-[11px] font-bold mb-1.5 block">DIGITE <span className="text-red-500">EXCLUIR</span> PARA CONFIRMAR:</Label>
                                <Input 
                                    placeholder="EXCLUIR" 
                                    value={deleteConfirmationInput}
                                    onChange={(e) => setDeleteConfirmationInput(e.target.value.toUpperCase())}
                                    className="h-9 border-red-200 focus-visible:ring-red-500 uppercase font-bold text-center tracking-widest"
                                    autoFocus
                                />
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                confirmDeleteCampaign();
                            }}
                            disabled={deleteConfirmationInput !== "EXCLUIR" || isDeleting}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold"
                        >
                            {isDeleting ? "Excluindo..." : "EXCLUIR AGORA"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

        </MainLayout >
    );
}
