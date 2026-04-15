import React, { useRef, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Conversation, Message } from '@/lib/mock-data';
import { Check, CheckCheck, Phone, Video, MoreVertical, ArrowLeft, Camera, Mic, Paperclip, Smile } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import { maskSensitiveData } from "@/lib/masking";

// Helper to format time like WhatsApp (HH:mm)
const formatWaTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Helper for parsing raw JSON messages from Webhooks/LLMs
export const parseMessageContent = (rawText: string) => {
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

interface WhatsAppViewProps {
    conversation: Conversation;
    onBack?: () => void; // For mobile context if needed
}

export function WhatsAppView({ conversation, onBack }: WhatsAppViewProps) {
    const { maskingEnabled } = useApp();
    const scrollRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom whenever the conversation or the message list changes.
    useEffect(() => {
        const raf = requestAnimationFrame(() => {
            if (scrollRef.current) {
                const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
                if (viewport) {
                    (viewport as HTMLElement).scrollTop = (viewport as HTMLElement).scrollHeight;
                }
            }

            messagesEndRef.current?.scrollIntoView({ block: 'end' });
        });

        return () => cancelAnimationFrame(raf);
    }, [conversation.id, conversation.messages?.length]);

    return (
        <div className="flex flex-col h-full bg-[#E4DDD6] dark:bg-[#111b21] relative font-sans">
            {/* WhatsApp Background Pattern Overlay */}
            <div className="absolute inset-0 opacity-[0.06] dark:opacity-[0.06] pointer-events-none bg-repeat space-y-2"
                style={{
                    backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')",
                    backgroundSize: "400px"
                }}
            />

            {/* Header */}
            <div className="flex-none h-[70px] bg-[#008069] dark:bg-[#202c33] flex flex-col shadow-sm z-10 relative">
                {/* Fake Status Bar */}
                <div className="h-[24px] w-full flex items-center justify-between px-4 text-[11px] font-medium text-white/90">
                    <span>12:00</span>
                    <div className="flex items-center gap-1.5">
                        <div className="h-2.5 w-2.5 bg-white/90 rounded-full"></div>
                        <div className="h-2.5 w-4 bg-white/90 rounded-[2px]"></div>
                    </div>
                </div>

                {/* Navbar Content */}
                <div className="flex-1 flex items-center px-1 pb-1 text-white">
                    <button className="p-1 mr-1" onClick={onBack}>
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <Avatar className="h-9 w-9 mr-2 cursor-pointer">
                        <AvatarImage src="" />
                        <AvatarFallback className="bg-gray-300 text-gray-500">{conversation.userName?.substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 cursor-pointer">
                        <h3 className="font-medium text-base truncate leading-tight">{conversation.userName || conversation.userId}</h3>
                        <p className="text-xs text-white/80 truncate">online hoje às {formatWaTime(conversation.lastMessageTime?.toISOString() || new Date().toISOString())}</p>
                    </div>
                    <div className="flex items-center gap-4 mr-2">
                        <Video className="w-5 h-5 cursor-pointer" />
                        <Phone className="w-5 h-5 cursor-pointer" />
                        <MoreVertical className="w-5 h-5 cursor-pointer" />
                    </div>
                </div>
            </div>

            {/* Messages Area */}
            <ScrollArea className="flex-1 min-w-0" ref={scrollRef}>
                <div className="w-full min-w-0 px-3 py-2 space-y-2 relative z-10 overflow-x-hidden">
                    {/* Date Divider Example */}
                    <div className="flex justify-center my-3">
                        <span className="bg-[#E4ECEC] dark:bg-[#1f2c34] text-[#5e6c71] dark:text-[#8696a0] text-xs px-2 py-1 rounded-md shadow-sm">
                            Hoje
                        </span>
                    </div>

                    {conversation.messages?.map((msg) => {
                        // Robust check for "Me" (Agent) vs "Them" (User)
                        const rawRole = (msg.sender || (msg as any).sender_type || '').toLowerCase().trim();

                        // Mirror the desktop rule exactly:
                        // only explicit "user" stays on the left, everything else goes to the right.
                        const isThem = rawRole === 'user';
                        const isMe = !isThem;

                        const parsedContent = parseMessageContent(msg.content || '');
                        const parsedTranscription = parseMessageContent((msg as any).transcription || '');
                        const displayText = parsedContent || parsedTranscription;

                        return (
                            <div key={msg.id} className={cn("flex w-full min-w-0 mb-2", isMe ? "justify-end" : "justify-start")}>
                                <div className={cn(
                                    "relative w-fit max-w-[85%] min-w-[120px] px-2 pt-1.5 pb-5 pr-14 rounded-lg shadow-sm text-sm leading-[19px]",
                                    isMe
                                        ? "bg-[#E7FFDB] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-tr-none"
                                        : "bg-[#ffffff] dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-tl-none"
                                )}>

                                    {/* Tail SVG */}
                                    <span className={cn("absolute top-0 w-2 h-2 z-10",
                                        isMe ? "-right-2 text-[#E7FFDB] dark:text-[#005c4b]" : "-left-2 text-[#ffffff] dark:text-[#202c33]"
                                    )}>
                                        <svg viewBox="0 0 8 13" height="13" width="8" preserveAspectRatio="xMidYMid slice" className={isMe ? "scale-x-1" : "-scale-x-1"}>
                                            <path opacity="0.13" fill="#0000000" d="M1.533,3.568L8,12.193V1H2.812 C1.042,1,0.474,2.156,1.533,3.568z"></path>
                                            <path fill="currentColor" d="M2.183,1.562L8,12.193V1H2.812C1.042,1,0.474,2.156,1.533,3.568z"></path>
                                        </svg>
                                    </span>

                                    <div className="relative z-10 min-w-0">
                                        {msg.type === 'image' && msg.imageUrl ? (
                                            <img src={msg.imageUrl} alt="" className="max-w-full rounded-md mb-2" />
                                        ) : null}

                                        {msg.type === 'audio' ? (
                                            <div className="space-y-1">
                                                <div className="text-xs opacity-70">Mensagem de audio</div>
                                                <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                                                    {maskSensitiveData(displayText || '[Audio sem transcricao]', maskingEnabled)}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                                                {maskSensitiveData(displayText, maskingEnabled)}
                                            </span>
                                        )}
                                    </div>

                                    <div className="absolute right-2 bottom-1 flex items-center space-x-1 select-none pointer-events-none">
                                        <span className={cn("text-[10px]", isMe ? "text-[#111b21]/60 dark:text-[#e9edef]/60" : "text-[#111b21]/60 dark:text-[#e9edef]/60")}>
                                            {formatWaTime(msg.timestamp?.toISOString() || new Date().toISOString())}
                                        </span>
                                        {isMe && (
                                            <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>
            </ScrollArea>

            {/* Input Placeholder (Visual Only) */}
            <div className="flex-none p-2 bg-[#F0F2F5] dark:bg-[#202c33] flex items-center gap-2 relative z-10 w-full min-h-[62px]">
                <Smile className="w-6 h-6 text-[#54656f] dark:text-[#8696a0] cursor-pointer" />
                <Paperclip className="w-6 h-6 text-[#54656f] dark:text-[#8696a0] cursor-pointer" />
                <div className="flex-1 bg-white dark:bg-[#2a3942] rounded-lg h-10 px-4 flex items-center text-sm text-gray-500 dark:text-[#8696a0]">
                    Mensagem
                </div>
                <Mic className="w-6 h-6 text-[#54656f] dark:text-[#8696a0] cursor-pointer" />
            </div>
        </div>
    );
}
