import { useState, useRef, useEffect } from 'react';
import { Send, MoreVertical, Bot, User, Play, Pause, Info, UserPlus, ArrowRightLeft, ShieldCheck, Copy } from 'lucide-react';
import { Conversation, Message, mockUsers } from '@/lib/mock-data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
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

interface ChatAreaProps {
  conversation: Conversation | null;
}

interface AudioMessageProps {
  message: Message;
}

function AudioMessage({ message }: AudioMessageProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
    // Mock audio effect
    if (!isPlaying && message.audioUrl) {
      const audio = new Audio(message.audioUrl);
      audio.play().catch(e => console.log("Mock audio play error (expected if empty):", e));
    }
  }

  return (
    <div className="space-y-2 min-w-[200px]">
      <div className="flex items-center gap-3 bg-foreground/5 p-2 rounded-md border border-foreground/10">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full bg-accent/20 text-accent hover:bg-accent/30"
          onClick={togglePlay}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 ml-0.5" />
          )}
        </Button>
        <div className="flex-1 space-y-1">
          <div className="h-1 bg-foreground/20 rounded-full overflow-hidden">
            <div className={`h-full bg-accent ${isPlaying ? 'animate-[pulse_1s_ease-in-out_infinite]' : 'w-1/3'}`} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{isPlaying ? '0:05' : '0:00'}</span>
            <span>0:12</span>
          </div>
        </div>
      </div>
      {message.transcription && (
        <div className="text-xs italic text-muted-foreground border-l-2 border-accent/20 pl-2">
          "{message.transcription}"
        </div>
      )}
    </div>
  );
}

export function ChatArea({ conversation }: ChatAreaProps) {
  const { openSlideOver, takeOverConversation, returnToAI, transferConversation, sendMessage, currentUser } = useApp();
  const [messageInput, setMessageInput] = useState('');
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversation?.messages]);

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
    <div className="flex-1 flex flex-col bg-background">
      {/* Chat Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-muted flex items-center justify-center">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="font-medium flex items-center gap-2">
            {conversation.userName}
            {conversation.channel === 'voice' && (
              <span className="px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-500 text-[10px] font-bold uppercase border border-purple-500/20">
                Voice Call
              </span>
            )}
          </h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className={cn(
                'status-dot',
                conversation.status === 'ai_active' ? 'bg-accent' : 'bg-success'
              )} />
              <span>{conversation.status === 'ai_active' ? 'IA Ativa' : `${conversation.assignedOperator}`}</span>
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

        <div className="flex items-center gap-2">
          {/* Control Buttons */}
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
              <DropdownMenuItem className="text-destructive">
                Encerrar Conversa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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

              <div>
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
                  message.sender === 'user' && 'chat-bubble-user rounded-bl-sm',
                  message.sender === 'ai' && 'chat-bubble-ai rounded-br-sm',
                  message.sender === 'human' && 'chat-bubble-human rounded-br-sm'
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
                      const textToCopy = message.content || message.transcription || '';
                      if (textToCopy) {
                        navigator.clipboard.writeText(textToCopy);
                        toast.success('Mensagem copiada!');
                      }
                    }}
                  >
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </Button>

                  {message.type === 'audio' ? (
                    <AudioMessage message={message} />
                  ) : message.type === 'image' ? (
                    <img src={message.imageUrl} alt="" className="max-w-full rounded-md" />
                  ) : (
                    <p className="text-sm custom-markdown leading-relaxed">{message.content}</p>
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
    </div >
  );
}
