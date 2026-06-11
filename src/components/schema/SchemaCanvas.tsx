import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
  BackgroundVariant,
  applyNodeChanges
} from '@xyflow/react';
import { TableNode } from './TableNode';
import '@xyflow/react/dist/style.css';
import { Bot, Megaphone, MessagesSquare, MessageSquare, Users } from 'lucide-react';

// Real prototype icons mapping
const ICONS: Record<string, React.ComponentType<any>> = {
  agents: Bot,
  campaigns: Megaphone,
  conversations: MessagesSquare,
  messages: MessageSquare,
  contacts: Users
};

// Relationships defining join edges
const RELS = [
  { a: "campaigns", b: "agents", fk: "agent_id" },
  { a: "conversations", b: "agents", fk: "agent_id" },
  { a: "messages", b: "conversations", fk: "conversation_id" },
  { a: "contacts", b: "conversations", fk: "tenant_id" },
];

const nodeTypes = {
  tableNode: TableNode
};

interface SchemaCanvasProps {
  viewConfig: any;
  tables: any[];
  queryResult: any;
  selectedFields: Array<{ table: string; column: string; type: string }>;
  onFieldToggle: (table: string, column: string, type: string) => void;
  onNodesChange: (nodes: Node[]) => void;
}

export function SchemaCanvas({
  viewConfig,
  tables,
  queryResult,
  selectedFields,
  onFieldToggle,
  onNodesChange
}: SchemaCanvasProps) {

  const [localNodes, setLocalNodes] = useState<Node[]>([]);

  // Sync database view config and dynamic hot query states into local React Flow Nodes
  useEffect(() => {
    setLocalNodes((prevNodes) => {
      if (prevNodes.length === 0) {
        return tables.map((t): Node => {
          const nodeCfg = viewConfig.nodes?.find((n: any) => n.table === t.tech);
          const position = nodeCfg ? { x: nodeCfg.x, y: nodeCfg.y } : { x: 0, y: 0 };
          
          const mappedFields = t.fields.map((f: any) => ({
            tech: f.tech,
            business: viewConfig.mappings?.[t.tech]?.columns?.[f.tech] || f.business || f.tech,
            type: f.type,
            k: f.k
          }));

          return {
            id: t.tech,
            type: 'tableNode',
            position,
            data: {
              tableName: t.tech,
              label: viewConfig.mappings?.[t.tech]?.label || t.business || t.tech,
              fields: mappedFields,
              rpcs: t.rpcs,
              hot: queryResult?.tablesUsed?.includes(t.tech) || false,
              hotColumns: queryResult?.columnsUsed?.[t.tech] || [],
              hotRpcs: queryResult?.rpcsUsed?.filter((r: string) => t.rpcs?.includes(r)) || [],
              selectedFields: selectedFields
                .filter((sf) => sf.table === t.tech)
                .map((sf) => sf.column),
              onFieldClick: (field: any) => onFieldToggle(t.tech, field.tech, field.type),
              icon: ICONS[t.tech]
            }
          };
        });
      }

      return prevNodes.map((n) => {
        const t = tables.find((tbl) => tbl.tech === n.id);
        if (!t) return n;

        const nodeCfg = viewConfig.nodes?.find((nc: any) => nc.table === n.id);
        const position = nodeCfg && (nodeCfg.x !== Math.round(n.position.x) || nodeCfg.y !== Math.round(n.position.y))
          ? { x: nodeCfg.x, y: nodeCfg.y }
          : n.position;

        const mappedFields = t.fields.map((f: any) => ({
          tech: f.tech,
          business: viewConfig.mappings?.[t.tech]?.columns?.[f.tech] || f.business || f.tech,
          type: f.type,
          k: f.k
        }));

        return {
          ...n,
          position,
          data: {
            ...n.data,
            tableName: t.tech,
            label: viewConfig.mappings?.[t.tech]?.label || t.business || t.tech,
            fields: mappedFields,
            rpcs: t.rpcs,
            hot: queryResult?.tablesUsed?.includes(t.tech) || false,
            hotColumns: queryResult?.columnsUsed?.[t.tech] || [],
            hotRpcs: queryResult?.rpcsUsed?.filter((r: string) => t.rpcs?.includes(r)) || [],
            selectedFields: selectedFields
              .filter((sf) => sf.table === t.tech)
              .map((sf) => sf.column),
            onFieldClick: (field: any) => onFieldToggle(t.tech, field.tech, field.type),
            icon: ICONS[t.tech]
          }
        };
      });
    });
  }, [tables, viewConfig.mappings, viewConfig.nodes, queryResult, selectedFields, onFieldToggle]);

  // Generate join edges, identifying which ones are active based on the IA query result joins
  const edges = useMemo((): Edge[] => {
    return RELS.map((rel): Edge => {
      const isHot = queryResult?.joins?.some(
        ([x, y]: string[]) => (x === rel.a && y === rel.b) || (x === rel.b && y === rel.a)
      ) || false;

      return {
        id: `edge-${rel.a}-${rel.b}`,
        source: rel.a,
        target: rel.b,
        sourceHandle: 'right',
        targetHandle: 'left',
        animated: isHot,
        className: isHot ? 'edge-hot' : 'edge-normal',
        style: {
          stroke: isHot ? 'hsl(var(--primary))' : 'hsl(var(--border))',
          strokeWidth: isHot ? 2.5 : 1.5
        }
      };
    });
  }, [queryResult]);

  // Capture node dragging changes to update position inside state and save to backend
  const handleNodesChange = useCallback((changes: any) => {
    setLocalNodes((nds) => {
      const updated = applyNodeChanges(changes, nds);
      
      const isDragEnd = changes.some((c: any) => c.type === 'position' && c.dragging === false);
      const isSimplePosition = changes.some((c: any) => c.type === 'position' && c.dragging === undefined);
      
      if (isDragEnd || isSimplePosition) {
        onNodesChange(updated);
      }
      return updated;
    });
  }, [onNodesChange]);

  return (
    <div className="w-full h-full relative bg-slate-50 border-r border-slate-200">
      <ReactFlow
        nodes={localNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.5}
        maxZoom={1.5}
        nodesConnectable={false}
        nodesDraggable={true}
        className="schema-canvas"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#cbd5e1" />
        <Controls showInteractive={false} className="!bg-white !border-slate-200 !shadow-md !rounded-lg overflow-hidden" />
      </ReactFlow>
      
      {/* Styles for dynamic HSL brand colors in Canvas */}
      <style>{`
        .edge-hot path {
          stroke: hsl(var(--primary)) !important;
          stroke-width: 2.5px !important;
          stroke-dasharray: 7 6;
          animation: dash 1s linear infinite;
          filter: drop-shadow(0 0 3px hsl(var(--primary)/.4));
        }
        @keyframes dash {
          to {
            stroke-dashoffset: -26;
          }
        }
        .animate-pulse-subtle {
          animation: pulse-subtle 2s infinite ease-in-out;
        }
        @keyframes pulse-subtle {
          0%, 100% {
            box-shadow: 0 0 0 2px hsl(var(--primary)/0.1), 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          }
          50% {
            box-shadow: 0 0 0 4px hsl(var(--primary)/0.15), 0 10px 15px -3px rgba(0, 0, 0, 0.1);
          }
        }
        .animate-field-blink {
          animation: field-blink 1.2s ease-in-out infinite;
        }
        @keyframes field-blink {
          0%, 100% {
            background-color: transparent;
          }
          50% {
            background-color: hsl(var(--primary)/0.15);
          }
        }
      `}</style>
    </div>
  );
}
