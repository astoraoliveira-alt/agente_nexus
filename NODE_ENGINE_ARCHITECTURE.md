# Davos Nexus — Node Engine Architecture
## Plano Técnico Detalhado: Backend Distribuído + Execution Router

> **Data:** 03/Abr/2026  
> **Versão:** 1.0 — Blueprint Inicial  
> **Contexto:** Arquitetura do futuro `porteiro/src/engine/` que coexiste com N8N via Execution Router  
> **Premissa:** Cada funcionalidade = uma classe = um arquivo. Distribuído por responsabilidade (in-process), não por rede.

---

## 1. O Princípio Central: Execution Router

### 1.1 A Chave de Roteamento

O roteamento é controlado por **um único campo** na tabela `agents`:

```sql
-- Adicionar na tabela agents (migration simples)
ALTER TABLE public.agents
ADD COLUMN execution_mode VARCHAR(10) DEFAULT 'n8n'
CHECK (execution_mode IN ('n8n', 'node'));

-- Para ativar o Node Engine em um agente específico:
UPDATE public.agents SET execution_mode = 'node' WHERE id = '[agent_id]';

-- Para rollback instantâneo (sem nenhum deploy):
UPDATE public.agents SET execution_mode = 'n8n' WHERE id = '[agent_id]';
```

**Por que no banco e não em variável de ambiente?**
- Rollback por agente (granularidade fina)
- Sem reiniciar o Porteiro
- Editável pela UI de agentes (já existe o painel)
- Auditável pelo `trg_audit_agents` (histórico de quem mudou)

### 1.2 A Interface Comum (Contrato)

Tanto N8N quanto Node Engine implementam a mesma interface. O Porteiro não sabe qual está rodando:

```typescript
// porteiro/src/engine/IExecutionEngine.ts

export interface MessageContext {
  queueId: string;
  traceId: string;
  tenantId: string;
  agentId: string;
  conversationId: string;
  phone: string;
  content: string;
  messageType: 'text' | 'audio' | 'image' | 'video' | 'document';
  mediaUrl?: string;
  mediaMimetype?: string;
  mediaBase64?: string;
  executionMode: 'n8n' | 'node';
  agent: AgentConfig;
  n8nExecutionId: string;
}

export interface ExecutionResult {
  success: boolean;
  responseText?: string;
  traceId: string;
  durationMs: number;
  tokensUsed?: number;
  error?: string;
}

export interface IExecutionEngine {
  execute(context: MessageContext): Promise<ExecutionResult>;
  healthCheck(): Promise<boolean>;
}
```

### 1.3 O Router no Porteiro

```typescript
// porteiro/src/engine/ExecutionRouter.ts

import { N8NEngine } from './engines/N8NEngine';
import { NodeEngine } from './engines/NodeEngine';
import { IExecutionEngine, MessageContext } from './IExecutionEngine';

export class ExecutionRouter {
  private readonly n8nEngine: IExecutionEngine;
  private readonly nodeEngine: IExecutionEngine;

  constructor() {
    this.n8nEngine = new N8NEngine();
    this.nodeEngine = new NodeEngine();
  }

  route(agent: { execution_mode: 'n8n' | 'node' }): IExecutionEngine {
    return agent.execution_mode === 'node'
      ? this.nodeEngine
      : this.n8nEngine; // padrão atual — sem breaking change
  }

  async dispatch(context: MessageContext): Promise<ExecutionResult> {
    const engine = this.route(context.agent);
    const start = Date.now();

    try {
      const result = await engine.execute(context);
      return { ...result, durationMs: Date.now() - start };
    } catch (error) {
      // fallback automático para N8N em caso de erro do Node Engine
      if (context.agent.execution_mode === 'node') {
        logger.warn(`Node Engine falhou (${error.message}). Fallback para N8N.`);
        const fallback = await this.n8nEngine.execute(context);
        return { ...fallback, durationMs: Date.now() - start };
      }
      throw error;
    }
  }
}
```

### 1.4 O N8NEngine (Wrapper do Comportamento Atual)

```typescript
// porteiro/src/engine/engines/N8NEngine.ts
// Encapsula exatamente o que o Porteiro já faz hoje

import { IExecutionEngine, MessageContext, ExecutionResult } from '../IExecutionEngine';

export class N8NEngine implements IExecutionEngine {
  async execute(context: MessageContext): Promise<ExecutionResult> {
    const start = Date.now();

    const response = await fetch(process.env.N8N_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queueId: context.queueId,
        traceId: context.traceId,
        n8nExecutionId: context.n8nExecutionId,
        // ... resto do payload atual
      }),
    });

    if (!response.ok) {
      throw new Error(`N8N retornou ${response.status}`);
    }

    return {
      success: true,
      traceId: context.traceId,
      durationMs: Date.now() - start,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${process.env.N8N_BASE_URL}/healthz`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
```

---

## 2. Estrutura de Diretórios do Node Engine

```
porteiro/src/engine/
│
├── IExecutionEngine.ts              # Contrato/Interface comum
├── ExecutionRouter.ts               # O switch principal
│
├── engines/
│   ├── N8NEngine.ts                 # Wrapper do comportamento atual
│   └── NodeEngine.ts               # Orquestrador do pipeline Node
│
├── orchestrator/
│   └── MessageOrchestrator.ts      # Controlador de fluxo (substitui os IFs do N8N)
│
├── services/                        # ← CADA CLASSE = UMA RESPONSABILIDADE
│   │
│   ├── media/
│   │   ├── AudioTranscriberService.ts    # STT: Whisper / VAPI
│   │   ├── ImageOCRService.ts            # OCR: OpenAI Vision
│   │   ├── StorageService.ts             # Upload/Download Supabase Bucket
│   │   └── MediaDownloaderService.ts    # Download base64 da Evolution/Zenvia
│   │
│   ├── intelligence/
│   │   ├── IntentClassifierService.ts    # Classificação de intenção (LLM)
│   │   ├── LLMService.ts                 # Chamada ao LLM (OpenAI/Anthropic)
│   │   ├── RAGService.ts                 # Busca vetorial + injeção de contexto
│   │   └── PromptBuilderService.ts      # Monta o prompt final para o LLM
│   │
│   ├── conversation/
│   │   ├── ConversationService.ts        # Abre/fecha/reabre conversas
│   │   ├── MessageRecorderService.ts     # Grava mensagens na tabela messages
│   │   ├── StateManagerService.ts        # Lê/escreve context_state (JSONB)
│   │   └── ChatMemoryService.ts          # Histórico LangChain (chat_histories_memory)
│   │
│   ├── security/
│   │   ├── GatekeeperService.ts          # Identity Gate: CPF/CNPJ
│   │   ├── SessionManagerService.ts      # conversation_security_sessions
│   │   └── AntiBanService.ts             # Detecção de spam/banned
│   │
│   ├── messaging/
│   │   ├── EvolutionProvider.ts          # Envio via Evolution API
│   │   ├── ZenviaProvider.ts             # Envio via Zenvia BSP
│   │   └── MessagingService.ts           # Router de provider (evolution|zenvia)
│   │
│   ├── billing/
│   │   ├── TelemetryService.ts           # fn_track_llm_usage
│   │   └── QuotaGuardService.ts          # Verifica se tenant atingiu limite
│   │
│   └── governance/
│       ├── PolicyEnforcerService.ts      # canDo / cannotDo do agente
│       └── AuditLoggerService.ts         # Grava audit_logs
│
├── workers/                              # Workers de background (não bloqueantes)
│   ├── InboundQueueWorker.ts             # Consome inbound_queue continuamente
│   ├── CampaignWorker.ts                 # Processa outbound_queue
│   ├── AuditWorker.ts                    # Fila de auditoria de conversas
│   └── IdleConversationWorker.ts         # Fecha conversas inativas
│
└── types/
    ├── AgentConfig.ts                    # Tipo do agente (brain_config, etc)
    ├── ConversationContext.ts            # Tipo do contexto de execução
    └── ServiceResult.ts                  # Tipo de retorno padronizado
```

---

## 3. O NodeEngine — Orquestrador Principal

```typescript
// porteiro/src/engine/engines/NodeEngine.ts
// Este é o "N8N em código" — controla o fluxo completo

import { IExecutionEngine, MessageContext, ExecutionResult } from '../IExecutionEngine';
import { MessageOrchestrator } from '../orchestrator/MessageOrchestrator';
import { TelemetryService } from '../services/billing/TelemetryService';
import { AuditLoggerService } from '../services/governance/AuditLoggerService';

export class NodeEngine implements IExecutionEngine {
  private readonly orchestrator: MessageOrchestrator;
  private readonly telemetry: TelemetryService;
  private readonly auditLogger: AuditLoggerService;

  constructor() {
    this.orchestrator = new MessageOrchestrator();
    this.telemetry = new TelemetryService();
    this.auditLogger = new AuditLoggerService();
  }

  async execute(context: MessageContext): Promise<ExecutionResult> {
    const start = Date.now();

    // 1. Delega para o orquestrador de fluxo
    const result = await this.orchestrator.process(context);

    // 2. Telemetria (sempre, independente do resultado)
    if (result.tokensUsed) {
      await this.telemetry.track({
        traceId: context.traceId,
        tenantId: context.tenantId,
        agentId: context.agentId,
        tokens: result.tokensUsed,
        durationMs: Date.now() - start,
      });
    }

    return { ...result, durationMs: Date.now() - start };
  }

  async healthCheck(): Promise<boolean> {
    return true; // in-process, sempre disponível
  }
}
```

---

## 4. O MessageOrchestrator — O "Canvas do N8N" em Código

Este é o coração do Node Engine. Substitui todos os IFs e Switches visuais do N8N por código TypeScript legível e testável:

```typescript
// porteiro/src/engine/orchestrator/MessageOrchestrator.ts

import { MessageContext } from '../IExecutionEngine';
import { MediaDownloaderService } from '../services/media/MediaDownloaderService';
import { AudioTranscriberService } from '../services/media/AudioTranscriberService';
import { ImageOCRService } from '../services/media/ImageOCRService';
import { IntentClassifierService } from '../services/intelligence/IntentClassifierService';
import { GatekeeperService } from '../services/security/GatekeeperService';
import { RAGService } from '../services/intelligence/RAGService';
import { PromptBuilderService } from '../services/intelligence/PromptBuilderService';
import { LLMService } from '../services/intelligence/LLMService';
import { MessagingService } from '../services/messaging/MessagingService';
import { MessageRecorderService } from '../services/conversation/MessageRecorderService';
import { ConversationService } from '../services/conversation/ConversationService';
import { StateManagerService } from '../services/conversation/StateManagerService';
import { QuotaGuardService } from '../services/billing/QuotaGuardService';
import { AntiBanService } from '../services/security/AntiBanService';

export class MessageOrchestrator {
  constructor(
    private readonly mediaDownloader = new MediaDownloaderService(),
    private readonly audioTranscriber = new AudioTranscriberService(),
    private readonly imageOCR = new ImageOCRService(),
    private readonly intentClassifier = new IntentClassifierService(),
    private readonly gatekeeper = new GatekeeperService(),
    private readonly ragService = new RAGService(),
    private readonly promptBuilder = new PromptBuilderService(),
    private readonly llm = new LLMService(),
    private readonly messaging = new MessagingService(),
    private readonly messageRecorder = new MessageRecorderService(),
    private readonly conversationService = new ConversationService(),
    private readonly stateManager = new StateManagerService(),
    private readonly quotaGuard = new QuotaGuardService(),
    private readonly antiBan = new AntiBanService(),
  ) {}

  async process(context: MessageContext) {
    // ── [STEP 1] Guardrails de entrada ─────────────────────────────────
    const isBanned = await this.antiBan.check(context.phone, context.tenantId);
    if (isBanned) return this.silentDrop(context, 'contact_banned');

    const quotaOk = await this.quotaGuard.check(context.tenantId, context.agentId);
    if (!quotaOk) return this.silentDrop(context, 'quota_exceeded');

    // ── [STEP 2] Pré-processamento de mídia ────────────────────────────
    let textContent = context.content;

    if (context.messageType === 'audio') {
      // AudioTranscriberService → Whisper API
      const { transcription, durationSeconds } = await this.audioTranscriber.transcribe({
        mediaUrl: context.mediaUrl!,
        mediaBase64: context.mediaBase64,
        tenantId: context.tenantId,
        traceId: context.traceId,
      });
      textContent = transcription;
      context = { ...context, content: transcription, audioDurationSeconds: durationSeconds };
    }

    if (context.messageType === 'image') {
      // ImageOCRService → OpenAI Vision
      const { extractedText } = await this.imageOCR.extract({
        mediaUrl: context.mediaUrl!,
        mediaBase64: context.mediaBase64,
        traceId: context.traceId,
      });
      textContent = extractedText;
      context = { ...context, content: extractedText };
    }

    // ── [STEP 3] Abertura/reabertura de conversa ───────────────────────
    const conversation = await this.conversationService.openOrResume({
      tenantId: context.tenantId,
      agentId: context.agentId,
      phone: context.phone,
      channel: 'whatsapp',
    });

    // ── [STEP 4] Restauração de estado (context_state) ─────────────────
    const currentState = await this.stateManager.load(conversation.id);

    // ── [STEP 5] Classificação de intenção ────────────────────────────
    // Rápido e barato (usa modelo menor: gpt-4o-mini)
    // Objetivo: decidir ANTES de chamar o LLM principal
    const intent = await this.intentClassifier.classify({
      message: textContent,
      conversationHistory: currentState.recentMessages,
      agentPolicies: context.agent.brain_config.policies,
    });

    // ── [STEP 6] Verificação de segurança (Identity Gate) ──────────────
    if (intent.requiresAuth && !currentState.isAuthenticated) {
      // GatekeeperService — solicita CPF/CNPJ ao usuário
      const gatekeeperResponse = await this.gatekeeper.challenge({
        conversationId: conversation.id,
        intent: intent.name,
        agentConfig: context.agent,
      });

      await this.messaging.send({
        provider: context.agent.whatsapp_provider,
        phone: context.phone,
        text: gatekeeperResponse.challengeMessage,
        agentConfig: context.agent,
      });

      await this.messageRecorder.record({
        conversationId: conversation.id,
        content: gatekeeperResponse.challengeMessage,
        senderType: 'ai',
        traceId: context.traceId,
        tenantId: context.tenantId,
      });

      return { success: true, traceId: context.traceId };
    }

    // ── [STEP 7] RAG — Recuperação de conhecimento relevante ───────────
    // Paralelizado com a construção do histórico (Promise.all)
    const [ragContext, chatHistory] = await Promise.all([
      this.ragService.retrieve({
        query: textContent,
        agentId: context.agentId,
        topK: 5,
      }),
      this.conversationService.getHistory({
        conversationId: conversation.id,
        limit: context.agent.context_window ?? 20,
      }),
    ]);

    // ── [STEP 8] Construção do prompt final ────────────────────────────
    const prompt = await this.promptBuilder.build({
      systemPrompt: context.agent.brain_config.systemPrompt,
      policies: context.agent.brain_config.policies,
      ragContext,
      chatHistory,
      currentMessage: textContent,
      contextState: currentState,
      leadInfo: context.leadInfo,
    });

    // ── [STEP 9] Chamada ao LLM ────────────────────────────────────────
    const llmResult = await this.llm.complete({
      prompt,
      model: context.agent.brain_config.modelId ?? 'gpt-4o',
      temperature: context.agent.brain_config.temperature ?? 0.7,
      maxTokens: context.agent.brain_config.maxTokens ?? 1024,
      tools: intent.allowTools ? context.agent.tools : [],
      traceId: context.traceId,
    });

    // ── [STEP 10] Envio da resposta ────────────────────────────────────
    await this.messaging.send({
      provider: context.agent.whatsapp_provider,
      phone: context.phone,
      text: llmResult.response,
      agentConfig: context.agent,
    });

    // ── [STEP 11] Persistência (em paralelo — não bloqueia o usuário) ──
    await Promise.all([
      // Grava a mensagem do usuário
      this.messageRecorder.record({
        conversationId: conversation.id,
        content: textContent,
        senderType: 'user',
        traceId: context.traceId,
        tenantId: context.tenantId,
        messageType: context.messageType,
        mediaUrl: context.mediaUrl,
        transcription: context.messageType === 'audio' ? textContent : undefined,
      }),
      // Grava a resposta da IA
      this.messageRecorder.record({
        conversationId: conversation.id,
        content: llmResult.response,
        senderType: 'ai',
        traceId: context.traceId,
        tenantId: context.tenantId,
      }),
      // Atualiza context_state com novos flags/intents
      this.stateManager.save(conversation.id, {
        ...currentState,
        lastIntent: intent.name,
        lastMessageAt: new Date().toISOString(),
      }),
    ]);

    return {
      success: true,
      responseText: llmResult.response,
      traceId: context.traceId,
      tokensUsed: llmResult.tokensUsed,
    };
  }

  private silentDrop(context: MessageContext, reason: string) {
    logger.info(`[${context.traceId}] Silent drop: ${reason}`);
    return { success: true, traceId: context.traceId }; // sem resposta ao usuário
  }
}
```

---

## 5. Cada Serviço em Detalhe

### 5.1 IntentClassifierService — Classificador de Intenção

```typescript
// porteiro/src/engine/services/intelligence/IntentClassifierService.ts

export interface IntentResult {
  name: string;           // 'financial_query' | 'greeting' | 'complaint' | 'human_handoff' | ...
  confidence: number;     // 0.0 - 1.0
  requiresAuth: boolean;  // exige Identity Gate?
  allowTools: boolean;    // pode usar ferramentas financeiras?
  isSpam: boolean;        // detectado como spam?
}

export class IntentClassifierService {
  private readonly model = 'gpt-4o-mini'; // modelo leve para classificação rápida
  private readonly cache = new Map<string, IntentResult>(); // cache de intenções similares

  async classify(params: {
    message: string;
    conversationHistory: string[];
    agentPolicies: string[];
  }): Promise<IntentResult> {

    // Cache por hash da mensagem (evita LLM call em mensagens repetidas)
    const cacheKey = this.hash(params.message);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const response = await openai.chat.completions.create({
      model: this.model,
      temperature: 0,        // determinístico para classificação
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Classifique a intenção da mensagem. Responda APENAS com JSON:
          {
            "name": "tipo_da_intencao",
            "confidence": 0.95,
            "requiresAuth": false,
            "allowTools": true,
            "isSpam": false
          }
          
          Políticas do agente: ${params.agentPolicies.join(', ')}
          Intenções possíveis: greeting, financial_query, complaint, 
                               human_handoff, document_request, out_of_scope`
        },
        { role: 'user', content: params.message }
      ]
    });

    const result = JSON.parse(response.choices[0].message.content!) as IntentResult;

    // Cache por 5 minutos (intenções de mensagens similares são estáveis)
    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);

    return result;
  }

  private hash(text: string): string {
    // Hash simples para cache (pode usar crypto.createHash se quiser mais robusto)
    return text.trim().toLowerCase().slice(0, 50);
  }
}
```

### 5.2 AudioTranscriberService — Transcrição de Áudio

```typescript
// porteiro/src/engine/services/media/AudioTranscriberService.ts

export class AudioTranscriberService {
  async transcribe(params: {
    mediaUrl?: string;
    mediaBase64?: string;
    tenantId: string;
    traceId: string;
  }): Promise<{ transcription: string; durationSeconds: number; cost: number }> {

    // 1. Obtém o buffer do áudio (URL ou base64)
    const audioBuffer = params.mediaBase64
      ? Buffer.from(params.mediaBase64, 'base64')
      : await this.downloadAudio(params.mediaUrl!);

    // 2. Whisper API (OpenAI)
    const file = new File([audioBuffer], 'audio.ogg', { type: 'audio/ogg' });

    const response = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'pt',         // força português — latência menor
      response_format: 'verbose_json', // inclui duração
    });

    return {
      transcription: response.text,
      durationSeconds: response.duration ?? 0,
      cost: (response.duration ?? 0) / 60 * WHISPER_PRICE_PER_MINUTE,
    };
  }

  private async downloadAudio(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Falha ao baixar áudio: ${url}`);
    return Buffer.from(await response.arrayBuffer());
  }
}
```

### 5.3 ImageOCRService — OCR de Imagens

```typescript
// porteiro/src/engine/services/media/ImageOCRService.ts

export class ImageOCRService {
  async extract(params: {
    mediaUrl?: string;
    mediaBase64?: string;
    traceId: string;
    prompt?: string; // prompt customizável por caso de uso
  }): Promise<{ extractedText: string; confidence: 'high' | 'medium' | 'low' }> {

    const imageData = params.mediaBase64
      ? { type: 'base64' as const, base64: params.mediaBase64, mimeType: 'image/jpeg' }
      : { type: 'url' as const, url: params.mediaUrl! };

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: imageData.type === 'base64'
                ? `data:${imageData.mimeType};base64,${imageData.base64}`
                : imageData.url,
              detail: 'high',
            }
          },
          {
            type: 'text',
            text: params.prompt ?? `Extraia e transcreva todo o texto visível nesta imagem.
                  Inclua valores, datas, nomes e códigos. 
                  Se for um documento fiscal (nota, boleto, cupom), extraia estruturadamente.
                  Responda apenas com o texto extraído, sem comentários.`
          }
        ]
      }],
      max_tokens: 1024,
    });

    return {
      extractedText: response.choices[0].message.content ?? '',
      confidence: 'high', // pode ser inferido com uma chamada adicional se necessário
    };
  }
}
```

### 5.4 StorageService — Arquivos no Bucket

```typescript
// porteiro/src/engine/services/media/StorageService.ts

export class StorageService {
  private readonly bucket = 'conversation-media';

  async upload(params: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    tenantId: string;
    conversationId: string;
  }): Promise<{ publicUrl: string; storagePath: string }> {

    const path = `${params.tenantId}/${params.conversationId}/${Date.now()}_${params.fileName}`;

    const { error } = await supabase.storage
      .from(this.bucket)
      .upload(path, params.buffer, {
        contentType: params.mimeType,
        upsert: false,
      });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    const { data } = supabase.storage.from(this.bucket).getPublicUrl(path);

    return { publicUrl: data.publicUrl, storagePath: path };
  }

  async download(storagePath: string): Promise<Buffer> {
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .download(storagePath);

    if (error || !data) throw new Error(`Storage download failed: ${storagePath}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async delete(storagePath: string): Promise<void> {
    await supabase.storage.from(this.bucket).remove([storagePath]);
  }
}
```

### 5.5 RAGService — Recuperação de Conhecimento

```typescript
// porteiro/src/engine/services/intelligence/RAGService.ts

export class RAGService {
  async retrieve(params: {
    query: string;
    agentId: string;
    topK?: number;
  }): Promise<{ chunks: string[]; sources: string[] }> {

    // 1. Gera embedding da query (modelo pequeno = rápido)
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small', // 1536 dims, rápido e barato
      input: params.query,
    });

    const embedding = embeddingResponse.data[0].embedding;

    // 2. Busca vetorial no Postgres (pgvector cosine similarity)
    const { data: chunks } = await supabase.rpc('get_agent_context', {
      p_agent_id: params.agentId,
      p_query_embedding: embedding,
      p_match_count: params.topK ?? 5,
      p_match_threshold: 0.75, // ignora chunks com similaridade baixa
    });

    if (!chunks || chunks.length === 0) {
      return { chunks: [], sources: [] };
    }

    return {
      chunks: chunks.map((c: any) => c.content),
      sources: chunks.map((c: any) => c.document_name),
    };
  }
}
```

### 5.6 LLMService — Chamada ao LLM

```typescript
// porteiro/src/engine/services/intelligence/LLMService.ts

export class LLMService {
  async complete(params: {
    prompt: { system: string; user: string; history: ChatMessage[] };
    model: string;
    temperature: number;
    maxTokens: number;
    tools?: AgentTool[];
    traceId: string;
  }): Promise<{ response: string; tokensUsed: number; toolCalls?: ToolCall[] }> {

    const messages = [
      { role: 'system' as const, content: params.prompt.system },
      ...params.prompt.history,
      { role: 'user' as const, content: params.prompt.user },
    ];

    const requestParams: any = {
      model: params.model,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      messages,
    };

    // Tool calling — apenas se houver ferramentas disponíveis
    if (params.tools && params.tools.length > 0) {
      requestParams.tools = params.tools.map(this.toolToOpenAIFormat);
      requestParams.tool_choice = 'auto';
    }

    const response = await openai.chat.completions.create(requestParams);
    const choice = response.choices[0];

    // Handle tool calls (multi-step reasoning)
    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      return this.handleToolCalls(choice.message.tool_calls, messages, params);
    }

    return {
      response: choice.message.content ?? '',
      tokensUsed: response.usage?.total_tokens ?? 0,
    };
  }

  private async handleToolCalls(
    toolCalls: any[],
    messages: any[],
    params: any
  ): Promise<{ response: string; tokensUsed: number }> {
    // Executa cada tool call e retorna resultado ao LLM
    // (implementação recursiva com limite de 5 iterações)
    // ...
    return { response: '', tokensUsed: 0 };
  }

  private toolToOpenAIFormat(tool: AgentTool) {
    return {
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.schema,
      },
    };
  }
}
```

### 5.7 MessagingService — Envio de Mensagens (Multi-Provider)

```typescript
// porteiro/src/engine/services/messaging/MessagingService.ts

import { EvolutionProvider } from './EvolutionProvider';
import { ZenviaProvider } from './ZenviaProvider';

export interface IMessagingProvider {
  sendText(phone: string, text: string, config: ProviderConfig): Promise<void>;
  sendMedia?(phone: string, mediaUrl: string, caption: string, config: ProviderConfig): Promise<void>;
}

export class MessagingService {
  private readonly providers: Record<string, IMessagingProvider> = {
    evolution: new EvolutionProvider(),
    zenvia: new ZenviaProvider(),
  };

  async send(params: {
    provider: 'evolution' | 'zenvia';
    phone: string;
    text: string;
    agentConfig: AgentConfig;
    mediaUrl?: string;
  }): Promise<void> {
    const provider = this.providers[params.provider];

    if (!provider) {
      throw new Error(`Provider não suportado: ${params.provider}`);
    }

    if (params.mediaUrl && provider.sendMedia) {
      await provider.sendMedia(params.phone, params.mediaUrl, params.text, {
        evolutionInstance: params.agentConfig.evolution_instance,
        evolutionToken: params.agentConfig.evolution_token,
        zenviaChannelId: params.agentConfig.zenvia_channel_id,
        zenviaApiToken: params.agentConfig.zenvia_api_token,
      });
    } else {
      await provider.sendText(params.phone, params.text, {
        evolutionInstance: params.agentConfig.evolution_instance,
        evolutionToken: params.agentConfig.evolution_token,
        zenviaChannelId: params.agentConfig.zenvia_channel_id,
        zenviaApiToken: params.agentConfig.zenvia_api_token,
      });
    }
  }
}
```

### 5.8 TelemetryService — Billing e Métricas

```typescript
// porteiro/src/engine/services/billing/TelemetryService.ts

export class TelemetryService {
  async track(params: {
    traceId: string;
    tenantId: string;
    agentId: string;
    tokens?: number;
    sttMinutes?: number;
    ttsMinutes?: number;
    messageCount?: number;
  }): Promise<void> {
    // Chama a RPC existente — mesma que o N8N usa hoje
    const { error } = await supabase.rpc('fn_track_llm_usage', {
      p_trace_id: params.traceId,
      p_tenant_id: params.tenantId,
      p_agent_id: params.agentId,
      p_tokens: params.tokens ?? 0,
      p_stt_minutes: params.sttMinutes ?? 0,
      p_tts_minutes: params.ttsMinutes ?? 0,
      p_message_count: params.messageCount ?? 1,
    });

    if (error) {
      // Telemetria nunca deve quebrar o fluxo principal
      logger.error(`Telemetry failed: ${error.message}`, { traceId: params.traceId });
    }
  }
}
```

---

## 6. Diagrama de Latência — Por Que é Distribuído sem Penalidade

O grande diferencial desta arquitetura é: os serviços comunicam **in-process** (chamadas de método), nunca via HTTP entre si. O único HTTP é com APIs externas (OpenAI, Evolution, Zenvia).

```
FLUXO ATUAL (com N8N):
  Porteiro → HTTP (50ms) → N8N
                            ↓ HTTP (20ms) → Supabase RPC
                            ↓ HTTP (800ms) → OpenAI
                            ↓ HTTP (20ms) → Supabase RPC
                            ↓ HTTP (50ms) → Evolution API
  Total overhead de rede interna: ~140ms (só em hops)

FLUXO NODE ENGINE (in-process):
  Porteiro
    └─ NodeEngine
         └─ MessageOrchestrator
              ├─ IntentClassifier → HTTP (150ms) → OpenAI mini
              ├─ RAGService       → HTTP (20ms)  → Supabase RPC (pgvector)
              ├─ LLMService       → HTTP (800ms) → OpenAI gpt-4o
              ├─ MessagingService → HTTP (50ms)  → Evolution/Zenvia
              └─ [recording]      → HTTP (20ms)  → Supabase RPC
  
  Overhead de rede interna: 0ms (tudo in-process)
  Ganho: ~140ms por mensagem = ~2.4s economizados em 1.750 msgs simultâneas
```

---

## 7. Workers de Background (Não Bloqueantes)

Os workers rodam em paralelo ao processamento de mensagens, sem interferir na latência:

```typescript
// porteiro/src/engine/workers/InboundQueueWorker.ts

export class InboundQueueWorker {
  private readonly POLL_INTERVAL_MS = 500; // polling a cada 500ms
  private readonly MAX_CONCURRENT = 10;    // mesmo que MAX_CONCURRENT_JOBS do Porteiro atual
  private activeJobs = 0;
  private running = false;

  async start(): Promise<void> {
    this.running = true;
    logger.info('[InboundQueueWorker] Iniciado');

    while (this.running) {
      if (this.activeJobs < this.MAX_CONCURRENT) {
        this.processNext(); // não awaita — roda em background
      }
      await this.sleep(this.POLL_INTERVAL_MS);
    }
  }

  private async processNext(): Promise<void> {
    this.activeJobs++;
    try {
      const { data: message } = await supabase.rpc('fn_fetch_next_inbound_message', {
        p_n8n_execution_id: generateTraceId(),
      });

      if (!message || message.status === 'empty') return;

      const engine = router.route(message.agent);
      await engine.execute(buildContext(message));

      await supabase.rpc('fn_finish_inbound_message', { p_queue_id: message.queue_id });
    } catch (error) {
      logger.error('[InboundQueueWorker] Erro:', error);
    } finally {
      this.activeJobs--; // SEMPRE decrementa
    }
  }

  stop(): void { this.running = false; }
  private sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
}
```

```typescript
// porteiro/src/engine/workers/CampaignWorker.ts
// Processa outbound_queue (campanhas) — mesma estrutura, diferente RPC

export class CampaignWorker {
  private readonly SCHEDULE = '0 9-18 * * 1-5'; // seg-sex, 9h-18h
  private readonly BATCH_SIZE = 50;

  async run(): Promise<void> {
    const { data: pendingJobs } = await supabase
      .from('outbound_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('retry_count', 3)
      .limit(this.BATCH_SIZE);

    // Processa em paralelo com concorrência limitada
    await pLimit(5)(pendingJobs.map(job => () => this.processJob(job)));
  }

  private async processJob(job: OutboundJob): Promise<void> {
    try {
      await messagingService.send({
        provider: job.agent.whatsapp_provider,
        phone: job.contact_phone,
        text: job.initial_message,
        agentConfig: job.agent,
      });

      await supabase.rpc('handle_outbound_sent', { p_queue_id: job.id });
    } catch (error) {
      await supabase
        .from('outbound_queue')
        .update({ status: 'failed', error_message: error.message, retry_count: job.retry_count + 1 })
        .eq('id', job.id);
    }
  }
}
```

---

## 8. Migração Serviço a Serviço (Playbook)

A migração segue a ordem do mais simples para o mais crítico. Cada serviço pode ser migrado e testado **independentemente**, sem tocar nos outros:

```
ORDEM RECOMENDADA:

Semana 1-2: Infraestrutura base
  ✅ [ ] ExecutionRouter + IExecutionEngine (contrato)
  ✅ [ ] N8NEngine (wrapper do comportamento atual)
  ✅ [ ] TelemetryService (usa RPCs existentes)
  ✅ [ ] AuditLoggerService
  ✅ [ ] ALTER TABLE agents ADD COLUMN execution_mode

Semana 3-4: Workers periféricos (sem LLM)
  ✅ [ ] CampaignWorker (substitui worker N8N de campanhas)
  ✅ [ ] AuditWorker (substitui loop de auditoria do N8N)
  ✅ [ ] IdleConversationWorker (cron de fechamento)
  ✅ [ ] StorageService
  ✅ [ ] MediaDownloaderService

Semana 5-6: Mídia e pré-processamento
  ✅ [ ] AudioTranscriberService (Whisper)
  ✅ [ ] ImageOCRService (GPT-4o Vision)
  ✅ [ ] MessagingService + EvolutionProvider + ZenviaProvider

Semana 7-8: Intelligence layer
  ✅ [ ] RAGService (pgvector — usa RPC existente)
  ✅ [ ] IntentClassifierService
  ✅ [ ] PromptBuilderService
  ✅ [ ] LLMService (sem tool calling por enquanto)

Semana 9-10: Segurança e estado
  ✅ [ ] GatekeeperService (Identity Gate)
  ✅ [ ] SessionManagerService
  ✅ [ ] StateManagerService (context_state)
  ✅ [ ] ConversationService + MessageRecorderService

Semana 11-12: Integração e testes
  ✅ [ ] NodeEngine completo + MessageOrchestrator
  ✅ [ ] LLMService com tool calling
  ✅ [ ] Testes de carga (primeiro agente com execution_mode='node')
  ✅ [ ] Rollout 10% → 50% → 100% do Edenred
```

---

## 9. Testes por Serviço

Cada serviço é testável de forma completamente independente:

```typescript
// porteiro/src/engine/services/__tests__/IntentClassifierService.test.ts

describe('IntentClassifierService', () => {
  it('classifica intenção financeira corretamente', async () => {
    const classifier = new IntentClassifierService();
    const result = await classifier.classify({
      message: 'qual meu saldo disponível?',
      conversationHistory: [],
      agentPolicies: ['Não divulgue saldos negativos'],
    });

    expect(result.name).toBe('financial_query');
    expect(result.requiresAuth).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('detecta spam corretamente', async () => {
    const result = await classifier.classify({
      message: 'CLIQUE AQUI GANHE PRÊMIO GRÁTIS!!!',
      conversationHistory: [],
      agentPolicies: [],
    });

    expect(result.isSpam).toBe(true);
  });
});
```

---

## 10. Configuração da UI de Agentes (execution_mode)

A UI já existe (`/agents` → painel de configuração). Adicionar um toggle simples:

```typescript
// src/pages/Agents.tsx — adicionar no painel de configuração

<div className="form-group">
  <label>Motor de Execução</label>
  <select
    value={agent.execution_mode ?? 'n8n'}
    onChange={(e) => updateAgent({ execution_mode: e.target.value })}
  >
    <option value="n8n">N8N (Padrão — estável)</option>
    <option value="node">Node Engine (Beta — alta performance)</option>
  </select>
  <p className="hint">
    "Node Engine" usa o backend nativo. Pode ser revertido a qualquer momento sem deploy.
  </p>
</div>
```

---

## 11. Resumo: O Que Este Blueprint Entrega

| Capacidade | Como | Benefício |
|---|---|---|
| Chave de roteamento | `agents.execution_mode` = `'n8n'` \| `'node'` | Rollback por agente sem deploy |
| Fallback automático | `ExecutionRouter.dispatch()` tenta Node → fallback N8N em erro | Zero downtime |
| Distribuição de responsabilidades | 1 classe por funcionalidade / arquivo | Testável, substituível, legível |
| Performance sem penalidade | Serviços comunicam in-process (0ms overhead interno) | Ganho de ~140ms vs N8N |
| N8N como laboratório | `execution_mode = 'n8n'` permanece padrão | Iteração rápida em novos fluxos |
| Migração incremental | Serviço a serviço, em 12 semanas | Zero risco de regressão |
| Testabilidade | Cada serviço tem seus próprios testes unitários | Confiança antes de colocar em produção |
| Multi-provider nativo | `MessagingService` encapsula Evolution + Zenvia | Mesmo código para ambos |

---

*Documento v1.0 — 03/Abr/2026.*  
*Este blueprint deve ser convertido em issues/tasks no Linear/GitHub Projects antes da implementação.*
