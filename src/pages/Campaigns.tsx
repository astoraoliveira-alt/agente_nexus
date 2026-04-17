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
    Activity
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
        "Olá! Sou a Sofia, assistente virtual da Ticket.\n\n" +
        "*Essa é a oportunidade perfeita para você garantir crédito com as melhores condições do mercado!*\n\n" +
        "A nova parceria entre Ticket e Fiserv Capital, líder global em tecnologia de pagamentos, oferece aos clientes Ticket *Capital de Giro facilitado* para pagar despesas fixas, garantir mais previsibilidade financeira e investir no crescimento do seu negócio. Tudo isso garantindo *condições exclusivas*:\n\n" +
        "✅ Taxas a partir de *1,89% a.m*\n" +
        "✅ Crédito disponível entre *10 mil e 500 mil reais*\n" +
        "✅ Recebimento do dinheiro em até *24h*\n" +
        "✅ O único bem que você usa como garantia são *seus recebíveis* (débito, crédito e voucher Ticket)!\n\n" +
        "*Posso enviar o link para análise?*";

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
        successCriteria: ['LINK_SENT'] as string[],
        successLinkFilter: "fiservcapital",
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
                startDate: new Date(newCampaign.startDate),
                endDate: newCampaign.endDate ? new Date(newCampaign.endDate) : undefined,
                startTime: newCampaign.startTime,
                endTime: newCampaign.endTime,
                initialMessage: normalizeMessagingText(newCampaign.initialMessage),
                dailyLimit: newCampaign.dailyLimit,
                successCriteria: newCampaign.successCriteria,
                successLinkFilter: newCampaign.successCriteria.includes('LINK_SENT') ? newCampaign.successLinkFilter : undefined,
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
                successCriteria: ['LINK_SENT'],
                successLinkFilter: "fiservcapital",
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

        const firstRow = Array.from(rows[0] || [], normalizeHeader);
        const hasHeader = firstRow.some(c =>
            c.includes('cnpj') ||
            c.includes('whatsapp') ||
            c.includes('telefone') ||
            c.includes('phone') ||
            c.includes('razao social') ||
            c.includes('nome') ||
            c === 'link' ||
            c.includes('cta')
        );

        if (hasHeader) {
            identifierIdx = firstRow.findIndex(c => c.includes('cnpj') || c.includes('cpf') || c.includes('documento') || c.includes('identifier'));
            phoneIdx = firstRow.findIndex(c => c.includes('tel') || c.includes('phone') || c.includes('cel') || c.includes('whatsapp'));
            nameIdx = firstRow.findIndex(c => c.includes('razao social') || c.includes('nome') || c.includes('name') || c.includes('empresa') || c.includes('estabelecimento'));
            ctaLinkIdx = firstRow.findIndex(c => c === 'link' || c.includes('cta') || c.includes('url'));
            startRow = 1; // Pula o cabeçalho

            if (identifierIdx === -1) identifierIdx = 0;
            if (phoneIdx === -1) phoneIdx = 1;
            if (nameIdx === -1) nameIdx = 2;
            if (ctaLinkIdx === -1) ctaLinkIdx = 3;
        }

        const processed = rows.slice(startRow).map((row, idx) => {
            const identifier = row[identifierIdx] ? String(row[identifierIdx]).trim() : "";
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
                const cleanIdentifier = rawIdentifier.replace(/\D/g, '');
                
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

                const linkCnpj = getLinkCnpj(sanitizedLink);
                if (sanitizedLink && linkCnpj && linkCnpj !== cleanIdentifier) {
                    importLogs.push({
                        campaignId: campaign.id,
                        tenantId: currentTenant.id,
                        rowNumber: item.rowNumber,
                        contactName: item.name,
                        contactPhone: rawPhone,
                        errorType: 'OTHER',
                        errorMessage: `O LINK da linha pertence ao CNPJ ${linkCnpj} e não ao CNPJ ${cleanIdentifier}.`,
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
                        cta_link: item.ctaLink || null,
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

    const handleDeleteCampaign = async (id: string) => {
        if (!confirm("Tem certeza que deseja excluir esta campanha? Esta ação é irreversível.")) return;
        try {
            await api.deleteCampaign(id);
            toast({
                title: "Campanha excluída",
                description: "A campanha e sua fila foram removidas com sucesso.",
            });
            loadData();
        } catch (error) {
            toast({
                title: "Erro ao excluir",
                description: "Não foi possível remover a campanha.",
                variant: "destructive",
            });
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
                agentId: editingCampaign.agentId,
                successCriteria: editingCampaign.successCriteria,
                successLinkFilter: editingCampaign.successLinkFilter,
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
                                <DialogContent className="sm:max-w-[600px] max-h-[95vh] flex flex-col p-0 overflow-hidden border-accent/20">
                                    <DialogHeader className="p-6 pb-2">
                                        <DialogTitle className="text-2xl font-bold text-accent">Criar Campanha</DialogTitle>
                                        <DialogDescription className="text-xs">
                                            Configure os parâmetros operacionais da sua campanha de automação inteligente.
                                        </DialogDescription>
                                    </DialogHeader>
                                    
                                    <div className="flex-1 overflow-y-auto px-6 py-2 space-y-5 custom-scrollbar">
                                        {/* Seção 1: Identificação */}
                                        <div className="space-y-4">
                                            <div className="grid gap-2">
                                                <Label htmlFor="name" className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Nome da Campanha</Label>
                                                <Input
                                                    id="name"
                                                    placeholder="Ex: Reengajamento - Leads Janeiro"
                                                    className="bg-accent/5 h-10"
                                                    value={newCampaign.name}
                                                    onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                                                />
                                            </div>
                                            
                                            <div className="grid gap-2">
                                                <Label htmlFor="agent" className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Agente de IA Executor</Label>
                                                <Select value={newCampaign.agentId} onValueChange={(v) => setNewCampaign({ ...newCampaign, agentId: v })}>
                                                    <SelectTrigger className="bg-accent/5 h-10">
                                                        <SelectValue placeholder="Selecione o cérebro da campanha..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {agents.map(agent => (
                                                            <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* Seção 2: Cadência e Cronograma */}
                                        <div className="grid grid-cols-2 gap-4 pb-4 border-b border-accent/5">
                                            <div className="grid gap-2">
                                                <Label htmlFor="limit" className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Limite Diário (Novos)</Label>
                                                <div className="relative">
                                                    <Zap className="absolute left-3 top-2.5 h-4 w-4 text-accent/50" />
                                                    <Input
                                                        id="limit"
                                                        type="number"
                                                        className="bg-accent/5 pl-9 h-10"
                                                        value={newCampaign.dailyLimit}
                                                        onChange={(e) => setNewCampaign({ ...newCampaign, dailyLimit: parseInt(e.target.value) })}
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="start" className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Data de Início</Label>
                                                <Input
                                                    id="start"
                                                    type="date"
                                                    className="bg-accent/5 h-10"
                                                    value={newCampaign.startDate}
                                                    onChange={(e) => setNewCampaign({ ...newCampaign, startDate: e.target.value })}
                                                />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="startTime" className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Janela: Início</Label>
                                                <Input
                                                    id="startTime"
                                                    type="time"
                                                    className="bg-accent/5 h-10"
                                                    value={newCampaign.startTime}
                                                    onChange={(e) => setNewCampaign({ ...newCampaign, startTime: e.target.value })}
                                                />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="endTime" className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Janela: Fim</Label>
                                                <Input
                                                    id="endTime"
                                                    type="time"
                                                    className="bg-accent/5 h-10"
                                                    value={newCampaign.endTime}
                                                    onChange={(e) => setNewCampaign({ ...newCampaign, endTime: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        {/* Seção 3: Mensagem e Criativo */}
                                        <div className="space-y-4">
                                            <div className="grid gap-2">
                                                <div className="flex justify-between items-end">
                                                    <Label htmlFor="message" className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Mensagem Inicial</Label>
                                                    <span className="text-[9px] text-accent/70 font-mono italic">Variável: {"{{nome}}"}</span>
                                                </div>
                                                <textarea
                                                    id="message"
                                                    placeholder="Olá {{nome}}, tudo bem? Gostaríamos de conversar sobre..."
                                                    className="flex min-h-[80px] w-full rounded-md border border-input bg-accent/5 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                                    value={newCampaign.initialMessage}
                                                    onChange={(e) => setNewCampaign({ ...newCampaign, initialMessage: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        {/* Seção 4: Critérios de Sucesso (Compacto) */}
                                        <div className="p-4 bg-accent/5 rounded-xl border border-accent/10 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-[10px] uppercase font-bold tracking-wider text-slate-600 flex items-center gap-2">
                                                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                                                    Sucesso (Conversão)
                                                </Label>
                                                <Badge variant="outline" className="text-[8px] border-emerald-500/30 text-emerald-600">Obrigatório</Badge>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
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
                                                            "cursor-pointer px-3 py-1 text-[11px] transition-all",
                                                            newCampaign.successCriteria.includes(opt.id) ? "bg-emerald-600 hover:bg-emerald-700 border-transparent shadow-sm shadow-emerald-200" : "hover:bg-accent/10 border-slate-200 text-slate-500"
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

                                            {newCampaign.successCriteria.includes('LINK_SENT') && (
                                                <div className="mt-2 space-y-1.5 animate-in slide-in-from-top-1">
                                                    <Label htmlFor="linkFilter" className="text-[9px] font-bold uppercase text-slate-400">Termo para Gatilho (Ex: checkout, link, proposta)</Label>
                                                    <Input
                                                        id="linkFilter"
                                                        placeholder="Ex: fiservcapital"
                                                        className="h-8 text-xs bg-white border-emerald-100"
                                                        value={newCampaign.successLinkFilter}
                                                        onChange={(e) => setNewCampaign({ ...newCampaign, successLinkFilter: e.target.value })}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        <div className="grid gap-2 pb-4">
                                            <Label htmlFor="description" className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Objetivo (Opcional)</Label>
                                            <Input
                                                id="description"
                                                placeholder="Breve descrição da meta..."
                                                className="bg-accent/5 h-10 mb-4"
                                                value={newCampaign.description}
                                                onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <DialogFooter className="p-6 bg-slate-50/50 border-t border-border/50 gap-3">
                                        <Button variant="ghost" onClick={() => setIsCreateOpen(false)} className="text-slate-500">Cancelar</Button>
                                        <Button onClick={handleCreateCampaign} className="bg-accent hover:bg-accent/90 px-8 font-bold">Salvar Estratégia</Button>
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
                            <CardTitle>Histórico de Estratégias</CardTitle>
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
                                            const queueMetrics = queueMetricsByCampaign[campaign.id] || { total: 0, sent: 0 };
                                            const validRecords = queueMetrics.total;
                                            const totalLoaded = validRecords + (campaign.importErrorCount || 0);
                                            const sent = campaign.sentCount || 0;
                                            const queuedMessages = queueMetrics.total;
                                            const delivered = queueMetrics.sent;
                                            const linksSent = campaign.conversionCount || 0;
                                            
                                            const validPct = validRecords > 0 ? 100 : 0;
                                            const sentPct = validRecords > 0 ? (sent / validRecords) * 100 : 0;
                                            const queuedPct = validRecords > 0 ? (queuedMessages / validRecords) * 100 : 0;
                                            const deliveredPct = validRecords > 0 ? (delivered / validRecords) * 100 : 0;
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
                                                            <span className="font-semibold">{queuedMessages}</span>
                                                            <span className="text-[11px] text-muted-foreground">{queuedPct.toFixed(0)}%</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="px-2 py-4 text-center">
                                                        <div className="flex flex-col items-center">
                                                            <span className="font-semibold text-emerald-600">{delivered}</span>
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

                        <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-2">
                            <h4 className="text-[10px] font-bold uppercase text-amber-700 flex items-center gap-2">
                                <AlertCircle className="h-3 w-3" /> 
                                Segurança de Formato
                            </h4>
                            <ul className="text-[10px] text-slate-600 space-y-1.5 list-none pl-1">
                                <li className="flex gap-2"><span>•</span> <span>O sistema remove automaticamente parênteses, traços e espaços.</span></li>
                                <li className="flex gap-2"><span>•</span> <span>Certifique-se de incluir o código do país (DDI 55 para Brasil).</span></li>
                                <li className="flex gap-2"><span>•</span> <span>Para este tenant, a planilha deve seguir o padrão: CNPJ, Whatsapp, Razão Social e LINK.</span></li>
                            </ul>
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
                <DialogContent className="sm:max-w-[600px] max-h-[95vh] flex flex-col p-0 overflow-hidden border-accent/20">
                    <DialogHeader className="p-6 pb-2">
                        <DialogTitle className="text-2xl font-bold text-accent">Editar Estratégia Outbound</DialogTitle>
                        <DialogDescription className="text-xs">
                            Atualize os parâmetros operacionais da sua campanha ativa.
                        </DialogDescription>
                    </DialogHeader>
                    {editingCampaign && (
                        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-5 custom-scrollbar">
                            <div className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-name" className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Nome da Campanha</Label>
                                    <Input
                                        id="edit-name"
                                        className="bg-accent/5 h-10"
                                        value={editingCampaign.name}
                                        onChange={(e) => setEditingCampaign({ ...editingCampaign, name: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Agente Executor</Label>
                                    <Select 
                                        value={editingCampaign.agentId} 
                                        onValueChange={(val) => setEditingCampaign({ ...editingCampaign, agentId: val })}
                                    >
                                        <SelectTrigger className="bg-accent/5 h-10">
                                            <SelectValue placeholder="Selecione o agente" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {agents.map(agent => (
                                                <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pb-4 border-b border-accent/5">
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-limit" className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Limite Diário</Label>
                                    <Input
                                        id="edit-limit"
                                        type="number"
                                        className="bg-accent/5 h-10"
                                        value={editingCampaign.dailyLimit}
                                        onChange={(e) => setEditingCampaign({ ...editingCampaign, dailyLimit: parseInt(e.target.value) })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-start" className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Data de Início</Label>
                                    <Input
                                        id="edit-start"
                                        type="date"
                                        className="bg-accent/5 h-10"
                                        value={format(new Date(editingCampaign.startDate), "yyyy-MM-dd")}
                                        onChange={(e) => setEditingCampaign({ ...editingCampaign, startDate: new Date(e.target.value) })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-startTime" className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Janela Início</Label>
                                    <Input
                                        id="edit-startTime"
                                        type="time"
                                        className="bg-accent/5 h-10"
                                        value={editingCampaign.startTime || "09:00"}
                                        onChange={(e) => setEditingCampaign({ ...editingCampaign, startTime: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-endTime" className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Janela Fim</Label>
                                    <Input
                                        id="edit-endTime"
                                        type="time"
                                        className="bg-accent/5 h-10"
                                        value={editingCampaign.endTime || "18:00"}
                                        onChange={(e) => setEditingCampaign({ ...editingCampaign, endTime: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-message" className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Mensagem Inicial</Label>
                                    <textarea
                                        id="edit-message"
                                        className="flex min-h-[100px] w-full rounded-md border border-input bg-accent/5 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        value={editingCampaign.initialMessage || ""}
                                        onChange={(e) => setEditingCampaign({ ...editingCampaign, initialMessage: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-description" className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Descrição / Objetivo</Label>
                                    <Input
                                        id="edit-description"
                                        className="bg-accent/5 h-10"
                                        value={editingCampaign.description || ""}
                                        onChange={(e) => setEditingCampaign({ ...editingCampaign, description: e.target.value })}
                                    />
                                </div>

                                {/* Seção: Critérios de Sucesso (Compacto) */}
                                <div className="p-4 bg-accent/5 rounded-xl border border-accent/10 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[10px] uppercase font-bold tracking-wider text-slate-600 flex items-center gap-2">
                                            <ShieldCheck className="w-3 h-3 text-emerald-500" />
                                            Critérios de Sucesso
                                        </Label>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { id: 'CLIENT_RESPONDED', label: 'Resposta' },
                                            { id: 'LINK_SENT', label: 'Link Enviado' },
                                            { id: 'APPOINTMENT', label: 'Agendamento' },
                                            { id: 'SALE', label: 'Fechamento' }
                                        ].map(opt => (
                                            <Badge
                                                key={opt.id}
                                                variant={(editingCampaign.successCriteria || []).includes(opt.id) ? "default" : "outline"}
                                                className={cn(
                                                    "cursor-pointer px-3 py-1 text-[11px] transition-all",
                                                    (editingCampaign.successCriteria || []).includes(opt.id) ? "bg-emerald-600 hover:bg-emerald-700 border-transparent shadow-sm shadow-emerald-200" : "hover:bg-accent/10 border-slate-200 text-slate-500"
                                                )}
                                                onClick={() => {
                                                    const current = [...(editingCampaign.successCriteria || [])];
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

                                    {(editingCampaign.successCriteria || []).includes('LINK_SENT') && (
                                        <div className="mt-2 space-y-1.5 animate-in slide-in-from-top-1">
                                            <Label htmlFor="edit-linkFilter" className="text-[9px] font-bold uppercase text-slate-400">Termo para Gatilho</Label>
                                            <Input
                                                id="edit-linkFilter"
                                                className="h-8 text-xs bg-white border-emerald-100"
                                                value={editingCampaign.successLinkFilter || ""}
                                                onChange={(e) => setEditingCampaign({ ...editingCampaign, successLinkFilter: e.target.value })}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter className="p-6 bg-slate-50/50 border-t border-border/50 gap-3">
                        <Button variant="ghost" onClick={() => setIsEditOpen(false)} className="text-slate-500">Cancelar</Button>
                        <Button onClick={handleUpdateCampaign} className="bg-accent hover:bg-accent/90 px-8 font-bold">Salvar Alterações</Button>
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
                                                <Badge variant="outline" className={`text-[10px] ${contact.status === 'sent' ? 'border-green-500 text-green-500' :
                                                    contact.status === 'failed' ? 'border-red-500 text-red-500' :
                                                        'border-amber-500 text-amber-500'
                                                    }`}>
                                                    {contact.status === 'pending' ? 'Pendente' :
                                                        contact.status === 'sent' ? 'Enviado' :
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

        </MainLayout >
    );
}
