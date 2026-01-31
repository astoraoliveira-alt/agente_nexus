import { MainLayout } from '@/components/layout/MainLayout';
import { ConversationList } from '@/components/conversations/ConversationList';
import { ChatArea } from '@/components/conversations/ChatArea';
import { useApp } from '@/contexts/AppContext';

export default function Conversations() {
  const { conversations, selectedConversation, setSelectedConversation } = useApp();

  return (
    <MainLayout>
      <div className="h-full flex">
        {/* Conversation List */}
        <div className="w-80 flex-shrink-0">
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversation?.id || null}
            onSelect={setSelectedConversation}
          />
        </div>

        {/* Chat Area */}
        <ChatArea conversation={selectedConversation} />
      </div>
    </MainLayout>
  );
}
