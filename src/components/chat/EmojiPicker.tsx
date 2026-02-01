import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Smile } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

const EMOJI_CATEGORIES = {
  smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥'],
  gestures: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
  objects: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '⭐', '🌟', '✨', '⚡', '🔥', '💯', '✅', '❌', '⚠️', '📌', '🎯'],
  business: ['📱', '💻', '🖥️', '🖨️', '📞', '📧', '📝', '📋', '📊', '📈', '📉', '📁', '📂', '🗂️', '📅', '📆', '🗓️', '🔔', '🔕', '📣', '💬', '💭', '🗨️', '🗯️', '💼', '🏢', '🏦', '🏪', '🏬', '🏭'],
};

export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon">
          <Smile className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Tabs defaultValue="smileys" className="w-full">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="smileys" className="text-lg">😀</TabsTrigger>
            <TabsTrigger value="gestures" className="text-lg">👋</TabsTrigger>
            <TabsTrigger value="objects" className="text-lg">❤️</TabsTrigger>
            <TabsTrigger value="business" className="text-lg">💼</TabsTrigger>
          </TabsList>
          
          {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
            <TabsContent key={category} value={category} className="p-2 m-0">
              <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
                {emojis.map((emoji) => (
                  <button
                    key={emoji}
                    className="w-8 h-8 flex items-center justify-center hover:bg-muted transition-colors text-lg"
                    onClick={() => handleSelect(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
