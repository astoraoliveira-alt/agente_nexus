import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, MoreVertical, Bot, User, Play, Pause, Info, UserPlus, ShieldCheck, Copy, MessageSquare, Smartphone, Monitor, Paperclip, AlertTriangle, ThumbsDown, Check, CheckCheck, AlertCircle, Megaphone, Flame, Activity, Hash, Clock, FileText, Download, Loader2, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DeviceFrame } from '@/components/ui/DeviceFrame';
import { WhatsAppView } from './WhatsAppView';
import { Conversation, Message, mockUsers } from '@/lib/mock-data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, getPhoneticRegex } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useApp } from '@/contexts/AppContext';
import { EmojiPicker } from '@/components/chat/EmojiPicker';
import { AttachmentPicker } from '@/components/chat/AttachmentPicker';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArtifactsDrawer } from './ArtifactsDrawer';
import { maskSensitiveData } from '@/lib/masking';
import { normalizeMessagingText } from '@/lib/message-formatting';

interface ChatAreaProps {
  conversation: Conversation | null;
  highlightTerm?: string;
  alwaysAllowInput?: boolean;
  hideAiControls?: boolean;
  customActions?: React.ReactNode;
  hideMessageCount?: boolean;
  hideViewModeToggle?: boolean;
  compactAttachmentsButton?: boolean;
}

interface AudioMessageProps {
  message: Message;
}

function AudioMessage({ message }: AudioMessageProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Use a stable reference for the Audio object
  const audioInstance = useMemo(() => {
    if (!message.audioUrl) return null;

    let src = message.audioUrl;
    if (!src.startsWith('http') && !src.startsWith('data:')) {
      src = `data:audio/mpeg;base64,${message.audioUrl}`;
    }

    const audio = new Audio(src);
    console.log("🔊 Audio Instance Created:", message.id);
    return audio;
  }, [message.audioUrl, message.id]);

  useEffect(() => {
    if (!audioInstance) return;

    const onLoadedMetadata = () => {
      console.log("✅ Metadata Loaded. Duration:", audioInstance.duration);
      setDuration(audioInstance.duration);
      setError(null);
    };

    const onTimeUpdate = () => setCurrentTime(audioInstance.currentTime);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onError = (e: Event) => {
      const err = (e.target as HTMLAudioElement).error;
      // Suppress initial load errors, they might resolve or be irrelevant if user hasn't clicked play
      console.warn("⚠️ Audio Load Warning (might act normally):", err);
      setError("Erro ao carregar");
      setIsPlaying(false);
    };

    audioInstance.addEventListener('loadedmetadata', onLoadedMetadata);
    audioInstance.addEventListener('timeupdate', onTimeUpdate);
    audioInstance.addEventListener('ended', onEnded);
    audioInstance.addEventListener('error', onError);

    // Explicitly load
    audioInstance.load();

    return () => {
      audioInstance.pause();
      audioInstance.removeEventListener('loadedmetadata', onLoadedMetadata);
      audioInstance.removeEventListener('timeupdate', onTimeUpdate);
      audioInstance.removeEventListener('ended', onEnded);
      audioInstance.removeEventListener('error', onError);
    };
  }, [audioInstance]);

  const togglePlay = async () => {
    if (!audioInstance) {
      console.error("⚠️ No Audio Instance found in togglePlay");
      return;
    }

    try {
      if (isPlaying) {
        audioInstance.pause();
        setIsPlaying(false);
      } else {
        console.log("▶️ Playing...");
        await audioInstance.play();
        setIsPlaying(true);
      }
    } catch (e) {
      console.error("❌ Play Method Error:", e);
      toast.error("Falha ao iniciar reprodução.");
      setIsPlaying(false);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-2 min-w-[280px]">
      {/* Player Container with higher contrast background */}
      <div className="flex items-center gap-3 bg-black/20 dark:bg-white/10 p-3 rounded-lg backdrop-blur-sm border border-white/10">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full bg-white text-primary hover:bg-white/90 shadow-sm"
          onClick={togglePlay}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5 fill-current" />
          ) : (
            <Play className="h-5 w-5 ml-1 fill-current" />
          )}
        </Button>

        <div className="flex-1 space-y-1.5">
          {/* Progress Bar */}
          <div className="h-1.5 bg-white/30 rounded-full overflow-hidden w-full">
            <div
              className="h-full bg-white transition-all duration-100 ease-linear rounded-full"
              style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
            />
          </div>

          <div className="flex justify-between text-[11px] font-medium text-white/90 px-0.5">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper for highlighting
const HighlightText = ({ text, term }: { text: string; term?: string }) => {
  if (!term || !text) return <>{text}</>;

  const regex = getPhoneticRegex(term, 'gi');
  const fallbackRegex = new RegExp(`(${term})`, 'gi');
  const activeRegex = regex || fallbackRegex;

  const parts = text.split(activeRegex);
  return (
    <span>
      {parts.map((part, i) =>
        i % 2 === 1 && part ? (
          <span key={i} className="highlighted-search-match bg-yellow-200 text-black px-0.5 rounded-sm font-semibold">{part}</span>
        ) : (
          part
        )
      )}
    </span>
  );
};

// Helper for parsing raw JSON messages from Webhooks/LLMs
const parseMessageContent = (rawText: string): string => {
  if (!rawText) return '';
  const trimmed = rawText.trim();

  // Pattern 1: ```json\n{...}\n``` or ```\n{...}\n``` (markdown code fence from LLM agents)
  const codeFenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeFenceMatch) {
    const inner = codeFenceMatch[1].trim();
    try {
      const parsed = JSON.parse(inner);
      if (parsed && typeof parsed.content === 'string') return parsed.content;
      if (parsed && typeof parsed.output === 'string') return parsed.output;
      if (parsed && typeof parsed.text === 'string') return parsed.text;
    } catch {
      // valid fence but not JSON — return inner text stripped of fence
    }
    return inner;
  }

  // Pattern 2: Plain JSON object ={...} or {...}
  if (trimmed.startsWith('={') || trimmed.startsWith('{')) {
    try {
      const jsonStr = trimmed.startsWith('=') ? trimmed.substring(1) : trimmed;
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed.content === 'string') return parsed.content;
      if (parsed && typeof parsed.output === 'string') return parsed.output;
      if (parsed && typeof parsed.text === 'string') return parsed.text;
    } catch {
      // ignore, fall through
    }
  }

  return normalizeMessagingText(rawText);
};

export function ChatArea({ 
  conversation, 
  highlightTerm, 
  alwaysAllowInput, 
  hideAiControls, 
  customActions,
  hideMessageCount,
  hideViewModeToggle,
  compactAttachmentsButton
}: ChatAreaProps) {
  const { openSlideOver, takeOverConversation, returnToAI, transferConversation, sendMessage, currentUser, closeConversation, maskingEnabled } = useApp();

  const shouldHideMessageCount = hideMessageCount ?? !!customActions;
  const shouldHideViewModeToggle = hideViewModeToggle ?? !!customActions;
  const shouldCompactAttachments = compactAttachmentsButton ?? !!customActions;

  const [messageInput, setMessageInput] = useState('');
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [artifactsDrawerOpen, setArtifactsDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'default' | 'mobile'>('default');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const userScrolledUpRef = useRef(false);

  const prevMessagesLength = useRef(conversation?.messages?.length || 0);
  const prevConversationId = useRef(conversation?.id);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // Consider "scrolled up" if the user is more than 150px away from the bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 150;
    userScrolledUpRef.current = !isAtBottom;
  };

  // Função de scroll forçado
  const scrollToBottom = (behavior: "auto" | "smooth" = "auto") => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  };

  // Auto-scroll to bottom whenever messages change or container resizes
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Se mudou de conversa, resetamos o estado e forçamos o scroll
    const currentId = conversation?.id;
    if (prevConversationId.current !== currentId) {
      userScrolledUpRef.current = false;
      prevConversationId.current = currentId;
      requestAnimationFrame(() => scrollToBottom("auto"));
    }

    const resizeObserver = new ResizeObserver(() => {
      // Se o usuário não estiver lendo o histórico, acompanhamos o crescimento do conteúdo
      if (!userScrolledUpRef.current) {
        scrollToBottom();
      }
    });

    // Observamos o conteúdo interno (o wrapper das mensagens)
    const contentWrapper = container.querySelector('.messages-wrapper');
    if (contentWrapper) {
      resizeObserver.observe(contentWrapper);
    }

    return () => resizeObserver.disconnect();
  }, [conversation?.id]);

  // Focus effect when conversation status is human_active
  useEffect(() => {
    if (conversation?.status === 'human_active' && inputRef.current) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [conversation?.id]);

  // Permissions & Restrictions
  const operators = mockUsers.filter(u => u.role === 'operator' && u.id !== currentUser?.id);
  const isAgentActive = conversation?.status === 'ai_active';
  const isHumanActive = conversation?.status === 'human_active';
  const [isUploading, setIsUploading] = useState(false);

  // Upload e envio de anexo (Contratos PDF, Imagens, Documentos)
  const handleUploadAndSendAttachment = async (type: string, file?: File) => {
    if (!file || !conversation) return;

    setIsUploading(true);
    const toastId = toast.loading(`Enviando ${file.name}...`);

    try {
      // 1. Sanitizar nome do arquivo e gerar caminho único
      const fileExt = file.name.split('.').pop();
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `contracts/${conversation.id}/${Date.now()}_${cleanFileName}`;

      // 2. Upload para o bucket público do Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        throw new Error(uploadError.message || 'Erro no upload para o storage');
      }

      // 3. Obter URL pública
      const { data: urlData } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;
      const isDoc = fileExt?.toLowerCase() === 'pdf' || type === 'document' || file.type.includes('pdf') || file.type.includes('word') || file.type.includes('text');
      const isImg = type === 'image' || file.type.startsWith('image/');
      const msgType = isImg ? 'image' : (isDoc ? 'document' : 'text');

      // 4. Enviar mensagem com o anexo para o WhatsApp (apenas legenda limpa, sem expor URL)
      const caption = messageInput.trim() 
        ? messageInput.trim() 
        : (isDoc ? `📄 Segue o contrato para conferência: ${file.name}` : '');

      await sendMessage(conversation.id, caption, msgType, {
        fileUrl: publicUrl,
        fileName: file.name,
        mimeType: file.type
      });

      setMessageInput('');
      toast.success(`Arquivo enviado com sucesso!`, { id: toastId });
    } catch (err: any) {
      console.error('Erro ao enviar anexo:', err);
      toast.error(`Falha ao enviar arquivo: ${err.message || 'Tente novamente'}`, { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  const isReadOnly = conversation?.agentType === 'embedded'; // Landing Page restriction

  const handleTakeover = () => {
    if (isReadOnly) return;
    takeOverConversation(conversation.id);
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <div className="w-16 h-16 bg-muted mx-auto mb-4 flex items-center justify-center">
            <Bot className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Selecione uma conversa para começar</p>
        </div>
      </div>
    );
  }

  const handleTransfer = (operatorId: string) => {
    const operator = mockUsers.find(u => u.id === operatorId);
    if (operator) {
      transferConversation(conversation.id, operator.name);
      setTransferDialogOpen(false);
    }
  };

  return (
    <div className={cn(
      "flex-1 min-h-0 h-full flex flex-col min-w-0 bg-background relative overflow-hidden",
      conversation.evaluation && conversation.evaluation.score < 40 && "ring-2 ring-red-600 ring-inset z-50 shadow-[0_0_20px_rgba(220,38,38,0.2)]"
    )}>
      {/* Alert Banner for Low Score */}
      {(conversation.evaluation?.score < 40 || (conversation.complianceScore !== undefined && conversation.complianceScore < 40)) && (
        <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-between animate-in slide-in-from-top duration-500 sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider">
              ALERTA CRÍTICO: Auditoria detectou risco de alucinação (Score: {conversation.evaluation?.score ?? conversation.complianceScore})
            </span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 text-[10px] text-white hover:bg-white/20 border-white/30"
            onClick={() => {
              if (conversation.evaluation) {
                openSlideOver('evaluation-details', conversation.evaluation);
              } else {
                openSlideOver('conversation-details', conversation);
              }
            }}
          >
            Ver Auditoria
          </Button>
        </div>
      )}

      {/* Chat Header - Unificado e Ergonômico (3 Zonas Visuais Claras) */}
      <div className={cn(
        "min-h-[64px] px-4 py-2.5 flex items-center justify-between gap-4 border-b transition-colors shrink-0 bg-card border-border",
        conversation.evaluation && conversation.evaluation.score < 40 && "bg-red-50 border-red-200"
      )}>
        
        {/* ZONA 1: Identidade do Lead & Canal */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 flex items-center justify-center rounded-full border shrink-0 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 shadow-sm">
            <User className="h-4 w-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold truncate text-[14px] leading-tight text-foreground">
                {conversation.userName}
              </h3>
              {/* Status Atendente / IA sutil integrado ao lado do nome quando ativo */}
              {conversation.status === 'ai_active' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Sofia (IA)
                </span>
              )}
              {conversation.status === 'human_active' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {(!conversation.assignedOperator || conversation.assignedOperator.toLowerCase().includes('operator') || conversation.assignedOperator.toLowerCase().includes('operador')) ? (currentUser?.name || 'Carlos') : conversation.assignedOperator}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mt-0.5 text-[11px]">
              <div className="flex items-center gap-1">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-[#25D366] shrink-0">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                </svg>
                <span className="font-mono leading-none">{conversation.userId}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ZONA 2: Telemetria & Contexto Linear (Sem quebra de linha - nowrap) */}
        <div className="flex items-center gap-2 flex-nowrap overflow-hidden">
          {/* Sentimento do Lead */}
          {conversation.sentiment && (
            <Badge variant="outline" className={cn(
              "px-2.5 py-0.5 h-6 text-[11px] font-medium rounded-full flex items-center gap-1 shrink-0 border whitespace-nowrap",
              conversation.sentiment === 'interessado' || conversation.sentiment === 'positivo'
                ? "bg-amber-50/70 text-amber-700 border-amber-200/80 dark:bg-amber-950/30 dark:text-amber-300"
                : "bg-slate-50 text-slate-600 border-slate-200/80 dark:bg-slate-800 dark:text-slate-300"
            )}>
              <Flame className={cn("h-3 w-3", conversation.sentiment === 'interessado' || conversation.sentiment === 'positivo' ? "text-amber-500" : "text-slate-400")} />
              <span className="capitalize">{conversation.sentiment}</span>
            </Badge>
          )}

          {/* Horário de Início */}
          {conversation.createdAt && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-0.5 rounded-full border border-slate-200/60 dark:border-slate-700/60 shrink-0 whitespace-nowrap">
              <Clock className="h-3 w-3 text-slate-400" />
              <span>{format(new Date(conversation.createdAt), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
            </div>
          )}

          {/* Total de Mensagens */}
          {!shouldHideMessageCount && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800 px-2.5 py-0.5 rounded-full shrink-0 whitespace-nowrap">
              <MessageSquare className="h-3 w-3 text-slate-400" />
              <span>{conversation.messages?.length || 0} msgs</span>
            </div>
          )}

          {/* Campanha (se houver e couber na tela) */}
          {conversation.campaignName && (
            <Badge variant="outline" className="px-2.5 py-0.5 h-6 text-[11px] bg-slate-50 text-slate-600 border-slate-200 font-normal rounded-full hidden 2xl:flex items-center gap-1 shrink-0 whitespace-nowrap">
              <Megaphone className="h-3 w-3 text-slate-400 shrink-0" />
              <span className="truncate max-w-[130px]">{conversation.campaignName}</span>
            </Badge>
          )}
        </div>

        {/* ZONA 3: Ações de Conversão & Ferramentas */}
        <div className="flex items-center justify-end gap-2 shrink-0">
          {/* Se houver ações customizadas (ex: Cockpit Sales HITL), renderiza-as com prioridade máxima */}
          {customActions ? (
            <div className="flex items-center gap-2">
              {customActions}
            </div>
          ) : (
            !hideAiControls && (
              <div className="flex items-center shrink-0">
                {isReadOnly ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-dashed text-slate-500 bg-slate-50 h-8 px-2.5 rounded-md font-medium text-xs"
                  >
                    <Info className="h-3.5 w-3.5" />
                    Somente Leitura
                  </Badge>
                ) : isHumanActive ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => returnToAI(conversation.id)}
                    className="h-8 text-xs font-semibold gap-1.5 text-sky-700 border-sky-300 bg-sky-50/70 hover:bg-sky-100 shadow-sm"
                  >
                    <Bot className="h-3.5 w-3.5" />
                    IA Continua
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleTakeover}
                    className="h-8 text-xs font-bold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                    disabled={conversation.status !== 'ai_active'}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Assumir Atendimento
                  </Button>
                )}
              </div>
            )
          )}

          {/* Alternador Desktop / Mobile */}
          {!shouldHideViewModeToggle && (
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-md border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setViewMode('default')}
                className={cn(
                  "p-1 rounded-sm transition-all flex items-center justify-center",
                  viewMode === 'default' ? "bg-white dark:bg-slate-900 shadow-xs text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                title="Visão Padrão (SaaS)"
              >
                <Monitor className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode('mobile')}
                className={cn(
                  "p-1 rounded-sm transition-all flex items-center justify-center",
                  viewMode === 'mobile' ? "bg-white dark:bg-slate-900 shadow-xs text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                title="Visão Mobile (WhatsApp)"
              >
                <Smartphone className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Botão de Arquivos */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setArtifactsDrawerOpen(true)}
            className={cn(
              "h-8 text-xs text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 bg-background hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white shrink-0 font-medium transition-colors",
              shouldCompactAttachments ? "w-8 p-0 flex items-center justify-center" : "gap-1.5 px-2.5"
            )}
            title="Ver arquivos e gravações da conversa"
          >
            <Paperclip className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-900 dark:text-slate-400" />
            {!shouldCompactAttachments && (
              <span className="hidden sm:inline">Arquivos</span>
            )}
          </Button>

          {/* Menu Dropdown de Mais Opções */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-900 dark:hover:text-white">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openSlideOver('conversation-details', conversation)}>
                <Info className="h-4 w-4 mr-2" />
                Ver Detalhes
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-rose-600 focus:text-rose-700 focus:bg-rose-50"
                onClick={() => {
                  if (confirm('Tem certeza que deseja encerrar esta conversa?')) {
                    closeConversation(conversation.id);
                  }
                }}
              >
                Encerrar Atendimento
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {viewMode === 'mobile' ? (
        <div className="flex-1 bg-muted/30 flex items-center justify-center p-8 overflow-hidden">
          <DeviceFrame>
            <WhatsAppView conversation={conversation} />
          </DeviceFrame>
        </div>
      ) : (
        <>
          {/* Messages Area */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 min-h-0 overflow-y-auto p-4"
          >
            <div className="messages-wrapper space-y-4">
              {conversation.messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex',
                    message.sender === 'user' ? 'justify-start' : 'justify-end'
                  )}
                >
                  <div className={cn(
                    "flex items-end gap-2 max-w-[80%]",
                    message.sender !== 'user' ? "flex-row-reverse" : "flex-row"
                  )}>
                    {/* Avatar Logic */}
                    <div className={cn(
                      'w-8 h-8 flex items-center justify-center flex-shrink-0 rounded-full',
                      message.sender === 'ai' ? 'bg-accent/10' :
                        message.sender === 'human' ? 'bg-success/10' : 'bg-muted'
                    )}>
                      {message.sender === 'ai' ? (
                        <Bot className="h-4 w-4 text-accent" />
                      ) : message.sender === 'human' ? (
                        <User className="h-4 w-4 text-success" />
                      ) : (
                        <User className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 px-1">
                        {message.sender === 'human' && message.senderName && (
                          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                            {message.senderName.replace(/\s*\((operador|operator)\)/gi, '').trim()} (Operador)
                          </span>
                        )}
                        {message.sender === 'ai' && (
                          <span className="text-[10px] text-accent font-bold uppercase tracking-wider ml-auto">Intelligence AI</span>
                        )}
                        {message.sender === 'user' && (
                          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Cliente</span>
                        )}
                      </div>

                      <div className={cn(
                        'chat-bubble shadow-sm relative group/bubble',
                        message.sender === 'user' ? 'chat-bubble-user rounded-bl-sm' :
                          message.sender === 'human' ? 'chat-bubble-human rounded-br-sm' :
                            'chat-bubble-ai rounded-br-sm'
                      )}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "absolute -top-3 h-6 w-6 rounded-full shadow-md opacity-0 group-hover/bubble:opacity-100 transition-opacity bg-background border border-border",
                            message.sender === 'user' ? "-left-2" : "-right-2"
                          )}
                          onClick={() => {
                            const textToCopy = parseMessageContent(message.content) || message.transcription || '';
                            if (textToCopy) {
                              navigator.clipboard.writeText(textToCopy);
                              toast.success('Mensagem copiada!');
                            }
                          }}
                        >
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        </Button>

                        {message.type === 'audio' ? (
                          <div className="space-y-2">
                            <AudioMessage message={message} />
                            {message.transcription && (
                              <div className="text-sm leading-relaxed p-2 text-primary-foreground/90 font-normal border-l-2 border-white/30 pl-3">
                                <HighlightText text={maskSensitiveData(message.transcription, maskingEnabled)} term={highlightTerm} />
                              </div>
                            )}
                          </div>
                        ) : message.type === 'image' ? (
                          <div className="space-y-1.5">
                            <img src={message.imageUrl || message.fileUrl} alt="Anexo" className="max-w-full rounded-md max-h-72 object-cover" />
                            {message.content && !message.content.startsWith('http') && (
                              <p className="text-xs mt-1 custom-markdown leading-relaxed">
                                <HighlightText text={maskSensitiveData(parseMessageContent(message.content), maskingEnabled)} term={highlightTerm} />
                              </p>
                            )}
                          </div>
                        ) : message.type === 'document' ? (
                          <div className="p-2.5 rounded-lg bg-card/80 border border-border/80 space-y-2 max-w-sm">
                            <div className="flex items-center gap-2.5">
                              <div className="p-2 rounded-md bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 shrink-0">
                                <FileText className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-foreground truncate" title={message.fileName || 'Contrato'}>
                                  {message.fileName || 'Documento / Contrato'}
                                </p>
                                <span className="text-[10px] text-muted-foreground uppercase font-medium">Documento PDF</span>
                              </div>
                            </div>
                            {message.content && !message.content.startsWith('http') && (
                              <p className="text-xs text-foreground/90 custom-markdown leading-relaxed pt-1 border-t border-border/40">
                                <HighlightText text={maskSensitiveData(parseMessageContent(message.content), maskingEnabled)} term={highlightTerm} />
                              </p>
                            )}
                            {message.fileUrl && (
                              <a
                                href={message.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-sm"
                              >
                                <Download className="h-3.5 w-3.5" />
                                Baixar Contrato
                              </a>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm custom-markdown leading-relaxed">
                            <HighlightText text={maskSensitiveData(parseMessageContent(message.content), maskingEnabled)} term={highlightTerm} />
                          </p>
                        )}
                      </div>

                      <div className={cn(
                        "flex items-center gap-1 mt-1",
                        message.sender !== 'user' ? "justify-end" : "justify-start"
                      )}>
                        <p className="text-[10px] text-muted-foreground/60">
                          {format(message.timestamp, 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                        </p>
                        {message.sender !== 'user' && (
                          <div className="flex items-center">
                            {message.status === 'failed' || message.status === 'rejected' ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertCircle className="h-3 w-3 text-destructive animate-pulse cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[200px] text-[10px]">
                                    {message.statusDescription || 'Erro no envio da mensagem pela Zenvia.'}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : message.status === 'read' ? (
                              <CheckCheck className="h-3 w-3 text-info" />
                            ) : message.status === 'delivered' ? (
                              <CheckCheck className="h-3 w-3 text-muted-foreground/40" />
                            ) : message.status === 'sent' ? (
                              <Check className="h-3 w-3 text-muted-foreground/40" />
                            ) : message.status === 'processing' || message.status === 'pending' ? (
                              <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" title="Processando..." />
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area (Fixado no rodapé com shrink-0) */}
          <div className="p-3 sm:p-4 border-t border-border bg-card shrink-0 z-10 shadow-sm">
            {isReadOnly ? (
              <div className="flex items-center justify-center p-3 bg-muted/50 rounded-md border border-dashed border-border text-sm text-muted-foreground gap-2">
                <ShieldCheck className="h-4 w-4" />
                Esta conversa é somente leitura (Agente Incorporado).
              </div>
            ) : (!alwaysAllowInput && conversation.status === 'ai_active') ? (
              <div className="flex items-center justify-center p-2.5 bg-muted/30 rounded-md border border-dashed border-border text-sm text-muted-foreground">
                <Bot className="h-4 w-4 mr-2 text-emerald-600" />
                A Sofia (IA) está ativa nesta conversa. Assuma o atendimento para interagir.
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AttachmentPicker
                  onAttach={(type, file) => {
                    handleUploadAndSendAttachment(type, file);
                  }}
                />

                <input
                  ref={inputRef}
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && messageInput.trim()) {
                      sendMessage(conversation.id, messageInput);
                      setMessageInput('');
                    }
                  }}
                  placeholder="Digite sua mensagem como operador via WhatsApp..."
                  className="flex-1 px-4 py-2 bg-muted/50 rounded-md border border-border focus:border-border/80 focus:outline-none focus:ring-1 focus:ring-border/40 transition-all text-sm text-foreground placeholder:text-muted-foreground"
                  autoFocus
                />

                <EmojiPicker onSelect={(emoji) => setMessageInput(prev => prev + emoji)} />

                <Button
                  size="icon"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 shadow-sm transition-colors"
                  onClick={() => {
                    if (messageInput.trim()) {
                      sendMessage(conversation.id, messageInput);
                      setMessageInput('');
                    }
                  }}
                  title="Enviar mensagem pelo WhatsApp"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Slide-over Artifacts Drawer */}
      <ArtifactsDrawer
        conversationId={conversation.id}
        isOpen={artifactsDrawerOpen}
        onOpenChange={setArtifactsDrawerOpen}
      />
    </div >
  );
}
