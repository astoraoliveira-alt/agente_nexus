import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp, SlideOverContentType } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';
import { ConversationDetailsPanel } from '@/components/panels/ConversationDetailsPanel';
import { AgentConfigPanel } from '@/components/panels/AgentConfigPanel';
import { ConsumptionDetailsPanel } from '@/components/panels/ConsumptionDetailsPanel';
import { UserProfilePanel } from '@/components/panels/UserProfilePanel';
import { CompanyDetailsPanel } from '@/components/panels/CompanyDetailsPanel';
import { PolicyDetailsPanel } from '@/components/panels/PolicyDetailsPanel';
import { IncidentDetailsPanel } from '@/components/panels/IncidentDetailsPanel';
import { FlowDetailsPanel } from '@/components/panels/FlowDetailsPanel';
import { DecisionLogDetailsPanel } from '@/components/panels/DecisionLogDetailsPanel';
import { AgentGovernancePanel } from '@/components/panels/AgentGovernancePanel';
import { PlaygroundPanel } from '@/components/panels/PlaygroundPanel';
import { EvaluationDetailsPanel } from '@/components/panels/EvaluationDetailsPanel';
import { ISOReportPanel } from '@/components/panels/ISOReportPanel';
import { ContactDetailsPanel } from '@/components/panels/ContactDetailsPanel';
import { PlanHistoryPanel } from '@/components/panels/PlanHistoryPanel';
import { AgentHistoryPanel } from '@/components/panels/AgentHistoryPanel';
import { FinancialDetailPanel } from '@/components/panels/FinancialDetailPanel';
import { UnauditedConversationsPanel } from '@/components/panels/UnauditedConversationsPanel'; // Import new panel

const PANEL_TITLES: Record<SlideOverContentType, string> = {
  'conversation-details': 'Detalhes da Conversa',
  'agent-config': 'Configuração do Agente',
  'consumption-details': 'Detalhes de Consumo',
  'user-profile': 'Meu Perfil',
  'company-details': 'Detalhes da Empresa',
  'policy-details': 'Política de IA',
  'incident-details': 'Detalhes do Incidente',
  'flow-details': 'Detalhes do Fluxo',
  'decision-log-details': 'Log de Decisão',
  'agent-governance': 'Governança do Agente',
  'agent-playground': 'Simulador de Agente & Prompt',
  'evaluation-details': 'Detalhes da Auditoria',
  'iso-report': 'Relatório de Governança ISO 42001',
  'contact-details': 'Detalhes do Contato',
  'plan-history': 'Histórico de Alterações do Plano',
  'agent-history': 'Histórico de Configuração do Agente',
  'financial-detail': 'Detalhamento Financeiro (DRE)',
  'unaudited-list': 'Conversas Pendentes de Auditoria', // Add title
};

export function SlideOverPanel() {
  const { slideOverOpen, slideOverContent, slideOverData, closeSlideOver } = useApp();

  const renderContent = () => {
    switch (slideOverContent) {
      case 'conversation-details':
        return <ConversationDetailsPanel data={slideOverData} />;
      case 'agent-config':
        return <AgentConfigPanel data={slideOverData} />;
      case 'consumption-details':
        return <ConsumptionDetailsPanel data={slideOverData} />;
      case 'user-profile':
        return <UserProfilePanel />;
      case 'company-details':
        return <CompanyDetailsPanel data={slideOverData} />;
      case 'policy-details':
        return <PolicyDetailsPanel data={slideOverData} />;
      case 'incident-details':
        return <IncidentDetailsPanel data={slideOverData} />;
      case 'flow-details':
        return <FlowDetailsPanel data={slideOverData} />;
      case 'decision-log-details':
        return <DecisionLogDetailsPanel data={slideOverData} />;
      case 'agent-governance':
        return <AgentGovernancePanel data={slideOverData} />;
      case 'agent-playground':
        return <PlaygroundPanel agent={slideOverData} />;
      case 'evaluation-details':
        return <EvaluationDetailsPanel data={slideOverData} />;
      case 'iso-report':
        return <ISOReportPanel data={slideOverData} />;
      case 'contact-details':
        return <ContactDetailsPanel data={slideOverData} />;
      case 'plan-history':
        return <PlanHistoryPanel plan={slideOverData} />;
      case 'agent-history':
        return <AgentHistoryPanel agent={slideOverData} />;
      case 'financial-detail':
        return <FinancialDetailPanel data={slideOverData} />;
      case 'unaudited-list': // Add case
        return <UnauditedConversationsPanel data={slideOverData} />;
      default:
        return null;
    }
  };

  const getTitle = () => {
    return slideOverContent ? PANEL_TITLES[slideOverContent] : '';
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-foreground/20 z-40 transition-opacity duration-300',
          slideOverOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={closeSlideOver}
      />

      {/* Panel */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full bg-card border-l border-border shadow-2xl z-50 transition-transform duration-300 flex flex-col',
          slideOverContent === 'agent-playground' ? 'w-[800px]' : 'w-[480px]',
          slideOverOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-border">
          <h2 className="font-semibold text-lg">{getTitle()}</h2>
          <Button variant="ghost" size="icon" onClick={closeSlideOver}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {renderContent()}
        </div>
      </div>
    </>
  );
}
