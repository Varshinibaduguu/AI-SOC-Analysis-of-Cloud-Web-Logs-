"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Bot, User, Loader2, Plus, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { chatService, Message } from "@/services/chat.service";
import { useAuthStore } from "@/store/auth-store";
import { cn, formatDate } from "@/lib/utils";
import { REALTIME_POLL } from "@/lib/realtime";
import { invalidateMany } from "@/lib/query";

const CHAT_SUGGESTIONS = [
  "What are the top threats in my recent logs?",
  "Summarize my highest severity log uploads",
  "What open incidents do I have?",
  "Are there any failed login or IAM anomalies?",
  "What should I investigate first today?",
  "What do my uploaded security policies say about access control?",
] as const;

export function ChatInterface() {
  const token = useAuthStore((s) => s.token)!;
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: sessions = [] } = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: () => chatService.getSessions(token),
    refetchInterval: REALTIME_POLL.chatSessions,
  });

  const loadSession = useCallback(
    async (id: number) => {
      setSessionId(id);
      const msgs = await chatService.getMessages(token, id);
      setMessages(msgs);
      setStreamContent("");
    },
    [token]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent]);

  const handleNewChat = async () => {
    const session = await chatService.createSession(token);
    setSessionId(session.id);
    setMessages([]);
    setStreamContent("");
    queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
  };

  const submitMessage = useCallback(
    async (userContent: string) => {
      if (!userContent.trim() || streaming) return;

      setInput("");
      setStreaming(true);
      setStreamContent("");

      const tempUser: Message = {
        id: Date.now(),
        role: "user",
        content: userContent,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUser]);

      try {
        let full = "";
        let activeSessionId = sessionId;

        for await (const event of chatService.streamMessage(
          token,
          userContent,
          sessionId,
          true
        )) {
          if (event.type === "session") {
            activeSessionId = event.session_id;
            setSessionId(event.session_id);
          } else if (event.type === "chunk") {
            full += event.content;
            setStreamContent(full);
          } else if (event.type === "done") {
            activeSessionId = event.session_id;
          }
        }

        const assistant: Message = {
          id: Date.now() + 1,
          role: "assistant",
          content: full,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistant]);
        setStreamContent("");
        void invalidateMany(queryClient, [["chat-sessions"], ["dashboard-stats"]]);
        if (activeSessionId) setSessionId(activeSessionId);
      } catch {
        const msgs = await chatService.sendMessage(token, userContent, sessionId);
        setMessages((prev) => [...prev.slice(0, -1), ...msgs]);
        queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
      } finally {
        setStreaming(false);
      }
    },
    [streaming, sessionId, token, queryClient]
  );

  const handleSend = async () => {
    if (!input.trim() || streaming) return;
    await submitMessage(input.trim());
  };

  const handleSuggestion = (suggestion: string) => {
    if (streaming) return;
    void submitMessage(suggestion);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <aside className="w-56 shrink-0 space-y-2 overflow-y-auto rounded-xl border border-white/[0.08] bg-card/30 p-3 shadow-glass backdrop-blur-xl">
        <Button variant="outline" size="sm" className="w-full gap-2" onClick={handleNewChat}>
          <Plus className="h-3 w-3" /> New chat
        </Button>
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => loadSession(s.id)}
            className={cn(
              "flex w-full items-start gap-2 rounded-lg p-2 text-left text-xs transition-colors",
              sessionId === s.id ? "nav-glow-active text-primary" : "hover:bg-white/[0.06]"
            )}
          >
            <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
            <div className="min-w-0">
              <p className="truncate font-medium">{s.title}</p>
              <p className="text-muted-foreground">{formatDate(s.updated_at)}</p>
            </div>
          </button>
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto pr-2">
          {messages.length === 0 && !streamContent && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Bot className="mb-4 h-12 w-12 text-primary" />
              <h2 className="text-xl font-semibold">AI Security Assistant</h2>
              <p className="mt-2 max-w-md text-muted-foreground">
                Ask about your analyzed logs, incidents, threats, or uploaded policies — answers use your workspace data.
              </p>
              <div className="mt-8 w-full max-w-2xl">
                <p className="mb-3 flex items-center justify-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Try a suggestion
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {CHAT_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => handleSuggestion(suggestion)}
                      disabled={streaming}
                      className="rounded-xl border border-white/[0.08] bg-card/40 px-4 py-3 text-left text-sm text-foreground/90 transition-all hover:border-primary/30 hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-3",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <Card
                className={cn(
                  "max-w-[80%] p-4 glass-card-static",
                  msg.role === "user"
                    ? "border-primary/20 bg-primary/10 shadow-glow-sm"
                    : ""
                )}
              >
                {msg.role === "assistant" ? (
                  <div className="prose-cyber prose-invert max-w-none text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                    {msg.citations && (
                      <p className="mt-2 text-xs text-muted-foreground border-t border-white/10 pt-2">
                        Sources: RAG knowledge base
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
              </Card>
              {msg.role === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
          {streamContent && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
                <Bot className="h-4 w-4 text-primary animate-pulse" />
              </div>
              <Card className="max-w-[80%] p-4 border-primary/30">
                <div className="prose-cyber prose-invert max-w-none text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {streamContent}
                  </ReactMarkdown>
                </div>
              </Card>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {!streaming && messages.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {CHAT_SUGGESTIONS.slice(0, 4).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleSuggestion(suggestion)}
                className="shrink-0 rounded-full border border-white/[0.08] bg-card/30 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Input
            placeholder="Ask about threats, logs, or security policies..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={streaming}
          />
          <Button variant="cyber" onClick={handleSend} disabled={streaming}>
            {streaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
