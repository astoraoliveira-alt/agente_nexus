import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Download, Music, Image as ImageIcon, File, Loader2, Play, Pause } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ArtifactsDrawerProps {
    conversationId: string | null;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

interface Artifact {
    id: string;
    file_type: string;
    storage_path: string;
    created_at: string;
    signedUrl?: string; // We'll fetch this dynamically
}

// Custom Audio Player Component
function AudioPlayerCard({ artifact }: { artifact: Artifact }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [audio] = useState(() => new Audio(artifact.signedUrl));
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    useEffect(() => {
        if (!artifact.signedUrl) return;

        audio.src = artifact.signedUrl;

        const setAudioData = () => {
            setDuration(audio.duration);
        };

        const setAudioTime = () => setCurrentTime(audio.currentTime);
        const setAudioEnd = () => setIsPlaying(false);

        audio.addEventListener('loadedmetadata', setAudioData);
        audio.addEventListener('timeupdate', setAudioTime);
        audio.addEventListener('ended', setAudioEnd);

        return () => {
            audio.removeEventListener('loadedmetadata', setAudioData);
            audio.removeEventListener('timeupdate', setAudioTime);
            audio.removeEventListener('ended', setAudioEnd);
            audio.pause();
        };
    }, [audio, artifact.signedUrl]);

    const togglePlay = () => {
        if (isPlaying) {
            audio.pause();
        } else {
            audio.play().catch(e => {
                console.error("Audio playback error:", e);
                toast.error("Erro ao reproduzir áudio.");
            });
        }
        setIsPlaying(!isPlaying);
    };

    const handleDownload = () => {
        if (artifact.signedUrl) {
            const a = document.createElement('a');
            a.href = artifact.signedUrl;
            a.download = artifact.storage_path.split('/').pop() || 'audio.wav';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    };

    const formatTime = (time: number) => {
        if (isNaN(time)) return '0:00';
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <div className="bg-slate-50 dark:bg-slate-900 border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="bg-primary/10 p-2 rounded-full">
                        <Music className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                        <p className="text-sm font-medium line-clamp-1" title={artifact.storage_path.split('/').pop()}>
                            {artifact.storage_path.split('/').pop()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {format(new Date(artifact.created_at), "dd MMM yyyy, HH:mm", { locale: ptBR })}
                        </p>
                    </div>
                </div>
                <Button variant="ghost" size="icon" onClick={handleDownload} title="Baixar Áudio" disabled={!artifact.signedUrl}>
                    <Download className="h-4 w-4" />
                </Button>
            </div>

            {!artifact.signedUrl && (
                <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                    Arquivo não encontrado no bucket. Requisitando novo upload ou ignorar.
                </div>
            )}

            <div className="flex items-center gap-3 bg-white dark:bg-black p-2 rounded-md shadow-sm border">
                <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8 rounded-full shrink-0"
                    onClick={togglePlay}
                    disabled={!artifact.signedUrl}
                >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                </Button>
                <div className="flex-1 space-y-1">
                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-100 ease-linear"
                            style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Image Card Component
function ImageCard({ artifact }: { artifact: Artifact }) {
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (artifact.signedUrl) {
            const a = document.createElement('a');
            a.href = artifact.signedUrl;
            a.download = artifact.storage_path.split('/').pop() || 'imagem';
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    };

    return (
        <>
            <div
                className="group relative rounded-lg border overflow-hidden cursor-pointer hover:border-primary transition-colors bg-muted/30"
                onClick={() => setIsPreviewOpen(true)}
            >
                <div className="aspect-video w-full flex items-center justify-center bg-black/5 overflow-hidden">
                    {artifact.signedUrl ? (
                        <img
                            src={artifact.signedUrl}
                            alt="Artifact"
                            className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                        />
                    ) : (
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    )}
                </div>

                <div className="p-3 bg-card border-t flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <p className="text-xs truncate" title={artifact.storage_path.split('/').pop()}>
                            {artifact.storage_path.split('/').pop()}
                        </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={handleDownload}>
                        <Download className="h-3 w-3" />
                    </Button>
                </div>
            </div>

            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="max-w-4xl p-1 bg-black/95 border-none shadow-2xl overflow-hidden [&>button]:text-white">
                    <DialogTitle className="sr-only">Visualização de Imagem</DialogTitle>
                    <div className="relative w-full h-[80vh] flex items-center justify-center">
                        {artifact.signedUrl && (
                            <img
                                src={artifact.signedUrl}
                                alt="Fullscreen Artifact"
                                className="max-w-full max-h-full object-contain"
                            />
                        )}
                        <div className="absolute top-4 right-12">
                            <Button variant="secondary" size="sm" onClick={handleDownload} className="gap-2 bg-white/10 hover:bg-white/20 text-white border-white/20">
                                <Download className="h-4 w-4" /> Baixar
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

// Generic File Card Component
function FileCard({ artifact }: { artifact: Artifact }) {
    const handleDownload = () => {
        if (artifact.signedUrl) {
            const a = document.createElement('a');
            a.href = artifact.signedUrl;
            a.download = artifact.storage_path.split('/').pop() || 'arquivo';
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    };

    return (
        <div className="bg-card border rounded-lg p-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3 overflow-hidden">
                <div className="bg-muted p-2 rounded-md shrink-0">
                    <File className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="overflow-hidden">
                    <p className="text-sm font-medium truncate" title={artifact.storage_path.split('/').pop()}>
                        {artifact.storage_path.split('/').pop()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {format(new Date(artifact.created_at), "dd MMM yyyy", { locale: ptBR })}
                    </p>
                </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Baixar
            </Button>
        </div>
    );
}

export function ArtifactsDrawer({ conversationId, isOpen, onOpenChange }: ArtifactsDrawerProps) {
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && conversationId) {
            loadArtifacts();
        }
    }, [isOpen, conversationId]);

    const loadArtifacts = async () => {
        try {
            setLoading(true);

            // 1. Fetch artifacts from DB (conversation_artifacts)
            const { data: dbArtifacts, error: dbError } = await supabase
                .from('conversation_artifacts')
                .select('*')
                .eq('conversation_id', conversationId)
                .not('storage_path', 'is', null)
                .order('created_at', { ascending: false });

            if (dbError) {
                console.warn('Erro ao buscar conversation_artifacts:', dbError);
            }

            // 2. Fetch attachments directly from messages table of this conversation
            const { data: messageFiles, error: msgError } = await supabase
                .from('messages')
                .select('id, content, message_type, image_url, audio_url, metadata, created_at')
                .eq('conversation_id', conversationId)
                .or('message_type.eq.document,message_type.eq.image,message_type.eq.audio,image_url.not.is.null,audio_url.not.is.null')
                .order('created_at', { ascending: false });

            if (msgError) {
                console.warn('Erro ao buscar anexos de mensagens:', msgError);
            }

            // 3. Process conversation_artifacts with signed URLs if needed
            const processedDbArtifacts = await Promise.all(
                (dbArtifacts || []).map(async (art) => {
                    let signedUrl = '';
                    if (art.storage_path) {
                        let cleanPath = art.storage_path;
                        if (cleanPath.startsWith('artifacts/')) {
                            cleanPath = cleanPath.substring(10);
                        }

                        const { data: urlData } = await supabase.storage
                            .from('artifacts')
                            .createSignedUrl(cleanPath, 60 * 60);

                        if (urlData?.signedUrl) {
                            signedUrl = urlData.signedUrl;
                        }
                    }
                    return { ...art, signedUrl } as Artifact;
                })
            );

            // 4. Map message attachments to Artifact interface
            const messageArtifacts: Artifact[] = (messageFiles || [])
                .map((m: any) => {
                    const rawUrl = m.metadata?.file_url || m.image_url || m.audio_url;
                    if (!rawUrl) return null;

                    const fileName = m.metadata?.file_name || rawUrl.split('/').pop() || (m.message_type === 'document' ? 'contrato.pdf' : 'arquivo');
                    const fileType = m.metadata?.mime_type || (m.message_type === 'document' ? 'application/pdf' : m.message_type || 'file');

                    return {
                        id: `msg-${m.id}`,
                        file_type: fileType,
                        storage_path: fileName,
                        created_at: m.created_at,
                        signedUrl: rawUrl
                    };
                })
                .filter((item): item is Artifact => item !== null);

            // 5. Combine and remove duplicates by signedUrl/storage_path
            const combined = [...processedDbArtifacts, ...messageArtifacts];
            const seen = new Set<string>();
            const uniqueArtifacts = combined.filter((art) => {
                const key = art.signedUrl || art.storage_path;
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            // Ordenar do mais recente para o mais antigo
            uniqueArtifacts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            setArtifacts(uniqueArtifacts);
        } catch (error: any) {
            console.error("Error fetching artifacts:", error);
            toast.error("Falha ao carregar os arquivos da conversa.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-md border-l overflow-y-auto">
                <SheetHeader className="pb-4 border-b">
                    <SheetTitle className="flex items-center gap-2">
                        <FolderArchive className="h-5 w-5 text-primary" />
                        Arquivos da Conversa
                    </SheetTitle>
                    <SheetDescription>
                        Aqui estão salvos e vinculados todos os áudios, mídias e documentos anexados gerados nesta sessão de forma permanente.
                    </SheetDescription>
                </SheetHeader>

                <div className="py-6 space-y-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin mb-4" />
                            <p>Carregando arquivos do Bucket...</p>
                        </div>
                    ) : artifacts.length === 0 ? (
                        <div className="text-center py-12 bg-muted/20 rounded-lg border border-dashed">
                            <File className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                            <p className="text-sm font-medium text-muted-foreground">Nenhum arquivo encontrado</p>
                            <p className="text-xs text-muted-foreground/70 mt-1">Os artefatos gerados por IA ou enviados aparecerão aqui.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {artifacts.map((artifact) => {
                                const type = artifact.file_type?.toLowerCase() || '';

                                if (type.includes('audio')) {
                                    return <AudioPlayerCard key={artifact.id} artifact={artifact} />;
                                } else if (type.includes('image')) {
                                    return <ImageCard key={artifact.id} artifact={artifact} />;
                                } else {
                                    return <FileCard key={artifact.id} artifact={artifact} />;
                                }
                            })}
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}

// Temporary icon definition for the missing import
function FolderArchive(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v8" />
            <path d="m8 12 4 4 4-4" />
        </svg>
    );
}
