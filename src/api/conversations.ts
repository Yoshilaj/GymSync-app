import { api } from './client';
import type { ConversationMessageRow } from '@/voice';

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationThread {
  conversation: ConversationSummary;
  messages: ConversationMessageRow[];
}

/** Newest-first; the backend already applies the 90-day retention window. */
export async function fetchConversations(token: string): Promise<ConversationSummary[]> {
  const data = await api.get<{ conversations: ConversationSummary[] }>(
    '/api/conversations',
    token,
  );
  return data.conversations;
}

export function fetchConversationThread(
  token: string,
  id: string,
): Promise<ConversationThread> {
  return api.get<ConversationThread>(`/api/conversations/${id}`, token);
}

export async function deleteConversation(token: string, id: string): Promise<void> {
  await api.del<{ status: string }>(`/api/conversations/${id}`, token);
}
