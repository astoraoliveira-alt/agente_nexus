import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, MoreVertical, Bot, User, Play, Pause, Info, UserPlus, ArrowRightLeft, ShieldCheck, Copy, MessageSquare, Smartphone, Monitor, Paperclip, AlertTriangle, ThumbsDown } from 'lucide-react';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ArtifactsDrawer } from './ArtifactsDrawer';
import { maskSensitiveData } from '@/lib/masking';

interface ChatAreaProps {
  conversation: Conversation | null;
  highlightTerm?: string;
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

  return rawText;
};

export function ChatArea({ conversation, highlightTerm }: ChatAreaProps) {
  const { openSlideOver, takeOverConversation, returnToAI, transferConversation, sendMessage, currentUser, closeConversation, maskingEnabled } = useApp();
  const [messageInput, setMessageInput] = useState('');
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [artifactsDrawerOpen, setArtifactsDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'default' | 'mobile'>('default');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  const prevMessagesLength = useRef(conversation?.messages?.length || 0);
  const prevConversationId = useRef(conversation?.id);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // Consider "scrolled up" if the user is more than 150px away from the bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 150;
    userScrolledUpRef.current = !isAtBottom;
  };

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    // 1. Silent Refresh Strategy
    // If the user is Searching (highlightTerm active), we DO NOT auto-scroll to bottom.
    // Instead we scroll to the first highlighted term in the chat.
    if (highlightTerm && scrollContainerRef.current) {
      setTimeout(() => {
        const firstMatch = scrollContainerRef.current?.querySelector('.highlighted-search-match');
        if (firstMatch) {
          firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return;
    }

    const isDifferentConversation = prevConversationId.current !== conversation?.id;
    const currentLength = conversation?.messages?.length || 0;
    const hasNewMessages = currentLength > prevMessagesLength.current;

    // Only scroll if we switched conversations, OR if there are new messages AND the user hasn't scrolled up to read history.
    if (isDifferentConversation || (hasNewMessages && !userScrolledUpRef.current)) {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: isDifferentConversation ? "auto" : "smooth" });
      }
    }

    prevMessagesLength.current = currentLength;
    prevConversationId.current = conversation?.id;
  }, [conversation?.messages, conversation?.id, highlightTerm]);

  // Permissions & Restrictions
  const operators = mockUsers.filter(u => u.role === 'operator' && u.id !== currentUser?.id);
  const isAgentActive = conversation?.status === 'ai_active';
  const isHumanActive = conversation?.status === 'human_active';
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
      "flex-1 flex flex-col bg-background relative",
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

      {/* Chat Header */}
      <div className={cn(
        "h-14 px-4 flex items-center justify-between border-b transition-colors shrink-0",
        conversation.evaluation && conversation.evaluation.score < 40
          ? "bg-red-50 border-red-200"
          : conversation.status !== 'closed'
            ? "bg-emerald-500/5 border-emerald-500/20"
            : "bg-card border-border"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 flex items-center justify-center rounded-full border transition-colors",
            conversation.status !== 'closed'
              ? "bg-emerald-100 border-emerald-200 text-emerald-700"
              : "bg-muted border-border text-muted-foreground"
          )}>
            <User className="h-5 w-5" />
          </div>
          <div className="flex flex-col min-w-0">
            <h3 className={cn(
              "font-medium flex items-center gap-2 truncate",
              conversation.status !== 'closed' ? "text-emerald-950 dark:text-emerald-50" : "text-foreground"
            )}>
              {conversation.userName}
              {conversation.channel === 'voice' && (
                <span className="px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-500 text-[10px] font-bold uppercase border border-purple-500/20 flex-shrink-0">
                  Voice Call
                </span>
              )}
            </h3>
            <span className="text-[10px] text-muted-foreground font-mono leading-none">{conversation.userId}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5" title="Total de mensagens">
              <MessageSquare className={cn(
                "h-3.5 w-3.5",
                conversation.status !== 'closed' ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
              )} />
              <span className={cn(
                "font-bold",
                conversation.status !== 'closed' ? "text-black dark:text-white" : "text-muted-foreground"
              )}>{conversation.messageCount ?? conversation.messages.length}</span>
            </div>
            <span className="text-border">|</span>
            <div className="flex items-center gap-1.5">
              <span className={cn(
                'status-dot',
                conversation.status === 'ai_active' ? 'bg-emerald-500 animate-pulse' :
                  conversation.status === 'closed' ? 'bg-muted-foreground' : 'bg-success'
              )} />
              <span>
                {conversation.status === 'ai_active' ? 'IA Ativa' :
                  conversation.status === 'closed' ? 'Conversa Fechada' :
                    (conversation.assignedOperator || 'Operador Humano')}
              </span>
            </div>

            {conversation.voiceStatus && (
              <>
                <span className="text-border">|</span>
                <span className={cn(
                  "uppercase font-bold text-[10px]",
                  conversation.voiceStatus === 'speaking' ? "text-green-500 animate-pulse" :
                    conversation.voiceStatus === 'processing' ? "text-amber-500" :
                      conversation.voiceStatus === 'listening' ? "text-blue-500" : "text-muted-foreground"
                )}>
                  {conversation.voiceStatus === 'speaking' ? 'Falando...' :
                    conversation.voiceStatus === 'processing' ? 'Pensando...' :
                      conversation.voiceStatus === 'listening' ? 'Ouvindo...' : 'Silêncio'}
                </span>
              </>
            )}


          </div>
        </div>

        {/* View Toggle (Center) */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center bg-muted/50 p-1 rounded-lg border border-border">
          <button
            onClick={() => setViewMode('default')}
            className={cn(
              "p-1.5 rounded-md transition-all",
              viewMode === 'default' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            title="Visão Padrão (SaaS)"
          >
            <Monitor className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('mobile')}
            className={cn(
              "p-1.5 rounded-md transition-all",
              viewMode === 'mobile' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            title="Visão Cliente (WhatsApp)"
          >
            <Smartphone className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setArtifactsDrawerOpen(true)}
            className="flex items-center gap-1.5 hover:text-primary transition-colors cursor-pointer bg-muted/50 px-3 py-0.5 rounded-md border border-border/50 h-8 mr-1 shadow-sm"
            title="Ver arquivos e gravações da conversa"
          >
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-muted-foreground text-xs hidden xl:inline-block">Arquivos (WAV/Docs)</span>
          </button>

          {/* Control Buttons */}
          <div className="flex items-center gap-2">
            {isReadOnly ? (
              <Badge
                variant="outline"
                className="gap-1 border-dashed text-muted-foreground bg-muted/50"
              >
                <Info className="h-3 w-3" />
                Somente Leitura
              </Badge>
            ) : isHumanActive ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => returnToAI(conversation.id)}
                className="text-accent border-accent hover:bg-accent hover:text-accent-foreground"
              >
                <Bot className="h-4 w-4 mr-2" />
                IA Continua
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleTakeover}
                className="text-success border-success hover:bg-success hover:text-success-foreground"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Assumir Conversa
              </Button>
            )}
          </div>

          {/* Transfer Dialog */}
          <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Transferir
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Transferir Conversa</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 py-4">
                {operators.map((op) => (
                  <button
                    key={op.id}
                    className="w-full flex items-center gap-3 p-3 hover:bg-muted transition-colors text-left"
                    onClick={() => handleTransfer(op.id)}
                  >
                    <div className="w-10 h-10 bg-muted flex items-center justify-center">
                      <span className="text-sm font-medium">{op.avatar}</span>
                    </div>
                    <div>
                      <p className="font-medium">{op.name}</p>
                      <p className="text-sm text-muted-foreground capitalize">{op.role.replace('_', ' ')}</p>
                    </div>
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          {/* More Options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openSlideOver('conversation-details', conversation)}>
                <Info className="h-4 w-4 mr-2" />
                Ver Detalhes
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  if (confirm('Tem certeza que deseja encerrar esta conversa?')) {
                    closeConversation(conversation.id);
                  }
                }}
              >
                Encerrar Conversa
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
            className="flex-1 overflow-y-auto p-4 space-y-4"
          >
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
                  {/* Avatar Logic: 
                        If User (Left): Avatar is First (handled by flex-row)
                        If Agent (Right): Avatar is First in DOM but Last visually due to flex-row-reverse 
                    */}

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
                      {/* Sender Name Label */}
                      {message.sender === 'human' && message.senderName && (
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{message.senderName} (Operador)</span>
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
                          'chat-bubble-ai rounded-br-sm' // Default fallback for AI/Bot
                    )}>
                      {/* Copy Button (Visible on Hover) */}
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
                        <img src={message.imageUrl} alt="" className="max-w-full rounded-md" />
                      ) : (
                        <p className="text-sm custom-markdown leading-relaxed">
                          <HighlightText text={maskSensitiveData(parseMessageContent(message.content), maskingEnabled)} term={highlightTerm} />
                        </p>
                      )}
                    </div>

                    <p className={cn(
                      "text-[10px] text-muted-foreground/60 mt-1",
                      message.sender !== 'user' ? "text-right" : "text-left"
                    )}>
                      {format(message.timestamp, 'HH:mm', { locale: ptBR })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {/* Invisible element to auto-scroll to */}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-border bg-card">
            {isReadOnly ? (
              <div className="flex items-center justify-center p-3 bg-muted/50 rounded-md border border-dashed border-border text-sm text-muted-foreground gap-2">
                <ShieldCheck className="h-4 w-4" />
                Esta conversa é somente leitura (Agente Incorporado).
              </div>
            ) : conversation.status === 'ai_active' ? (
              <div className="flex items-center justify-center p-2 bg-muted/30 rounded-md border border-dashed border-border text-sm text-muted-foreground">
                <Bot className="h-4 w-4 mr-2" />
                A IA está respondendo. Clique em "Assumir Conversa" para interagir.
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AttachmentPicker
                  onAttach={(type, file) => {
                    if (file) {
                      toast.success(`Anexo adicionado: ${file.name}`);
                      // Implement media upload here if needed
                    }
                  }}
                />

                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && messageInput.trim()) {
                      sendMessage(conversation.id, messageInput);
                      setMessageInput('');
                    }
                  }}
                  placeholder="Digite sua mensagem como operador..."
                  className="flex-1 px-4 py-2 bg-muted border-0 focus:outline-none focus:ring-1 focus:ring-accent"
                  autoFocus
                />

                <EmojiPicker onSelect={(emoji) => setMessageInput(prev => prev + emoji)} />

                <Button
                  size="icon"
                  className="bg-accent hover:bg-accent/90"
                  onClick={() => {
                    if (messageInput.trim()) {
                      sendMessage(conversation.id, messageInput);
                      setMessageInput('');
                    }
                  }}
                >
                  <Send className="h-5 w-5" />
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
