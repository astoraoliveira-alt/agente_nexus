import React, { useRef, useEffect } from 'react';
import { Sparkles, Send, Code2, FunctionSquare, Table2, Info, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { TableMetadata } from '@/lib/schemaViewConfig';

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  sql?: string;
  tablesUsed?: string[];
  columnsUsed?: Record<string, string[]>;
  rpcsUsed?: string[];
  joins?: string[][];
  rows?: any[];
}

interface AskPanelProps {
  messages: ChatMessage[];
  input: string;
  onInputChange: (val: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  suggestions: Array<{ label: string; question: string }>;
  onSelectSuggestion: (q: string) => void;
  tables: TableMetadata[];
  onMessageClick?: (msg: ChatMessage) => void;
}

export function AskPanel({
  messages,
  input,
  onInputChange,
  onSubmit,
  isLoading,
  suggestions,
  onSelectSuggestion,
  tables,
  onMessageClick
}: AskPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const getTableBusinessName = (techName: string) => {
    return tables.find((t) => t.tech === techName)?.business || techName;
  };

  const mdBold = (text: string) => {
    const parts = text.split(/(\*\*.+?\*\*|«.+?»)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('«') && part.endsWith('»')) {
        return <em key={idx}>«{part.slice(1, -1)}»</em>;
      }
      const lines = part.split('\n');
      return lines.map((line, lIdx) => (
        <React.Fragment key={`${idx}-${lIdx}`}>
          {line}
          {lIdx < lines.length - 1 && <br />}
        </React.Fragment>
      ));
    });
  };

  return (
    <div className="w-[360px] border-l border-slate-200 bg-white flex flex-col h-full shrink-0 select-none">
      {/* Head */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-white">
        <Sparkles className="h-4 w-4 text-primary animate-pulse" />
        <span className="text-sm font-bold text-slate-800">Pergunte aos seus dados</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {messages.map((m, i) => (
          <div
            key={i}
            onClick={() => onMessageClick?.(m)}
            className={cn(
              'flex flex-col max-w-[90%] transition-all',
              m.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start',
              onMessageClick && m.role === 'ai' && m.sql && 'cursor-pointer hover:opacity-95'
            )}
          >
            <div
              className={cn(
                'text-xs leading-relaxed px-3.5 py-2.5 rounded-2xl shadow-sm border',
                m.role === 'user'
                  ? 'bg-primary border-primary/20 text-white rounded-tr-none'
                  : 'bg-slate-50 border-slate-200 text-slate-700 rounded-tl-none'
              )}
            >
              <div>{mdBold(m.text)}</div>

              {/* Aggregates mini visualization */}
              {m.rows && m.rows.length > 0 && m.rows.length <= 5 && (
                <div className="mt-3 space-y-2 pt-2 border-t border-slate-200/50">
                  {(() => {
                    // Detect if rows have labels/values
                    const sample = m.rows[0];
                    const keys = Object.keys(sample);
                    const labelKey = keys.find(k => typeof sample[k] === 'string') || keys[0];
                    const valKey = keys.find(k => typeof sample[k] === 'number') || keys[1] || keys[0];
                    
                    const numericValues = m.rows.map(r => Number(r[valKey]) || 0);
                    const maxVal = Math.max(...numericValues, 1);

                    return m.rows.map((row, idx) => {
                      const label = row[labelKey] || `Linha ${idx + 1}`;
                      const val = Number(row[valKey]) || 0;
                      const pct = Math.min((val / maxVal) * 100, 100);

                      return (
                        <div key={idx} className="flex items-center gap-2 text-[10.5px]">
                          <span className="w-24 truncate text-slate-500 font-medium" title={String(label)}>
                            {String(label)}
                          </span>
                          <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="font-mono text-slate-600 font-bold min-w-[32px] text-right">
                            {val.toLocaleString('pt-BR')}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}

              {/* Raw results detailed preview */}
              {m.rows && m.rows.length > 0 && (
                <details className="mt-3 text-[10px] text-slate-600 border border-slate-200 rounded-lg bg-white overflow-hidden">
                  <summary className="p-1.5 cursor-pointer font-bold select-none bg-slate-50 hover:bg-slate-100 flex items-center gap-1">
                    <Info className="h-3 w-3" /> Ver dados brutos ({m.rows.length} linhas)
                  </summary>
                  <div className="p-2 overflow-x-auto max-h-[140px] font-mono text-[9px]">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200">
                          {Object.keys(m.rows[0]).map(k => (
                            <th key={k} className="p-1 font-bold text-slate-500">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {m.rows.slice(0, 10).map((r, ri) => (
                          <tr key={ri} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                            {Object.values(r).map((v: any, vi) => (
                              <td key={vi} className="p-1 truncate max-w-[120px]">{String(v ?? 'NULL')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {m.rows.length > 10 && (
                      <div className="text-[9px] text-slate-400 italic mt-1.5 text-center">
                        Exibindo as 10 primeiras linhas.
                      </div>
                    )}
                  </div>
                </details>
              )}

              {/* Dev chips view */}
              {m.tablesUsed && m.tablesUsed.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3.5 pt-2 border-t border-dashed border-slate-200/50">
                  {m.tablesUsed.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 bg-primary/10 border border-primary/20 text-[9.5px] font-semibold px-2 py-0.5 rounded text-primary leading-none"
                    >
                      <Table2 className="h-2.5 w-2.5" />
                      {getTableBusinessName(t)} <span className="opacity-60 font-mono font-normal">({t})</span>
                    </span>
                  ))}
                  {m.rpcsUsed?.map((r) => (
                    <span
                      key={r}
                      className="inline-flex items-center gap-1 bg-primary/5 border border-primary/20 border-dashed text-[9.5px] font-normal px-2 py-0.5 rounded text-primary font-mono leading-none"
                    >
                      <FunctionSquare className="h-2.5 w-2.5" /> {r}
                    </span>
                  ))}
                </div>
              )}

              {/* Code execution drawer */}
              {m.sql && (
                <details className="mt-3 text-[10.5px]">
                  <summary className="cursor-pointer text-slate-400 hover:text-slate-600 font-bold select-none flex items-center gap-1">
                    <Code2 className="h-3.5 w-3.5" /> SQL Executado (Somente Leitura)
                  </summary>
                  <pre className="mt-2 p-2.5 bg-slate-900 text-slate-100 font-mono text-[10px] leading-relaxed rounded-xl overflow-x-auto whitespace-pre-wrap">
                    {m.sql}
                  </pre>
                </details>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col max-w-[85%] mr-auto items-start">
            <div className="bg-slate-50 border border-slate-200 text-slate-500 rounded-2xl rounded-tl-none p-3.5 flex items-center gap-2 text-xs shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Processando consulta SQL e gerando resposta...</span>
            </div>
          </div>
        )}
      </div>

      {/* Suggest questions */}
      <div className="px-4 py-2 border-t border-slate-100 flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto shrink-0 bg-slate-50/50">
        {suggestions.map((s, idx) => (
          <button
            key={idx}
            onClick={() => onSelectSuggestion(s.question)}
            disabled={isLoading}
            className="text-left text-[10px] font-medium text-slate-600 bg-white border border-slate-200 hover:border-primary hover:text-primary hover:bg-primary/5 px-2.5 py-1.5 rounded-lg shadow-sm transition-all duration-150 shrink-0"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Input panel */}
      <div className="p-3 border-t border-slate-100 bg-white shrink-0 flex gap-2">
        <Input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !isLoading && onSubmit()}
          placeholder="Pergunte em linguagem natural ou clique nos campos..."
          className="flex-1 h-9 text-xs bg-slate-50 border-slate-200 focus:bg-white focus:border-primary focus:ring-primary/10 rounded-xl"
          disabled={isLoading}
        />
        <Button
          onClick={onSubmit}
          disabled={isLoading || !input.trim()}
          className="h-9 w-9 p-0 bg-primary hover:bg-primary/95 text-white rounded-xl shrink-0 flex items-center justify-center"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
