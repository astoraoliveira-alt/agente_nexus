import { FileText, Check, X, ArrowRightLeft, Calendar } from 'lucide-react';
import { AIPolicy } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface PolicyDetailsPanelProps {
  data: AIPolicy;
}

export function PolicyDetailsPanel({ data }: PolicyDetailsPanelProps) {
  if (!data) return null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-accent/10 flex items-center justify-center">
          <FileText className="h-7 w-7 text-accent" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg">{data.name}</h3>
            <Badge variant="outline">v{data.version}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Criada em {data.createdAt.toLocaleDateString('pt-BR')}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {data.isActive ? (
          <Badge className="bg-green-600">Política Ativa</Badge>
        ) : (
          <Badge variant="secondary">Inativa</Badge>
        )}
      </div>

      <Separator />

      {/* Can Do */}
      <div>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2 text-green-600">
          <Check className="h-4 w-4" />
          O que a IA PODE fazer ({data.rules.canDo.length})
        </h4>
        <div className="space-y-2">
          {data.rules.canDo.map((rule, idx) => (
            <div 
              key={idx} 
              className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-950/30 text-sm"
            >
              <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span>{rule}</span>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Cannot Do */}
      <div>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2 text-red-600">
          <X className="h-4 w-4" />
          O que a IA NÃO pode fazer ({data.rules.cannotDo.length})
        </h4>
        <div className="space-y-2">
          {data.rules.cannotDo.map((rule, idx) => (
            <div 
              key={idx} 
              className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-950/30 text-sm"
            >
              <X className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <span>{rule}</span>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Transfer Conditions */}
      <div>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2 text-blue-600">
          <ArrowRightLeft className="h-4 w-4" />
          Quando transferir para humano ({data.rules.transferConditions.length})
        </h4>
        <div className="space-y-2">
          {data.rules.transferConditions.map((rule, idx) => (
            <div 
              key={idx} 
              className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 text-sm"
            >
              <ArrowRightLeft className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <span>{rule}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
