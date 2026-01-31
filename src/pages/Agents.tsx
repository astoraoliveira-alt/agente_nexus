import { Bot, MessageSquare, Phone, Settings, Plus, Search } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { mockAgents } from '@/lib/mock-data';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

export default function Agents() {
  const { openSlideOver } = useApp();
  const [search, setSearch] = useState('');

  const filteredAgents = mockAgents.filter(agent =>
    agent.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Agentes</h1>
                <p className="text-sm text-muted-foreground">Gerencie seus agentes de IA conversacionais</p>
              </div>
              <Button className="bg-accent hover:bg-accent/90">
                <Plus className="h-4 w-4 mr-2" />
                Novo Agente
              </Button>
            </div>

            {/* Search */}
            <div className="mt-4 relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar agentes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Agents Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgents.map((agent) => (
              <div
                key={agent.id}
                className="kpi-card cursor-pointer hover:shadow-lg transition-all group"
                onClick={() => openSlideOver('agent-config', agent)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-accent/10 flex items-center justify-center">
                      <Bot className="h-6 w-6 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{agent.name}</h3>
                      <p className="text-xs text-muted-foreground">{agent.id}</p>
                    </div>
                  </div>
                  <div className={`status-dot ${agent.status === 'active' ? 'status-online' : 'status-offline'}`} />
                </div>

                {/* Channels */}
                <div className="flex gap-2 mb-4">
                  {agent.channels.includes('text') && (
                    <Badge variant="secondary" className="gap-1">
                      <MessageSquare className="h-3 w-3" />
                      Texto
                    </Badge>
                  )}
                  {agent.channels.includes('voice') && (
                    <Badge variant="secondary" className="gap-1">
                      <Phone className="h-3 w-3" />
                      Voz
                    </Badge>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-3 bg-muted">
                    <p className="text-xl font-bold">{agent.activeConversations}</p>
                    <p className="text-xs text-muted-foreground">Ativas Agora</p>
                  </div>
                  <div className="p-3 bg-muted">
                    <p className="text-xl font-bold">{agent.totalConversations.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>

                {/* Action */}
                <Button 
                  variant="ghost" 
                  className="w-full group-hover:bg-accent group-hover:text-accent-foreground"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Configurar
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
