import re
import sys

def patch_campaigns():
    file_path = "/Users/user/SaaS - Davos Nexus/agent-nexus-hub/src/pages/Campaigns.tsx"
    with open(file_path, "r") as f:
        content = f.read()

    # Add filterAgentId state
    state_addition = """    const [campaignSearch, setCampaignSearch] = useState("");
    const [filterAgentId, setFilterAgentId] = useState<string>('all');"""
    content = content.replace('    const [campaignSearch, setCampaignSearch] = useState("");', state_addition)

    # Add filterAgentId to loadData dependencies
    content = content.replace("    }, [currentTenant, currentPage, activeFilter, campaignSearch]);", "    }, [currentTenant, currentPage, activeFilter, campaignSearch, filterAgentId]);")

    # Pass filterAgentId to getCampaignsPaginated
    api_call = """                api.getCampaignsPaginated(currentTenant.id, {
                    startDate: activeFilter === 'all' ? undefined : new Date(Date.now() - parseInt(activeFilter) * 24 * 60 * 60 * 1000),
                    status: 'all',
                    search: campaignSearch,
                    agentId: filterAgentId,
                    page: currentPage,
                    pageSize: 15,
                    useReplica: false
                }),"""
    content = re.sub(r"api\.getCampaignsPaginated\(currentTenant\.id, \{[^}]+\}\),", api_call, content, count=1)

    # Replace Links Enviados -> Conversões in Campaigns.tsx
    content = content.replace('Links Enviados', 'Conversões')
    content = content.replace('Taxa de cliques', 'Taxa de conversão')

    # Add Select in the UI
    filter_html = """                                <div className="relative w-64">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input 
                                        type="text" 
                                        placeholder="Buscar campanhas..." 
                                        className="pl-9 bg-white"
                                        value={campaignSearch}
                                        onChange={(e) => setCampaignSearch(e.target.value)}
                                    />
                                </div>"""

    agent_filter_html = filter_html + """
                                {agents.length > 1 && (
                                    <Select value={filterAgentId} onValueChange={setFilterAgentId}>
                                        <SelectTrigger className="w-[180px] bg-white">
                                            <Bot className="w-4 h-4 mr-2" />
                                            <SelectValue placeholder="Todos os Agentes" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos os Agentes</SelectItem>
                                            {agents.map(agent => (
                                                <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
"""
    content = content.replace(filter_html, agent_filter_html)
    
    # Fix Default Agent Selection in create Campaign
    # We want it to be the NEW agent. Let's just pick the last active one, or the one with 'Novo' in name, or just the first active one.
    # agents[0].id -> agents.find(a => a.status === 'active')?.id || agents[0].id
    content = content.replace("agentId: agents.length === 1 ? agents[0].id : \"\"", "agentId: agents.find(a => a.name.includes('Novo'))?.id || agents.find(a => a.status === 'active')?.id || (agents.length > 0 ? agents[0].id : \"\")")
    content = content.replace("agentId: agents[0].id", "agentId: agents.find(a => a.name.includes('Novo'))?.id || agents.find(a => a.status === 'active')?.id || agents[0].id")

    with open(file_path, "w") as f:
        f.write(content)

patch_campaigns()
