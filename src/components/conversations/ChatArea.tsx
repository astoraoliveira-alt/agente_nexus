import { useState } from 'react';
import { Send, Paperclip, Smile, MoreVertical, Bot, User, Play, Pause, Info, UserPlus, ArrowRightLeft } from 'lucide-react';
import { Conversation, Message, mockUsers } from '@/lib/mock-data';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useApp } from '@/contexts/AppContext';
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

function AudioMessage({ message }: { message: Message }) {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 bg-foreground/10 p-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        <div className="flex-1 h-1 bg-foreground/20">
          <div className="h-full w-1/3 bg-current" />
        </div>
        <span className="text-xs">0:12</span>
      </div>
      {message.transcription && (
        <p className="text-sm italic opacity-80">"{message.transcription}"</p>
      )}
    </div>
  );
}

export function ChatArea({ conversation }: ChatAreaProps) {
  const { openSlideOver, takeOverConversation, returnToAI, transferConversation, currentUser } = useApp();
  const [messageInput, setMessageInput] = useState('');
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);

  const operators = mockUsers.filter(u => u.role === 'operator' && u.id !== currentUser?.id);

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
          <div>
            <h3 className="font-medium">{conversation.userName}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn(
                'status-dot',
                conversation.status === 'ai_active' ? 'bg-accent' : 'bg-success'
              )} />
              <span>{conversation.status === 'ai_active' ? 'IA Ativa' : `${conversation.assignedOperator}`}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Control Buttons */}
          {conversation.status === 'ai_active' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => takeOverConversation(conversation.id)}
              className="text-success border-success hover:bg-success hover:text-success-foreground"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Assumir Conversa
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => returnToAI(conversation.id)}
              className="text-accent border-accent hover:bg-accent hover:text-accent-foreground"
            >
              <Bot className="h-4 w-4 mr-2" />
              IA Continua
            </Button>
          )}

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
              message.sender === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            <div className="flex items-end gap-2 max-w-[80%]">
              {message.sender !== 'user' && (
                <div className={cn(
                  'w-8 h-8 flex items-center justify-center flex-shrink-0',
                  message.sender === 'ai' ? 'bg-accent' : 'bg-success'
                )}>
                  {message.sender === 'ai' ? (
                    <Bot className="h-4 w-4 text-accent-foreground" />
                  ) : (
                    <User className="h-4 w-4 text-success-foreground" />
                  )}
                </div>
              )}
              
              <div>
                {message.sender === 'human' && message.senderName && (
                  <p className="text-xs text-muted-foreground mb-1">{message.senderName}</p>
                )}
                
                <div className={cn(
                  'chat-bubble',
                  message.sender === 'user' && 'chat-bubble-user',
                  message.sender === 'ai' && 'chat-bubble-ai',
                  message.sender === 'human' && 'chat-bubble-human'
                )}>
                  {message.type === 'audio' ? (
                    <AudioMessage message={message} />
                  ) : message.type === 'image' ? (
                    <img src={message.imageUrl} alt="" className="max-w-full" />
                  ) : (
                    <p className="text-sm">{message.content}</p>
                  )}
                </div>
                
                <p className="text-xs text-muted-foreground mt-1">
                  {format(message.timestamp, 'HH:mm', { locale: ptBR })}
                </p>
              </div>

              {message.sender === 'user' && (
                <div className="w-8 h-8 bg-muted flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-border bg-card">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Paperclip className="h-5 w-5" />
          </Button>
          
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="Digite sua mensagem..."
            className="flex-1 px-4 py-2 bg-muted border-0 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          
          <Button variant="ghost" size="icon">
            <Smile className="h-5 w-5" />
          </Button>
          
          <Button size="icon" className="bg-accent hover:bg-accent/90">
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
