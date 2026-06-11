import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Table2, KeyRound, Link2, CircleDot, FunctionSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Field {
  tech: string;
  business: string;
  type: string;
  k: 'pk' | 'fk' | 'req' | 'opt';
}

interface TableNodeProps {
  data: {
    tableName: string;
    label: string;
    fields: Field[];
    rpcs?: string[];
    hot: boolean;
    hotColumns: string[];
    hotRpcs: string[];
    selectedFields: string[];
    onFieldClick: (field: Field) => void;
    icon?: React.ComponentType<any>;
  };
}

export function TableNode({ data }: TableNodeProps) {
  const Icon = data.icon || Table2;

  return (
    <div
      className={cn(
        'bg-white border border-slate-200 rounded-xl shadow-md transition-all duration-300 w-[240px] overflow-hidden',
        data.hot && 'border-primary shadow-lg ring-4 ring-primary/10 animate-pulse-subtle'
      )}
    >
      {/* Handles for edges (Left and Right) */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="w-2.5 h-2.5 !bg-slate-300 hover:!bg-primary transition-colors border-2 border-white"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="w-2.5 h-2.5 !bg-slate-300 hover:!bg-primary transition-colors border-2 border-white"
      />

      {/* Header */}
      <div className="flex items-center gap-3 p-3 bg-white border-b border-slate-100 select-none">
        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-slate-800 text-xs truncate leading-snug">
            {data.label}
          </span>
          <span className="text-[9.5px] text-slate-400 font-mono flex items-center gap-1">
            <Table2 className="h-2.5 w-2.5 shrink-0" /> {data.tableName}
          </span>
        </div>
      </div>

      {/* Columns list */}
      <div className="py-1 bg-white">
        {data.fields.map((f) => {
          const isHot = data.hotColumns.includes(f.tech);
          const isSelected = data.selectedFields.includes(f.tech);

          return (
            <div
              key={f.tech}
              onClick={() => data.onFieldClick(f)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer border-l-2 border-transparent select-none group',
                isSelected && 'bg-primary/5 border-primary text-primary font-semibold',
                isHot && 'animate-field-blink font-medium'
              )}
              title="Clique para adicionar à consulta"
            >
              {/* Key Icons */}
              <span className="flex items-center justify-center w-3 text-slate-400">
                {f.k === 'pk' ? (
                  <KeyRound className="h-3 w-3 text-amber-500" />
                ) : f.k === 'fk' ? (
                  <Link2 className="h-3 w-3 text-primary" />
                ) : (
                  <CircleDot className="h-2 w-2 opacity-40 group-hover:opacity-100 transition-opacity" />
                )}
              </span>

              {/* Mappings */}
              <span className="flex-1 text-[11px] truncate text-slate-700 group-hover:text-primary transition-colors">
                {f.business}
              </span>
              <span className="text-[9px] font-mono text-slate-400 group-hover:text-slate-500 transition-colors">
                {f.tech}
              </span>
              <span className="text-[8.5px] font-mono text-slate-400 bg-slate-100 px-1 py-0.5 rounded shrink-0">
                {f.type}
              </span>
            </div>
          );
        })}
      </div>

      {/* RPCs on Footer */}
      {data.rpcs && data.rpcs.length > 0 && (
        <div className="flex flex-wrap gap-1 p-2 border-t border-dashed border-slate-100 bg-slate-50">
          {data.rpcs.map((r) => {
            const isRpcHot = data.hotRpcs.includes(r);
            return (
              <span
                key={r}
                className={cn(
                  'inline-flex items-center gap-1 font-mono text-[8px] px-1.5 py-0.5 rounded border border-slate-200 bg-white text-slate-500 transition-all select-none',
                  isRpcHot && 'border-primary bg-primary/10 text-primary ring-2 ring-primary/5 font-semibold animate-pulse-subtle'
                )}
                title={`RPC: ${r}`}
              >
                <FunctionSquare className="h-2.5 w-2.5" /> {r}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
