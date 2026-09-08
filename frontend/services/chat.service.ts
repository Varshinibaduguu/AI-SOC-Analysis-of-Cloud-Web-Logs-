import { API_URL, api } from "@/lib/api";

export interface ChatSession {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  role: string;
  content: string;
  citations?: string;
  created_at: string;
}

export type StreamEvent =
  | { type: "session"; session_id: number }
  | { type: "chunk"; content: string }
  | { type: "done"; session_id: number; citations?: string };

export const chatService = {
  getSessions: (token: string) =>
    api.get<ChatSession[]>("/chat/sessions", token),

  createSession: (token: string, title = "New Conversation") =>
    api.post<ChatSession>("/chat/sessions", { title }, token),

  getMessages: (token: string, sessionId: number) =>
    api.get<Message[]>(`/chat/sessions/${sessionId}/messages`, token),

  sendMessage: (
    token: string,
    content: string,
    sessionId?: number,
    useRag = true
  ) =>
    api.post<Message[]>(
      "/chat/message",
      { content, session_id: sessionId, use_rag: useRag },
      token
    ),

  streamMessage: async function* (
    token: string,
    content: string,
    sessionId?: number,
    useRag = true
  ): AsyncGenerator<StreamEvent> {
    const res = await fetch(`${API_URL}/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        content,
        session_id: sessionId,
        use_rag: useRag,
      }),
    });
    if (!res.ok || !res.body) throw new Error("Stream failed");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data) as StreamEvent;
          yield parsed;
        } catch {
          /* skip */
        }
      }
    }
  },
};
