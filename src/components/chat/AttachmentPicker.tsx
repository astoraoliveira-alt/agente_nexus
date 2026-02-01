import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Paperclip, Image, FileText, Camera, Mic } from 'lucide-react';
import { toast } from 'sonner';

interface AttachmentPickerProps {
  onAttach: (type: string, file?: File) => void;
}

const ATTACHMENT_OPTIONS = [
  { id: 'image', icon: Image, label: 'Imagem', accept: 'image/*' },
  { id: 'document', icon: FileText, label: 'Documento', accept: '.pdf,.doc,.docx,.txt' },
  { id: 'camera', icon: Camera, label: 'Câmera', accept: null },
  { id: 'audio', icon: Mic, label: 'Áudio', accept: 'audio/*' },
];

export function AttachmentPicker({ onAttach }: AttachmentPickerProps) {
  const [open, setOpen] = useState(false);

  const handleOptionClick = (option: typeof ATTACHMENT_OPTIONS[0]) => {
    if (option.accept) {
      // Create file input and trigger click
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = option.accept;
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          onAttach(option.id, file);
          toast.success(`${option.label} anexado: ${file.name}`);
        }
      };
      input.click();
    } else {
      // Camera - show mock message
      toast.info('Funcionalidade de câmera em desenvolvimento');
      onAttach(option.id);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon">
          <Paperclip className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        <div className="space-y-1">
          {ATTACHMENT_OPTIONS.map((option) => (
            <button
              key={option.id}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted transition-colors text-left"
              onClick={() => handleOptionClick(option)}
            >
              <option.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{option.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
