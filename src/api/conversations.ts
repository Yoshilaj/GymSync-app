import { voiceConfig } from '@/voice/config';
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

async function request<T>(
  token: string,
  method: 'GET' | 'DELETE',
  path: string,
): Promise<T> {
  const res = await fetch(`${voiceConfig.apiBaseUrl}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Conversations ${method} ${path} failed (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

/** Newest-first; the backend already applies the 90-day retention window. */
export async function fetchConversations(token: string): Promise<ConversationSummary[]> {
  const data = await request<{ conversations: ConversationSummary[] }>(
    token,
    'GET',
    '/conversations',
  );
  return data.conversations;
}

export function fetchConversationThread(
  token: string,
  id: string,
): Promise<ConversationThread> {
  return request<ConversationThread>(token, 'GET', `/conversations/${id}`);
}

export async function deleteConversation(token: string, id: string): Promise<void> {
  await request<{ status: string }>(token, 'DELETE', `/conversations/${id}`);
}
