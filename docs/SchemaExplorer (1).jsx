import { useState, useRef, useCallback, useMemo } from "react";
import {
  Database, Table2, KeyRound, Link2, Sparkles, Send, Code2, CircleDot,
  Bot, Megaphone, MessagesSquare, MessageSquare, Users, FunctionSquare,
  Wand2, X, Sigma, Hash, Percent,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 *  Schema Explorer — protótipo (tema claro / estilo Nexus Hub)
 *  - Tabelas curadas: nome de NEGÓCIO + técnico
 *  - RPCs listadas no rodapé do card (acendem quando usadas)
 *  - Chat text-to-SQL: highlight de TABELAS + CAMPOS + joins
 *  - Clique nos campos -> construtor de consulta em linguagem de negócio
 * ------------------------------------------------------------------ */

const CARD_W = 236;
const ROW_H = 28;
const HEAD_H = 52;
const PAD_Y = 14;
const NUMERIC = ["int4", "int8", "numeric"];

const tableHeight = (t) =>
  HEAD_H + t.fields.length * ROW_H + PAD_Y + (t.rpcs?.length ? 36 : 0);

const ICONS = { agents: Bot, campaigns: Megaphone, conversations: MessagesSquare, messages: MessageSquare, contacts: Users };

const TABLES = [
  {
    id: "agents", business: "Agentes de IA", tech: "agents",
    rpcs: ["evaluate_conversation_security"],
    fields: [
      { tech: "id", business: "Identificador", type: "uuid", k: "pk" },
      { tech: "name", business: "Nome do agente", type: "varchar", k: "req" },
      { tech: "status", business: "Situação", type: "agent_status", k: "req" },
      { tech: "type", business: "Tipo de canal", type: "varchar", k: "opt" },
      { tech: "risk_level", business: "Nível de risco", type: "risk_level", k: "opt" },
      { tech: "tenant_id", business: "Empresa", type: "uuid", k: "fk" },
    ],
  },
  {
    id: "campaigns", business: "Campanhas", tech: "campaigns",
    rpcs: ["get_all_campaigns_metrics_v2"],
    fields: [
      { tech: "id", business: "Identificador", type: "uuid", k: "pk" },
      { tech: "name", business: "Nome da campanha", type: "varchar", k: "req" },
      { tech: "status", business: "Situação", type: "campaign_status", k: "req" },
      { tech: "total_contacts", business: "Total de contatos", type: "int4", k: "opt" },
      { tech: "sent_count", business: "Enviadas", type: "int4", k: "opt" },
      { tech: "conversion_count", business: "Conversões", type: "int4", k: "opt" },
      { tech: "agent_id", business: "Agente responsável", type: "uuid", k: "fk" },
    ],
  },
  {
    id: "conversations", business: "Conversas", tech: "conversations",
    rpcs: ["get_conversation_establishments"],
    fields: [
      { tech: "id", business: "Identificador", type: "uuid", k: "pk" },
      { tech: "user_name", business: "Cliente", type: "varchar", k: "opt" },
      { tech: "channel", business: "Canal", type: "conversation_channel", k: "req" },
      { tech: "status", business: "Situação", type: "conversation_status", k: "req" },
      { tech: "last_message_at", business: "Última mensagem", type: "timestamptz", k: "opt" },
      { tech: "agent_id", business: "Agente", type: "uuid", k: "fk" },
    ],
  },
  {
    id: "messages", business: "Mensagens", tech: "messages",
    rpcs: ["fn_fetch_next_inbound_message"],
    fields: [
      { tech: "id", business: "Identificador", type: "uuid", k: "pk" },
      { tech: "content", business: "Conteúdo", type: "text", k: "opt" },
      { tech: "sender_type", business: "Remetente", type: "varchar", k: "req" },
      { tech: "message_type", business: "Tipo", type: "varchar", k: "opt" },
      { tech: "created_at", business: "Enviada em", type: "timestamptz", k: "opt" },
      { tech: "conversation_id", business: "Conversa", type: "uuid", k: "fk" },
    ],
  },
  {
    id: "contacts", business: "Contatos", tech: "contacts", rpcs: [],
    fields: [
      { tech: "id", business: "Identificador", type: "uuid", k: "pk" },
      { tech: "name", business: "Nome", type: "varchar", k: "req" },
      { tech: "phone", business: "Telefone", type: "varchar", k: "opt" },
      { tech: "tenant_id", business: "Empresa", type: "uuid", k: "fk" },
    ],
  },
];

const INIT_POS = {
  agents: { x: 300, y: 16 },
  contacts: { x: 600, y: 28 },
  campaigns: { x: 26, y: 250 },
  conversations: { x: 300, y: 300 },
  messages: { x: 600, y: 300 },
};

const RELS = [
  { a: "campaigns", b: "agents", fk: "agent_id" },
  { a: "conversations", b: "agents", fk: "agent_id" },
  { a: "messages", b: "conversations", fk: "conversation_id" },
  { a: "contacts", b: "conversations", fk: "tenant_id" },
];

const biz = (id) => TABLES.find((t) => t.id === id).business;
const findRel = (a, b) => RELS.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
const fakeNum = (min, max) => Math.floor(min + Math.random() * (max - min));

const QUERIES = [
  {
    id: "q1", label: "Quantas campanhas ativas eu tenho?",
    answer: "Você tem **7 campanhas ativas** no momento.",
    sql: "select count(*)\nfrom campaigns\nwhere status = 'active';",
    tables: ["campaigns"], joins: [], rpcs: [],
    fields: { campaigns: ["status"] },
  },
  {
    id: "q6", label: "Como está a performance das campanhas?",
    answer: "Resumo consolidado das campanhas (via RPC de métricas):",
    rows: [{ l: "Enviadas", v: 48120 }, { l: "Entregues", v: 46900 }, { l: "Conversões", v: 441 }],
    sql: "select * from get_all_campaigns_metrics_v2(:tenant_id);",
    tables: ["campaigns"], joins: [], rpcs: ["get_all_campaigns_metrics_v2"],
    fields: { campaigns: ["sent_count", "conversion_count"] },
  },
  {
    id: "q2", label: "Quantas conversas cada agente atendeu?",
    answer: "No total **4 agentes** atenderam conversas este mês:",
    rows: [{ l: "Sofia (vendas)", v: 1280 }, { l: "Lia (suporte)", v: 740 }, { l: "Théo (cobrança)", v: 410 }, { l: "Gatekeeper", v: 96 }],
    sql: "select a.name, count(c.id) as conversas\nfrom agents a\njoin conversations c on c.agent_id = a.id\ngroup by a.name\norder by conversas desc;",
    tables: ["agents", "conversations"], joins: [["agents", "conversations"]], rpcs: [],
    fields: { agents: ["name", "id"], conversations: ["agent_id", "id"] },
  },
  {
    id: "q3", label: "Quantas mensagens foram trocadas nas conversas?",
    answer: "Foram **38.912 mensagens** trocadas nas conversas registradas.",
    sql: "select count(m.id)\nfrom messages m\njoin conversations c on m.conversation_id = c.id;",
    tables: ["conversations", "messages"], joins: [["conversations", "messages"]], rpcs: [],
    fields: { conversations: ["id"], messages: ["conversation_id", "id"] },
  },
  {
    id: "q4", label: "Qual agente gerou mais conversões?",
    answer: "A **Sofia** lidera em conversões nas campanhas:",
    rows: [{ l: "Sofia (vendas)", v: 312 }, { l: "Lia (suporte)", v: 88 }, { l: "Théo (cobrança)", v: 41 }],
    sql: "select a.name, sum(c.conversion_count) as conversoes\nfrom agents a\njoin campaigns c on c.agent_id = a.id\ngroup by a.name\norder by conversoes desc;",
    tables: ["agents", "campaigns"], joins: [["agents", "campaigns"]], rpcs: [],
    fields: { agents: ["name", "id"], campaigns: ["agent_id", "conversion_count"] },
  },
  {
    id: "q5", label: "Quantas mensagens vieram dos agentes ativos?",
    answer: "Os agentes ativos geraram **21.450 mensagens** (via conversas):",
    sql: "select count(m.id)\nfrom agents a\njoin conversations c on c.agent_id = a.id\njoin messages m on m.conversation_id = c.id\nwhere a.status = 'active';",
    tables: ["agents", "conversations", "messages"],
    joins: [["agents", "conversations"], ["conversations", "messages"]], rpcs: [],
    fields: { agents: ["status", "id"], conversations: ["agent_id", "id"], messages: ["conversation_id", "id"] },
  },
];

function matchQuery(text) {
  const t = text.toLowerCase();
  if (/(campanh).*(ativ)|(ativ).*(campanh)/.test(t)) return QUERIES[0];
  if (/performance|m(é|e)tric|resumo.*campanh/.test(t)) return QUERIES[1];
  if (/agente.*(ativ).*mensag|mensag.*agente.*ativ/.test(t)) return QUERIES[5];
  if (/convers(ã|a)o|convert/.test(t)) return QUERIES[4];
  if (/(mensagen|mensagem)/.test(t)) return QUERIES[3];
  if (/agente.*convers|convers.*agente/.test(t)) return QUERIES[2];
  if (/campanh/.test(t)) return QUERIES[0];
  return null;
}

export default function SchemaExplorer() {
  const [pos, setPos] = useState(INIT_POS);
  const [active, setActive] = useState(null);
  const [selected, setSelected] = useState([]); // construtor: [{t,f,business,type}]
  const [messages, setMessages] = useState([
    { role: "ai", text: "Pergunte em linguagem natural — ou **clique nos campos** ao lado para montar uma consulta. Eu aceno as tabelas, campos e RPCs que usei." },
  ]);
  const [input, setInput] = useState("");
  const drag = useRef(null);
  const canvasRef = useRef(null);
  const inputRef = useRef(null);

  const center = useCallback((id) => {
    const t = TABLES.find((x) => x.id === id);
    const p = pos[id];
    return { x: p.x + CARD_W / 2, y: p.y + tableHeight(t) / 2 };
  }, [pos]);

  const onPointerDown = (e, id) => {
    const rect = canvasRef.current.getBoundingClientRect();
    drag.current = { id, dx: e.clientX - rect.left - pos[id].x, dy: e.clientY - rect.top - pos[id].y };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const { id, dx, dy } = drag.current;
    setPos((p) => ({ ...p, [id]: { x: Math.max(0, e.clientX - rect.left - dx), y: Math.max(0, e.clientY - rect.top - dy) } }));
  };
  const onPointerUp = () => { drag.current = null; };

  const runQuery = (q) => {
    setActive(q);
    setMessages((m) => [
      ...m,
      { role: "user", text: q.label },
      { role: "ai", text: q.answer, rows: q.rows, sql: q.sql, tables: q.tables, joins: q.joins, rpcs: q.rpcs },
    ]);
  };

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    const q = matchQuery(text);
    setInput("");
    if (q) { runQuery({ ...q, label: text }); return; }
    setActive(null);
    setMessages((m) => [...m, { role: "user", text },
      { role: "ai", text: "Não mapeei essa pergunta neste protótipo. Use as sugestões ou clique nos campos para montar 👇" }]);
  };

  /* ---------- construtor por clique nos campos ---------- */
  const toggleField = (t, f) => {
    setSelected((s) => {
      const i = s.findIndex((x) => x.t === t.id && x.f === f.tech);
      if (i >= 0) return s.filter((_, j) => j !== i);
      return [...s, { t: t.id, f: f.tech, business: f.business, type: f.type, tableBusiness: t.business }];
    });
  };
  const isSelected = (tid, fld) => selected.some((x) => x.t === tid && x.f === fld);

  const buildAndRun = (action) => {
    const tables = [...new Set(selected.map((s) => s.t))];
    const fieldsMap = {};
    selected.forEach((s) => { (fieldsMap[s.t] ||= []).push(s.f); });
    const names = selected.map((s) => s.business);
    let sql, answer, label, joins = [];

    if (tables.length === 1) {
      const t = tables[0], cols = fieldsMap[t];
      if (action === "count") {
        sql = `select count(${cols[0]})\nfrom ${t};`;
        label = `Quantos registros de ${biz(t)}? (base: ${names.join(", ")})`;
        answer = `**${fakeNum(120, 900).toLocaleString("pt-BR")}** registros em ${biz(t)}.`;
      } else if (action === "sum") {
        sql = `select ${cols.map((c) => `sum(${c})`).join(", ")}\nfrom ${t};`;
        label = `Qual o total de ${names.join(" + ")} em ${biz(t)}?`;
        answer = `Total de ${names.join(" + ")}: **${fakeNum(5000, 90000).toLocaleString("pt-BR")}**.`;
      } else {
        sql = `select ${cols.map((c) => `round(avg(${c}),1)`).join(", ")}\nfrom ${t};`;
        label = `Qual a média de ${names.join(", ")} em ${biz(t)}?`;
        answer = `Média de ${names.join(", ")}: **${(fakeNum(50, 500) / 10).toFixed(1)}**.`;
      }
    } else {
      const [a, b] = tables;
      const rel = findRel(a, b);
      const on = rel ? `${rel.a}.${rel.fk} = ${rel.b}.id` : `${a}.id = ${b}.${a}_id`;
      if (rel) { (fieldsMap[rel.a] ||= []).push(rel.fk); (fieldsMap[rel.b] ||= []).push("id"); }
      joins = [[a, b]];
      const agg = action === "count" ? "count(*)" : `${action}(${(fieldsMap[b][0])})`;
      sql = `select ${agg}\nfrom ${a}\njoin ${b} on ${on};`;
      label = `Relacionar ${tables.map(biz).join(" × ")} (base: ${names.join(", ")})`;
      answer = `Cruzando ${tables.map(biz).join(" e ")}: **${fakeNum(100, 9000).toLocaleString("pt-BR")}**.`;
    }
    runQuery({ label, answer, sql, tables, joins, rpcs: [], fields: fieldsMap });
    setSelected([]);
  };

  const buildCustom = () => {
    const tables = [...new Set(selected.map((s) => s.t))].map(biz).join(" e ");
    setInput(`Quero analisar ${selected.map((s) => s.business).join(", ")} de ${tables}: `);
    setSelected([]);
    inputRef.current?.focus();
  };

  const hasNumeric = selected.some((s) => NUMERIC.includes(s.type));
  const multiTable = new Set(selected.map((s) => s.t)).size > 1;

  const activeTables = useMemo(() => new Set(active?.tables || []), [active]);
  const activeFields = active?.fields || {};
  const activeRpcs = useMemo(() => new Set(active?.rpcs || []), [active]);
  const activeJoins = active?.joins || [];

  return (
    <div className="sx-root">
      <style>{CSS}</style>

      <div className="sx-top">
        <div className="sx-brand">
          <span className="sx-logo"><Database size={16} /></span>
          <div>
            <div className="sx-title">Schema Explorer</div>
            <div className="sx-sub">Visão de negócio · consulta em linguagem natural</div>
          </div>
        </div>
        <div className="sx-legend">
          <span><i className="sw-ring" /> Tabela</span>
          <span><i className="sw-field" /> Campo</span>
          <span><i className="sw-dash" /> Join</span>
          <span><i className="sw-rpc" /> RPC</span>
        </div>
      </div>

      <div className="sx-body">
        <div className="sx-canvas" ref={canvasRef}
          onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
          <svg className="sx-edges" width="860" height="600">
            {RELS.map((r, i) => {
              const a = center(r.a), b = center(r.b);
              const on = activeJoins.some(([x, y]) => (x === r.a && y === r.b) || (x === r.b && y === r.a));
              return (
                <path key={i} fill="none" className={on ? "edge edge-active" : "edge"}
                  d={`M ${a.x} ${a.y} C ${(a.x + b.x) / 2} ${a.y}, ${(a.x + b.x) / 2} ${b.y}, ${b.x} ${b.y}`} />
              );
            })}
          </svg>

          {TABLES.map((t) => {
            const hot = activeTables.has(t.id);
            return (
              <div key={t.id} className={`sx-card${hot ? " hot" : ""}`}
                style={{ left: pos[t.id].x, top: pos[t.id].y, width: CARD_W }}>
                <div className="sx-card-head" onPointerDown={(e) => onPointerDown(e, t.id)}>
                  <span className="sx-card-icon">{(() => { const I = ICONS[t.id]; return <I size={14} />; })()}</span>
                  <div className="sx-card-names">
                    <span className="sx-card-biz">{t.business}</span>
                    <span className="sx-card-tech"><Table2 size={9} /> {t.tech}</span>
                  </div>
                </div>
                <div className="sx-rows">
                  {t.fields.map((f) => {
                    const fhot = (activeFields[t.id] || []).includes(f.tech);
                    const sel = isSelected(t.id, f.tech);
                    return (
                      <div key={f.tech}
                        className={`sx-row${fhot ? " fhot" : ""}${sel ? " sel" : ""}`}
                        onClick={() => toggleField(t, f)} title="Clique para montar uma consulta">
                        <span className={`sx-keyicon k-${f.k}`}>
                          {f.k === "pk" ? <KeyRound size={11} /> : f.k === "fk" ? <Link2 size={11} /> : <CircleDot size={9} />}
                        </span>
                        <span className="sx-field-biz">{f.business}</span>
                        <span className="sx-field-tech">{f.tech}</span>
                        <span className="sx-field-type">{f.type}</span>
                      </div>
                    );
                  })}
                </div>
                {t.rpcs?.length > 0 && (
                  <div className="sx-rpcs">
                    {t.rpcs.map((r) => (
                      <span key={r} className={`rpc-pill${activeRpcs.has(r) ? " hot" : ""}`}>
                        <FunctionSquare size={10} /> {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="sx-chat">
          <div className="sx-chat-head"><Sparkles size={15} /> <span>Pergunte aos seus dados</span></div>

          <div className="sx-msgs">
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <div className="bubble">
                  <span dangerouslySetInnerHTML={{ __html: mdBold(m.text) }} />
                  {m.rows && (
                    <div className="mini">
                      {(() => { const max = Math.max(...m.rows.map((r) => r.v));
                        return m.rows.map((r, j) => (
                          <div className="mini-row" key={j}>
                            <span className="mini-l">{r.l}</span>
                            <span className="mini-bar"><i style={{ width: `${(r.v / max) * 100}%` }} /></span>
                            <span className="mini-v">{r.v.toLocaleString("pt-BR")}</span>
                          </div>)); })()}
                    </div>
                  )}
                  {m.tables && (
                    <div className="chips">
                      {m.tables.map((tid) => { const tb = TABLES.find((x) => x.id === tid);
                        return <span className="chip" key={tid}>{tb.business} <em>{tb.tech}</em></span>; })}
                      {m.rpcs?.map((r) => <span className="chip rpc" key={r}><FunctionSquare size={10} /> {r}</span>)}
                    </div>
                  )}
                  {m.sql && (
                    <details className="sql">
                      <summary><Code2 size={12} /> SQL executado (read-only)</summary>
                      <pre>{m.sql}</pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>

          {selected.length > 0 && (
            <div className="builder">
              <div className="builder-head"><Wand2 size={13} /> Montando consulta</div>
              <div className="builder-chips">
                {selected.map((s, i) => (
                  <span className="bchip" key={i}>
                    {s.business} <small>{biz(s.t)}</small>
                    <button onClick={() => setSelected((p) => p.filter((_, j) => j !== i))}><X size={11} /></button>
                  </span>
                ))}
              </div>
              <div className="builder-q">
                {selected.length === 1
                  ? `Como você quer analisar «${selected[0].business}»?`
                  : `Como combinar os ${selected.length} campos${multiTable ? ` (vou relacionar ${[...new Set(selected.map((s) => s.t))].map(biz).join(" × ")})` : ""}?`}
              </div>
              <div className="builder-actions">
                {hasNumeric && <button onClick={() => buildAndRun("sum")}><Sigma size={12} /> Somar</button>}
                {hasNumeric && <button onClick={() => buildAndRun("avg")}><Percent size={12} /> Média</button>}
                <button onClick={() => buildAndRun("count")}><Hash size={12} /> Contar</button>
                <button className="ghost" onClick={buildCustom}>Personalizado…</button>
              </div>
            </div>
          )}

          <div className="sx-suggest">
            {QUERIES.map((q) => <button key={q.id} className="sgst" onClick={() => runQuery(q)}>{q.label}</button>)}
          </div>

          <div className="sx-input">
            <input ref={inputRef} value={input} placeholder="Pergunte ou clique nos campos…"
              onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
            <button onClick={submit}><Send size={15} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function mdBold(s) {
  return s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/«(.+?)»/g, "<em>«$1»</em>").replace(/\n/g, "<br/>");
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
.sx-root{
  --bg:220 33% 98%;--card:0 0% 100%;--fg:222 32% 14%;--muted:220 12% 50%;
  --border:220 20% 90%;--primary:243 75% 59%;--primary-soft:243 90% 96%;
  --amber:38 92% 50%;
  font-family:'Plus Jakarta Sans',sans-serif;color:hsl(var(--fg));background:hsl(var(--bg));
  border:1px solid hsl(var(--border));border-radius:16px;overflow:hidden;
  box-shadow:0 1px 2px rgba(16,24,40,.04),0 12px 40px -12px rgba(16,24,40,.12);
}
.sx-root *{box-sizing:border-box}
.sx-top{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;
  border-bottom:1px solid hsl(var(--border));background:#fff}
.sx-brand{display:flex;align-items:center;gap:11px}
.sx-logo{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;
  background:hsl(var(--primary));color:#fff;box-shadow:0 4px 12px -3px hsl(var(--primary)/.5)}
.sx-title{font-weight:700;font-size:15px;letter-spacing:-.01em}
.sx-sub{font-size:11.5px;color:hsl(var(--muted));margin-top:1px}
.sx-legend{display:flex;gap:13px;font-size:11px;color:hsl(var(--muted))}
.sx-legend span{display:flex;align-items:center;gap:5px}
.sw-ring{width:12px;height:12px;border-radius:4px;border:2px solid hsl(var(--primary));box-shadow:0 0 0 3px hsl(var(--primary)/.18)}
.sw-field{width:10px;height:10px;border-radius:50%;background:hsl(var(--primary))}
.sw-dash{width:16px;height:0;border-top:2px dashed hsl(var(--primary))}
.sw-rpc{width:12px;height:12px;border-radius:4px;border:1px dashed hsl(var(--primary));background:hsl(var(--primary-soft))}

.sx-body{display:flex;height:580px}
@media(max-width:820px){.sx-body{flex-direction:column;height:auto}}
.sx-canvas{position:relative;flex:1;min-width:0;overflow:auto;background-color:hsl(var(--bg));
  background-image:radial-gradient(hsl(220 16% 86%) 1px,transparent 1px);background-size:22px 22px}
.sx-edges{position:absolute;left:0;top:0;pointer-events:none}
.edge{stroke:hsl(220 18% 80%);stroke-width:1.5}
.edge-active{stroke:hsl(var(--primary));stroke-width:2.4;stroke-dasharray:7 6;
  animation:dash 1s linear infinite;filter:drop-shadow(0 0 4px hsl(var(--primary)/.5))}
@keyframes dash{to{stroke-dashoffset:-26}}

.sx-card{position:absolute;background:hsl(var(--card));border:1px solid hsl(var(--border));border-radius:12px;
  box-shadow:0 1px 2px rgba(16,24,40,.05),0 8px 24px -16px rgba(16,24,40,.4);
  transition:box-shadow .2s,border-color .2s,transform .2s;z-index:2}
.sx-card.hot{border-color:hsl(var(--primary));transform:translateY(-1px);
  box-shadow:0 0 0 3px hsl(var(--primary)/.16),0 14px 34px -14px hsl(var(--primary)/.5);
  animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 3px hsl(var(--primary)/.16),0 14px 34px -14px hsl(var(--primary)/.5)}
  50%{box-shadow:0 0 0 5px hsl(var(--primary)/.10),0 14px 34px -14px hsl(var(--primary)/.55)}}
.sx-card-head{display:flex;align-items:center;gap:9px;padding:11px 12px;cursor:grab;border-bottom:1px solid hsl(var(--border))}
.sx-card-head:active{cursor:grabbing}
.sx-card-icon{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;flex-shrink:0;
  background:hsl(var(--primary-soft));color:hsl(var(--primary))}
.sx-card-names{display:flex;flex-direction:column;line-height:1.2;min-width:0}
.sx-card-biz{font-weight:700;font-size:13px;letter-spacing:-.01em}
.sx-card-tech{display:flex;align-items:center;gap:3px;font-size:10px;color:hsl(var(--muted));font-family:'JetBrains Mono',monospace;margin-top:1px}
.sx-rows{padding:6px 0}
.sx-row{display:flex;align-items:center;gap:8px;padding:3px 12px;height:28px;font-size:12px;cursor:pointer;
  transition:background .12s;border-left:2px solid transparent}
.sx-row:hover{background:hsl(220 33% 97%)}
.sx-row.sel{background:hsl(var(--primary-soft));border-left-color:hsl(var(--primary))}
.sx-row.fhot{animation:fieldblink 1.1s ease-in-out infinite}
@keyframes fieldblink{0%,100%{background:transparent}50%{background:hsl(var(--primary)/.20)}}
.sx-keyicon{display:grid;place-items:center;width:14px;color:hsl(var(--muted))}
.sx-keyicon.k-pk{color:hsl(var(--amber))}
.sx-keyicon.k-fk{color:hsl(var(--primary))}
.sx-field-biz{flex:1;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sx-field-tech{font-family:'JetBrains Mono',monospace;font-size:9.5px;color:hsl(220 12% 65%)}
.sx-field-type{font-family:'JetBrains Mono',monospace;font-size:9.5px;color:hsl(var(--muted));background:hsl(220 24% 96%);padding:1px 5px;border-radius:5px}
.sx-rpcs{display:flex;flex-wrap:wrap;gap:5px;padding:9px 12px;border-top:1px dashed hsl(var(--border));background:hsl(220 33% 98.5%)}
.rpc-pill{display:inline-flex;align-items:center;gap:4px;font-family:'JetBrains Mono',monospace;font-size:9px;
  padding:3px 7px;border-radius:6px;background:#fff;border:1px dashed hsl(220 20% 82%);color:hsl(var(--muted))}
.rpc-pill.hot{border-color:hsl(var(--primary));color:hsl(var(--primary));background:hsl(var(--primary-soft));
  box-shadow:0 0 0 2px hsl(var(--primary)/.14);animation:pulse 1.6s ease-in-out infinite}

.sx-chat{width:360px;flex-shrink:0;display:flex;flex-direction:column;border-left:1px solid hsl(var(--border));background:#fff}
@media(max-width:820px){.sx-chat{width:100%;border-left:none;border-top:1px solid hsl(var(--border));height:520px}}
.sx-chat-head{display:flex;align-items:center;gap:8px;padding:13px 16px;font-weight:600;font-size:13px;color:hsl(var(--primary));border-bottom:1px solid hsl(var(--border))}
.sx-msgs{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:12px}
.msg{display:flex}.msg.user{justify-content:flex-end}
.bubble{max-width:88%;font-size:12.5px;line-height:1.5;padding:10px 12px;border-radius:13px}
.msg.ai .bubble{background:hsl(220 33% 97%);border:1px solid hsl(var(--border));border-top-left-radius:4px}
.msg.user .bubble{background:hsl(var(--primary));color:#fff;border-top-right-radius:4px}
.bubble strong{font-weight:700}.bubble em{font-style:normal;font-weight:600}
.mini{margin-top:9px;display:flex;flex-direction:column;gap:6px}
.mini-row{display:flex;align-items:center;gap:8px;font-size:11px}
.mini-l{width:104px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mini-bar{flex:1;height:8px;background:hsl(220 24% 93%);border-radius:5px;overflow:hidden}
.mini-bar i{display:block;height:100%;background:hsl(var(--primary));border-radius:5px}
.mini-v{font-family:'JetBrains Mono',monospace;font-size:10.5px;color:hsl(var(--muted));min-width:42px;text-align:right}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.chip{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;padding:3px 8px;border-radius:7px;
  background:hsl(var(--primary-soft));color:hsl(var(--primary));border:1px solid hsl(var(--primary)/.25)}
.chip.rpc{font-family:'JetBrains Mono',monospace;font-weight:400;border-style:dashed}
.chip em{font-style:normal;font-family:'JetBrains Mono',monospace;font-weight:400;opacity:.7;font-size:9.5px}
.sql{margin-top:10px;font-size:11px}
.sql summary{display:flex;align-items:center;gap:5px;cursor:pointer;color:hsl(var(--muted));font-weight:600;list-style:none}
.sql summary::-webkit-details-marker{display:none}
.sql pre{margin:8px 0 0;padding:10px;border-radius:9px;background:hsl(222 30% 13%);color:hsl(220 30% 88%);
  font-family:'JetBrains Mono',monospace;font-size:10.5px;line-height:1.55;overflow:auto;white-space:pre-wrap}

.builder{margin:0 12px 10px;padding:11px;border:1px solid hsl(var(--primary)/.35);border-radius:12px;
  background:hsl(var(--primary-soft));animation:slideup .2s ease}
@keyframes slideup{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.builder-head{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:hsl(var(--primary));text-transform:uppercase;letter-spacing:.04em}
.builder-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.bchip{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:3px 4px 3px 9px;border-radius:7px;background:#fff;border:1px solid hsl(var(--primary)/.3);color:hsl(var(--fg))}
.bchip small{color:hsl(var(--muted));font-weight:500}
.bchip button{display:grid;place-items:center;border:none;background:hsl(220 24% 94%);color:hsl(var(--muted));width:16px;height:16px;border-radius:5px;cursor:pointer}
.bchip button:hover{background:hsl(0 70% 92%);color:hsl(0 65% 45%)}
.builder-q{font-size:12px;font-weight:600;margin:2px 0 9px}
.builder-actions{display:flex;flex-wrap:wrap;gap:6px}
.builder-actions button{display:inline-flex;align-items:center;gap:5px;font-family:inherit;font-size:11.5px;font-weight:600;cursor:pointer;
  padding:6px 10px;border-radius:8px;border:1px solid hsl(var(--primary));background:hsl(var(--primary));color:#fff;transition:.15s}
.builder-actions button:hover{filter:brightness(1.08)}
.builder-actions button.ghost{background:#fff;color:hsl(var(--primary))}

.sx-suggest{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px;border-top:1px solid hsl(var(--border));max-height:106px;overflow:auto}
.sgst{font-family:inherit;font-size:11px;font-weight:500;color:hsl(var(--fg));cursor:pointer;background:hsl(220 33% 97%);
  border:1px solid hsl(var(--border));border-radius:8px;padding:6px 9px;transition:.15s;text-align:left}
.sgst:hover{border-color:hsl(var(--primary));color:hsl(var(--primary));background:hsl(var(--primary-soft))}
.sx-input{display:flex;gap:8px;padding:12px 14px;border-top:1px solid hsl(var(--border))}
.sx-input input{flex:1;font-family:inherit;font-size:12.5px;padding:9px 12px;border-radius:10px;border:1px solid hsl(var(--border));outline:none;background:hsl(220 33% 98%)}
.sx-input input:focus{border-color:hsl(var(--primary));box-shadow:0 0 0 3px hsl(var(--primary)/.14);background:#fff}
.sx-input button{width:38px;flex-shrink:0;display:grid;place-items:center;border:none;cursor:pointer;border-radius:10px;background:hsl(var(--primary));color:#fff;transition:.15s}
.sx-input button:hover{filter:brightness(1.08)}
`;
