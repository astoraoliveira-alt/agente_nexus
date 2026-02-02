import { useState } from 'react';
import { Send, Bot, User, Sparkles, RefreshCw, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Agent } from '@/lib/types';
import { Textarea } from '@/components/ui/textarea';

interface PlaygroundPanelProps {
    agent: Agent;
}

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
}

interface Log {
    timestamp: string;
    type: 'info' | 'action' | 'error';
    message: string;
}

export function PlaygroundPanel({ agent }: PlaygroundPanelProps) {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'system',
            content: agent.brainConfig?.systemPrompt || 'System prompt not configured.',
            timestamp: new Date()
        },
        {
            id: '2',
            role: 'assistant',
            content: `Olá! Sou o ${agent.name}. Como posso ajudar você hoje? (Modo Simulação)`,
            timestamp: new Date()
        }
    ]);
    const [logs, setLogs] = useState<Log[]>([
        { timestamp: new Date().toLocaleTimeString(), type: 'info', message: 'Session initialized' },
        { timestamp: new Date().toLocaleTimeString(), type: 'info', message: `Loaded model: ${agent.brainConfig?.modelId || 'gpt-4o'}` },
    ]);

    const handleSend = () => {
        if (!input.trim()) return;

        // Add user message
        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        addLog('info', `Received input: "${input}"`);

        // Simulate Agent Thinking
        setTimeout(() => {
            addLog('action', 'Processing intent...');
        }, 500);

        // Simulate Agent Response
        setTimeout(() => {
            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `[Simulação] Entendi que você disse "${userMsg.content}". Esta é uma resposta mockada baseada no modelo ${agent.brainConfig?.modelId}.`,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, botMsg]);
            addLog('info', 'Response generated');
        }, 1500);
    };

    const addLog = (type: Log['type'], message: string) => {
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), type, message }]);
    };

    return (
        <div className="flex h-full flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border">

            {/* Chat Area */}
            <div className="flex-1 flex flex-col h-[60vh] md:h-full">
                <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-accent" />
                        <h3 className="font-semibold text-sm">Simulador: {agent.name}</h3>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setMessages([])}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>

                <ScrollArea className="flex-1 p-4 space-y-4">
                    <div className="space-y-4">
                        {messages.map((msg) => (
                            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.role !== 'user' && (
                                    <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                                        <Bot className="h-4 w-4 text-accent" />
                                    </div>
                                )}
                                <div className={`max-w-[80%] p-3 rounded-lg text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' :
                                        msg.role === 'system' ? 'bg-muted border border-border font-mono text-xs text-muted-foreground w-full' :
                                            'bg-muted'
                                    }`}>
                                    {msg.role === 'system' && <span className="block font-bold mb-1 uppercase text-[10px]">System Prompt</span>}
                                    {msg.content}
                                </div>
                                {msg.role === 'user' && (
                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                        <User className="h-4 w-4 text-primary" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </ScrollArea>

                <div className="p-4 border-t border-border bg-background">
                    <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Digite uma mensagem de teste..."
                            className="flex-1"
                        />
                        <Button type="submit" size="icon">
                            <Send className="h-4 w-4" />
                        </Button>
                    </form>
                </div>
            </div>

            {/* Logic/Debug sidebar */}
            <div className="w-full md:w-80 bg-slate-950 text-slate-300 flex flex-col h-[40vh] md:h-full">
                <div className="p-4 border-b border-slate-800 flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-green-400" />
                    <h4 className="font-mono text-xs font-bold uppercase">Thought Process</h4>
                </div>
                <ScrollArea className="flex-1 p-4">
                    <div className="space-y-2 font-mono text-xs">
                        {logs.map((log, i) => (
                            <div key={i} className="flex gap-2">
                                <span className="text-slate-500">[{log.timestamp}]</span>
                                <span className={
                                    log.type === 'error' ? 'text-red-400' :
                                        log.type === 'action' ? 'text-blue-400' : 'text-slate-300'
                                }>
                                    {log.type === 'action' && '> '}
                                    {log.message}
                                </span>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
}
