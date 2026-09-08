import { ChatInterface } from "@/components/chat/chat-interface";
import { PageHeader } from "@/components/ui/page-header";

export default function ChatPage() {
  return (
    <div>
      <PageHeader
        title="AI Security Chat"
        description="Ask questions, analyze threats, and get RAG-powered answers"
      />
      <ChatInterface />
    </div>
  );
}
