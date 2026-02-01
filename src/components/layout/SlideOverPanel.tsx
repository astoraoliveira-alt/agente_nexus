import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';
import { ConversationDetailsPanel } from '@/components/panels/ConversationDetailsPanel';
import { AgentConfigPanel } from '@/components/panels/AgentConfigPanel';
import { ConsumptionDetailsPanel } from '@/components/panels/ConsumptionDetailsPanel';
import { UserProfilePanel } from '@/components/panels/UserProfilePanel';

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
      default:
        return null;
    }
  };

  const getTitle = () => {
    switch (slideOverContent) {
      case 'conversation-details':
        return 'Detalhes da Conversa';
      case 'agent-config':
        return 'Configuração do Agente';
      case 'consumption-details':
        return 'Detalhes de Consumo';
      case 'user-profile':
        return 'Meu Perfil';
      default:
        return '';
    }
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
          'fixed top-0 right-0 h-full w-[420px] bg-card border-l border-border shadow-2xl z-50 transition-transform duration-300 flex flex-col',
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
