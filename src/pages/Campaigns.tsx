import { useState, useEffect, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { api } from "@/services/api";
import { Campaign, CampaignStatus, Agent } from "@/lib/types";
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
    X
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
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MainLayout } from "@/components/layout/MainLayout";

export default function Campaigns() {
    const { currentTenant } = useApp();
    const { toast } = useToast();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isContactsViewOpen, setIsContactsViewOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [importData, setImportData] = useState<{ name: string; phone: string }[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [isLoadingContacts, setIsLoadingContacts] = useState(false);
    const [selectedCampaignForImport, setSelectedCampaignForImport] = useState<string | null>(null);
    const [viewContacts, setViewContacts] = useState<any[]>([]);
    const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // New Campaign Form State
    const [newCampaign, setNewCampaign] = useState({
        name: "",
        description: "",
        agentId: "",
        dailyLimit: 30,
        startDate: format(new Date(), "yyyy-MM-dd"),
        endDate: "",
        startTime: "09:00",
        endTime: "18:00",
        initialMessage: "",
    });

    useEffect(() => {
        if (currentTenant) {
            loadData();
        }
    }, [currentTenant]);

    const loadData = async () => {
        if (!currentTenant) return;
        setIsLoading(true);
        try {
            const [campaignsData, agentsData] = await Promise.all([
                api.getCampaigns(currentTenant.id),
                api.getAgents(currentTenant.id)
            ]);
            setCampaigns(campaignsData);
            setAgents(agentsData);
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
            await api.createCampaign({
                tenantId: currentTenant.id,
                agentId: newCampaign.agentId,
                name: newCampaign.name,
                description: newCampaign.description,
                startDate: new Date(newCampaign.startDate),
                endDate: newCampaign.endDate ? new Date(newCampaign.endDate) : undefined,
                startTime: newCampaign.startTime,
                endTime: newCampaign.endTime,
                initialMessage: newCampaign.initialMessage,
                dailyLimit: newCampaign.dailyLimit,
                status: "active" as CampaignStatus,
            });

            toast({
                title: "Campanha criada!",
                description: "Sua campanha estratégica foi salva e está pronta para disparos.",
            });
            setIsCreateOpen(false);
            setNewCampaign({
                name: "",
                description: "",
                agentId: "",
                dailyLimit: 30,
                startDate: format(new Date(), "yyyy-MM-dd"),
                endDate: "",
                startTime: "09:00",
                endTime: "18:00",
                initialMessage: "",
            });
            loadData();
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

        let nameIdx = 0;
        let phoneIdx = 1;
        let startRow = 0;

        // Tenta detectar se a primeira linha é um cabeçalho
        const firstRow = rows[0].map(c => String(c).toLowerCase());
        const hasHeader = firstRow.some(c =>
            c.includes('nome') || c.includes('name') || c.includes('contato') ||
            c.includes('tel') || c.includes('phone') || c.includes('cel') || c.includes('whatsapp')
        );

        if (hasHeader) {
            nameIdx = firstRow.findIndex(c => c.includes('nome') || c.includes('name') || c.includes('contato'));
            phoneIdx = firstRow.findIndex(c => c.includes('tel') || c.includes('phone') || c.includes('cel') || c.includes('whatsapp'));
            startRow = 1; // Pula o cabeçalho

            // Fallback se não achou uma das colunas mas tem cabeçalho
            if (nameIdx === -1) nameIdx = 0;
            if (phoneIdx === -1) phoneIdx = 1;
        }

        const processed = rows.slice(startRow).map(row => {
            return {
                name: row[nameIdx] ? String(row[nameIdx]).trim().substring(0, 100) : "Sem Nome",
                phone: row[phoneIdx] ? String(row[phoneIdx]).replace(/\D/g, '').substring(0, 20) : ""
            };
        }).filter(item => item.phone.length >= 8);

        if (processed.length === 0) {
            toast({
                title: "Nenhum dado válido",
                description: "Certifique-se de que o arquivo tem colunas de 'Nome' e 'Telefone'.",
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

        try {
            // 1. Deduplicação local (no arquivo sendo importado)
            const uniquePhones = new Set();
            const localFiltered = importData.filter(item => {
                const phone = item.phone.replace(/\D/g, '');
                if (uniquePhones.has(phone)) return false;
                uniquePhones.add(phone);
                return true;
            });

            const skippedInFile = importData.length - localFiltered.length;

            const contactsToInsert = localFiltered.map(item => ({
                tenantId: currentTenant.id,
                agentId: campaign.agentId,
                campaignId: campaign.id,
                contactName: item.name,
                contactPhone: item.phone,
                status: 'pending' as const
            }));

            // Batch size for better performance (Supabase limit check)
            const chunkSize = 500;
            for (let i = 0; i < contactsToInsert.length; i += chunkSize) {
                const chunk = contactsToInsert.slice(i, i + chunkSize);
                await api.addToOutboundQueue(chunk);
            }

            // 2. Sincronização de Contador Real (Consultando o banco)
            const allContacts = await api.getOutboundQueue(currentTenant.id, undefined, campaign.id);
            const realTotal = allContacts.length;

            await api.updateCampaign(campaign.id, {
                totalContacts: realTotal
            });

            const added = realTotal - (campaign.totalContacts || 0);

            toast({
                title: "Importação concluída!",
                description: `${added} novos contatos únicos adicionados. ${skippedInFile > 0 ? `(${skippedInFile} duplicatas no arquivo ignoradas)` : ''}`,
            });
            setIsImportOpen(false);
            setImportData([]);
            if (fileInputRef.current) fileInputRef.current.value = "";
            loadData();
        } catch (error) {
            toast({
                title: "Erro na importação",
                description: "Houve um problema ao salvar os contatos na fila.",
                variant: "destructive",
            });
        } finally {
            setIsImporting(false);
        }
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
                initialMessage: editingCampaign.initialMessage,
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
            const contacts = await api.getOutboundQueue(currentTenant.id, undefined, campaignId);
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

    const filteredCampaigns = campaigns.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <MainLayout>
            <div className="h-full overflow-y-auto">
                <div className="sticky top-0 z-10 bg-background border-b border-border">
                    <div className="px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2">
                                <Megaphone className="h-6 w-6 text-accent" />
                                Campanhas Estratégicas
                            </h1>
                            <p className="text-sm text-muted-foreground">Gerencie o ciclo de vida das suas abordagens proativas inteligentes (Outbound).</p>
                        </div>
                        <div className="flex gap-2">
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
                            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                                <DialogTrigger asChild>
                                    <Button className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold shadow-lg shadow-accent/20 h-9">
                                        <Plus className="mr-2 h-4 w-4" /> Nova Campanha
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[500px] border-accent/20">
                                    <DialogHeader>
                                        <DialogTitle className="text-2xl font-bold text-accent">Criar Estratégia Outbound</DialogTitle>
                                        <DialogDescription>
                                            Defina os objetivos técnicos e operacionais desta campanha. O motor de automação processará os leads seguindo estes critérios de cadência e volume.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-6 py-4">
                                        <div className="grid gap-2">
                                            <Label htmlFor="name">Nome da Campanha</Label>
                                            <Input
                                                id="name"
                                                placeholder="Ex: Reengajamento - Leads Janeiro"
                                                className="bg-accent/5"
                                                value={newCampaign.name}
                                                onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="agent">Agente Executor</Label>
                                            <Select onValueChange={(v) => setNewCampaign({ ...newCampaign, agentId: v })}>
                                                <SelectTrigger className="bg-accent/5">
                                                    <SelectValue placeholder="Selecione o Agente de IA" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {agents.map(agent => (
                                                        <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="grid gap-2">
                                                <Label htmlFor="limit">Limite de Novos Envios / Dia</Label>
                                                <Input
                                                    id="limit"
                                                    type="number"
                                                    className="bg-accent/5"
                                                    value={newCampaign.dailyLimit}
                                                    onChange={(e) => setNewCampaign({ ...newCampaign, dailyLimit: parseInt(e.target.value) })}
                                                />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="start">Data de Início</Label>
                                                <Input
                                                    id="start"
                                                    type="date"
                                                    className="bg-accent/5"
                                                    value={newCampaign.startDate}
                                                    onChange={(e) => setNewCampaign({ ...newCampaign, startDate: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="grid gap-2">
                                                <Label htmlFor="startTime">Janela de Início</Label>
                                                <Input
                                                    id="startTime"
                                                    type="time"
                                                    className="bg-accent/5"
                                                    value={newCampaign.startTime}
                                                    onChange={(e) => setNewCampaign({ ...newCampaign, startTime: e.target.value })}
                                                />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="endTime">Janela de Fim</Label>
                                                <Input
                                                    id="endTime"
                                                    type="time"
                                                    className="bg-accent/5"
                                                    value={newCampaign.endTime}
                                                    onChange={(e) => setNewCampaign({ ...newCampaign, endTime: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="message">Mensagem Inicial (Dica: Use Emojis! 🚀)</Label>
                                            <textarea
                                                id="message"
                                                placeholder="Olá {{nome}}, tudo bem? Gostaríamos de conversar sobre..."
                                                className="flex min-h-[100px] w-full rounded-md border border-input bg-accent/5 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                                value={newCampaign.initialMessage}
                                                onChange={(e) => setNewCampaign({ ...newCampaign, initialMessage: e.target.value })}
                                            />
                                            <p className="text-[10px] text-muted-foreground italic">Dica: Use {"{{nome}}"} para personalizar com o nome do contato.</p>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="description">Objetivo / Contexto (Opcional)</Label>
                                            <Input
                                                id="description"
                                                placeholder="Breve descrição da meta desta campanha"
                                                className="bg-accent/5"
                                                value={newCampaign.description}
                                                onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
                                        <Button onClick={handleCreateCampaign} className="bg-accent hover:bg-accent/90">Salvar Estratégia</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="bg-accent/5 border-accent/20">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-muted-foreground">Total Ativo</span>
                                    <Megaphone className="h-4 w-4 text-accent" />
                                </div>
                                <div className="text-2xl font-bold">{campaigns.reduce((acc, c) => acc + (c.sentCount || 0), 0)}</div>
                                <div className="text-xs text-muted-foreground mt-1">Disparos realizados</div>
                            </CardContent>
                        </Card>
                        <Card className="bg-blue-500/5 border-blue-500/20">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-muted-foreground">Respostas</span>
                                    <MessageSquare className="h-4 w-4 text-blue-500" />
                                </div>
                                <div className="text-2xl font-bold">{campaigns.reduce((acc, c) => acc + (c.responseCount || 0), 0)}</div>
                                <div className="text-xs text-muted-foreground mt-1">Interações detectadas</div>
                            </CardContent>
                        </Card>
                        <Card className="bg-green-500/5 border-green-500/20">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-muted-foreground">ROI / Conversão</span>
                                    <TrendingUp className="h-4 w-4 text-green-500" />
                                </div>
                                <div className="text-2xl font-bold">
                                    {campaigns.length > 0 && campaigns.reduce((acc, c) => acc + (c.sentCount || 0), 0) > 0
                                        ? ((campaigns.reduce((acc, c) => acc + (c.responseCount || 0), 0) / campaigns.reduce((acc, c) => acc + (c.sentCount || 1), 0)) * 100).toFixed(1)
                                        : 0}%
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">Média global de resposta</div>
                            </CardContent>
                        </Card>
                        <Card className="bg-amber-500/5 border-amber-500/20">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-muted-foreground">Lista de Espera</span>
                                    <Clock className="h-4 w-4 text-amber-500" />
                                </div>
                                <div className="text-2xl font-bold">{campaigns.reduce((acc, c) => acc + ((c.totalContacts || 0) - (c.sentCount || 0)), 0)}</div>
                                <div className="text-xs text-muted-foreground mt-1">Contatos aguardando disparo</div>
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
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-accent/5">
                                            <TableHead className="w-[200px]">Campanha / Agente</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-center">Leads</TableHead>
                                            <TableHead className="text-center">Envios</TableHead>
                                            <TableHead>Progresso</TableHead>
                                            <TableHead>Vigência</TableHead>
                                            <TableHead className="text-right">Respostas</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredCampaigns.map((campaign) => (
                                            <TableRow key={campaign.id} className="hover:bg-accent/5">
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold">{campaign.name}</span>
                                                        <span className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                                                            <Bot className="h-3 w-3" />
                                                            {agents.find(a => a.id === campaign.agentId)?.name || 'Agente'}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                                                <TableCell className="text-center font-semibold">
                                                    {campaign.totalContacts || 0}
                                                </TableCell>
                                                <TableCell className="text-center font-semibold text-accent">
                                                    {campaign.sentCount || 0}
                                                </TableCell>
                                                <TableCell className="w-[150px]">
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex justify-between text-[10px] text-muted-foreground">
                                                            <span>{campaign.totalContacts ? Math.round(((campaign.sentCount || 0) / campaign.totalContacts) * 100) : 0}%</span>
                                                        </div>
                                                        <Progress value={campaign.totalContacts ? ((campaign.sentCount || 0) / campaign.totalContacts) * 100 : 0} className="h-1 shadow-inner" />
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-xs space-y-1">
                                                        <div className="flex items-center gap-1">
                                                            <Clock className="h-3 w-3" />
                                                            {format(campaign.startDate, "dd MMM", { locale: ptBR })}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground italic">Limite: {campaign.dailyLimit}/dia</div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-blue-500">
                                                    {campaign.responseCount || 0}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => {
                                                            setSelectedCampaignForImport(campaign.id);
                                                            setIsImportOpen(true);
                                                        }}>
                                                            <FileUp className="h-4 w-4" />
                                                        </Button>
                                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-400" onClick={() => handleViewContacts(campaign.id)}>
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => handleOpenEdit(campaign)}>
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => handleTogglePause(campaign)}>
                                                            {campaign.status === 'paused' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                                                        </Button>
                                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => handleDeleteCampaign(campaign.id)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    {/* Tips */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="flex gap-3">
                            <ShieldCheck className="h-5 w-5 text-accent shrink-0" />
                            <div className="text-xs text-muted-foreground">
                                <span className="font-bold text-foreground block mb-1">Proteção Anti-Ban</span>
                                O sistema respeita o limite diário configurado para manter a saúde do seu número.
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <TrendingUp className="h-5 w-5 text-blue-500 shrink-0" />
                            <div className="text-xs text-muted-foreground">
                                <span className="font-bold text-foreground block mb-1">Tracking Real</span>
                                Detectamos automaticamente quando um lead responde e marcamos na campanha.
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <MessageSquare className="h-5 w-5 text-green-500 shrink-0" />
                            <div className="text-xs text-muted-foreground">
                                <span className="font-bold text-foreground block mb-1">CRM Integrado</span>
                                Respostas fluem naturalmente para o seu CRM de Leads para fechamento.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Import Modal */}
            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileUp className="h-5 w-5 text-accent" />
                            Importar Base de Leads
                        </DialogTitle>
                        <DialogDescription>
                            Carregue arquivos .csv, .xls ou .xlsx com as informações dos seus contatos.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
                        <div className="grid gap-2">
                            <Label>Campanha de Destino</Label>
                            <Select onValueChange={setSelectedCampaignForImport} value={selectedCampaignForImport || ""}>
                                <SelectTrigger className="bg-accent/5">
                                    <SelectValue placeholder="Escolha a Campanha Ativa" />
                                </SelectTrigger>
                                <SelectContent>
                                    {campaigns.filter(c => c.status === 'active').map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <Label>Arquivo de Contatos (Excel ou CSV)</Label>
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-accent/20 rounded-lg p-8 flex flex-col items-center justify-center gap-3 bg-accent/5 hover:bg-accent/10 cursor-pointer transition-colors"
                            >
                                <FileUp className="h-8 w-8 text-accent opacity-50" />
                                <div className="text-center">
                                    <p className="text-sm font-medium">Clique para selecionar</p>
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
                                <div className="flex items-center justify-between p-2 bg-green-500/10 border border-green-500/20 rounded text-xs text-green-600">
                                    <span className="flex items-center gap-1">
                                        <ShieldCheck className="h-3 w-3" />
                                        {importData.length} contatos validados
                                    </span>
                                    <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setImportData([])}>
                                        Remover
                                    </Button>
                                </div>
                            )}
                        </div>

                        <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg space-y-2">
                            <h4 className="text-[10px] font-bold uppercase text-amber-600 flex items-center gap-1">
                                <Clock className="h-3 w-3" /> Instruções de Formato
                            </h4>
                            <ul className="text-[10px] text-muted-foreground list-disc pl-4 space-y-1">
                                <li><strong>Colunas Obrigatórias:</strong> 'Nome' e 'Telefone' (ou 'Phone').</li>
                                <li><strong>Formato Telefone:</strong> Deve conter DDI + DDD + Número (ex: 5511999999999).</li>
                                <li><strong>Tamanho Base:</strong> Máximo de 5.000 contatos por arquivo.</li>
                                <li><strong>Limpeza:</strong> Símbolos como (+, -, space) são removidos automaticamente.</li>
                            </ul>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsImportOpen(false)}>Cancelar</Button>
                        <Button
                            onClick={handleImportContacts}
                            className="bg-accent hover:bg-accent/90"
                            disabled={importData.length === 0 || !selectedCampaignForImport || isImporting}
                        >
                            {isImporting ? "Processando..." : `Importar ${importData.length > 0 ? importData.length : ''} Leads`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Campaign Modal */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="sm:max-w-[500px] border-accent/20">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-bold text-accent">Editar Estratégia Outbound</DialogTitle>
                        <DialogDescription>
                            Atualize as configurações da sua campanha. As mudanças não afetam contatos que já estão sendo processados.
                        </DialogDescription>
                    </DialogHeader>
                    {editingCampaign && (
                        <div className="grid gap-6 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="edit-name">Nome da Campanha</Label>
                                <Input
                                    id="edit-name"
                                    className="bg-accent/5"
                                    value={editingCampaign.name}
                                    onChange={(e) => setEditingCampaign({ ...editingCampaign, name: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-limit">Limite Diário</Label>
                                    <Input
                                        id="edit-limit"
                                        type="number"
                                        className="bg-accent/5"
                                        value={editingCampaign.dailyLimit}
                                        onChange={(e) => setEditingCampaign({ ...editingCampaign, dailyLimit: parseInt(e.target.value) })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-start">Início</Label>
                                    <Input
                                        id="edit-start"
                                        type="date"
                                        className="bg-accent/5"
                                        value={format(new Date(editingCampaign.startDate), "yyyy-MM-dd")}
                                        onChange={(e) => setEditingCampaign({ ...editingCampaign, startDate: new Date(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-startTime">Janela Início</Label>
                                    <Input
                                        id="edit-startTime"
                                        type="time"
                                        className="bg-accent/5"
                                        value={editingCampaign.startTime || "09:00"}
                                        onChange={(e) => setEditingCampaign({ ...editingCampaign, startTime: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-endTime">Janela Fim</Label>
                                    <Input
                                        id="edit-endTime"
                                        type="time"
                                        className="bg-accent/5"
                                        value={editingCampaign.endTime || "18:00"}
                                        onChange={(e) => setEditingCampaign({ ...editingCampaign, endTime: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="edit-message">Mensagem Inicial</Label>
                                <textarea
                                    id="edit-message"
                                    className="flex min-h-[100px] w-full rounded-md border border-input bg-accent/5 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    value={editingCampaign.initialMessage || ""}
                                    onChange={(e) => setEditingCampaign({ ...editingCampaign, initialMessage: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="edit-description">Descrição</Label>
                                <Input
                                    id="edit-description"
                                    className="bg-accent/5"
                                    value={editingCampaign.description || ""}
                                    onChange={(e) => setEditingCampaign({ ...editingCampaign, description: e.target.value })}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
                        <Button onClick={handleUpdateCampaign} className="bg-accent hover:bg-accent/90">Salvar Alterações</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* View Contacts Modal */}
            <Dialog open={isContactsViewOpen} onOpenChange={setIsContactsViewOpen}>
                <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col p-6 border-accent/20">
                    <DialogHeader>
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-xl font-bold flex items-center gap-2">
                                <Users className="h-5 w-5 text-accent" />
                                Lista de Contatos da Campanha
                            </DialogTitle>
                            <Button variant="ghost" size="icon" onClick={() => setIsContactsViewOpen(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <DialogDescription>
                            Visualize todos os leads importados e o status atual do processamento de cada um.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto min-h-[400px] py-4">
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
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Telefone</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Ação</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {viewContacts.map((contact) => (
                                        <TableRow key={contact.id}>
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
                                            <TableCell className="text-right">
                                                <div className="text-[10px] text-muted-foreground">
                                                    {contact.sentAt ? format(new Date(contact.sentAt), "dd/MM HH:mm") : '-'}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                    <DialogFooter className="sticky bottom-0 bg-background pt-4">
                        <Button className="w-full" onClick={() => setIsContactsViewOpen(false)}>Fechar Listagem</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </MainLayout>
    );
}
