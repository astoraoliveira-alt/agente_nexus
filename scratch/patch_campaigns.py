import re
import sys

def patch_campaign_executive():
    file_path = "/Users/user/SaaS - Davos Nexus/agent-nexus-hub/src/components/dashboard/CampaignExecutiveView.tsx"
    with open(file_path, "r") as f:
        content = f.read()

    # Add selectedAgentId state
    state_addition = """  const [timeFilter, setTimeFilter] = useState<'15days' | '30days' | '90days' | 'all'>('15days');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all');"""
    content = content.replace("  const [timeFilter, setTimeFilter] = useState<'15days' | '30days' | '90days' | 'all'>('15days');", state_addition)

    # Add selectedAgentId to dependencies
    content = content.replace("}, [currentTenant, currentPage, timeFilter]);", "}, [currentTenant, currentPage, timeFilter, selectedAgentId]);")

    # Pass selectedAgentId to API
    api_call_addition = """        api.getCampaignsPaginated(currentTenant.id, {
            startDate,
            agentId: selectedAgentId,
            page: currentPage,"""
    content = content.replace("""        api.getCampaignsPaginated(currentTenant.id, {
            startDate,
            page: currentPage,""", api_call_addition)

    # Pass selectedAgentId to getCampaignStats
    stats_call_addition = """const [campaignsResult, agentsData, globalStatsRaw] = await Promise.all([
        api.getCampaignsPaginated(currentTenant.id, {
            startDate,
            agentId: selectedAgentId,
            page: currentPage,
            pageSize: pageSize,
            useReplica: false
        }),
        api.getAgents(currentTenant.id),
        api.getAllCampaignsStats(currentTenant.id, undefined, startDate, selectedAgentId)
      ]);"""
    
    # We need to replace the Promise.all properly
    # Let's just use regex
    content = re.sub(
        r"api\.getAllCampaignsStats\(currentTenant\.id, undefined, startDate\)",
        r"api.getAllCampaignsStats(currentTenant.id, undefined, startDate, selectedAgentId)",
        content
    )

    # Add the Select component in the UI
    # Find the filter section
    filter_html = """
          <Select value={timeFilter} onValueChange={(v: any) => setTimeFilter(v)}>
            <SelectTrigger className="w-[180px] bg-white">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15days">Últimos 15 dias</SelectItem>
              <SelectItem value="30days">Últimos 30 dias</SelectItem>
              <SelectItem value="90days">Últimos 90 dias</SelectItem>
              <SelectItem value="all">Todo o período</SelectItem>
            </SelectContent>
          </Select>"""

    agent_filter_html = filter_html + """
          {agents.length > 1 && (
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger className="w-[200px] bg-white">
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

    # Fix "Links Enviados" to "Conversões"
    content = content.replace('title="Links Enviados"', 'title="Conversões"')
    content = content.replace('links enviados', 'conversões')

    # Add Bot to imports if not there
    if 'Select,' not in content:
        # It's already there since Select is used for timeFilter
        pass
    if 'Bot,' not in content:
        content = content.replace('Calendar,\n', 'Calendar,\n  Bot,\n')

    with open(file_path, "w") as f:
        f.write(content)

patch_campaign_executive()
