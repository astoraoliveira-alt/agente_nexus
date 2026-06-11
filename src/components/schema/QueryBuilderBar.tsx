import React from 'react';
import { Sigma, Hash, Percent, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SelectedField {
  table: string;
  column: string;
  type: string;
  business: string;
  tableBusiness: string;
}

interface QueryBuilderBarProps {
  selectedFields: SelectedField[];
  onRemoveField: (index: number) => void;
  onAggregate: (action: 'sum' | 'avg' | 'count') => void;
  onCustomText: () => void;
}

const NUMERIC_TYPES = ['int4', 'int8', 'numeric', 'int', 'float', 'decimal', 'double precision', 'real'];

export function QueryBuilderBar({
  selectedFields,
  onRemoveField,
  onAggregate,
  onCustomText
}: QueryBuilderBarProps) {
  if (selectedFields.length === 0) return null;

  const hasNumeric = selectedFields.some((s) => NUMERIC_TYPES.includes(s.type.toLowerCase()));
  const isMultiTable = new Set(selectedFields.map((s) => s.table)).size > 1;
  const tableNames = [...new Set(selectedFields.map((s) => s.tableBusiness))].join(' × ');

  return (
    <div className="absolute bottom-4 left-4 right-4 md:left-6 md:right-6 bg-primary-soft border border-primary/30 rounded-xl p-4 shadow-lg animate-slide-up z-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left Side: Chips */}
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider mb-2 select-none">
            <Wand2 className="h-3.5 w-3.5" /> Construtor de Consultas
          </div>
          
          <div className="flex flex-wrap gap-2">
            {selectedFields.map((sf, index) => (
              <span
                key={`${sf.table}-${sf.column}-${index}`}
                className="inline-flex items-center gap-1.5 bg-white border border-primary/20 text-xs font-medium px-2.5 py-1 rounded-lg shadow-sm"
              >
                <span className="text-slate-800">{sf.business}</span>
                <span className="text-[10px] text-slate-400 font-normal">({sf.tableBusiness})</span>
                <button
                  onClick={() => onRemoveField(index)}
                  className="text-slate-400 hover:text-red-500 hover:bg-slate-100 p-0.5 rounded-full transition-colors shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="text-xs text-slate-600 mt-2.5 font-medium select-none">
            {selectedFields.length === 1 ? (
              <>Como analisar o campo <strong className="text-slate-800">«{selectedFields[0].business}»</strong>?</>
            ) : (
              <>
                Como combinar os {selectedFields.length} campos selecionados
                {isMultiTable && (
                  <> (relacionando as tabelas <strong className="text-primary">{tableNames}</strong>)</>
                )}
                ?
              </>
            )}
          </div>
        </div>

        {/* Right Side: Actions */}
        <div className="flex flex-wrap items-center gap-2 md:justify-end shrink-0">
          {hasNumeric && (
            <Button
              size="sm"
              onClick={() => onAggregate('sum')}
              className="bg-primary hover:bg-primary/95 text-white gap-1.5"
            >
              <Sigma className="h-3.5 w-3.5" /> Somar
            </Button>
          )}
          {hasNumeric && (
            <Button
              size="sm"
              onClick={() => onAggregate('avg')}
              className="bg-primary hover:bg-primary/95 text-white gap-1.5"
            >
              <Percent className="h-3.5 w-3.5" /> Média
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => onAggregate('count')}
            className="bg-primary hover:bg-primary/95 text-white gap-1.5"
          >
            <Hash className="h-3.5 w-3.5" /> Contar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onCustomText}
            className="bg-white border-primary/30 text-primary hover:bg-primary/5 gap-1.5"
          >
            Personalizado...
          </Button>
        </div>
      </div>

      <style>{`
        .bg-primary-soft {
          background-color: hsl(var(--primary)/0.06);
        }
        .animate-slide-up {
          animation: slide-up 0.25s ease-out;
        }
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
