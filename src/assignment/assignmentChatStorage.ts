import { getSupabase } from '../subscription/lib/supabaseClient';
import type { AssignmentChatMessage, AssignmentChatMode } from './assignmentApi';

export type ChatMessage = AssignmentChatMessage & {
  id: string;
  createdAt: number;
  mode?: AssignmentChatMode;
  attachments?: string[];
  saved?: boolean;
};

export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
};

const STORAGE_KEY = 'studysmart-assignment-chats';
export const ASSIGNMENT_CHATS_TABLE = 'assignment_chats';
export const ASSIGNMENT_CHAT_LOCAL_ONLY_NOTICE =
  'Chat history is currently saved on this device only. Apply supabase/migrations/0010_assignment_chats.sql to enable private account sync.';

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<ChatMessage>;
  return typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    typeof message.createdAt === 'number';
}

function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== 'object') return false;
  const chat = value as Partial<Conversation>;
  return typeof chat.id === 'string' &&
    typeof chat.title === 'string' &&
    typeof chat.updatedAt === 'number' &&
    Array.isArray(chat.messages) &&
    chat.messages.every(isChatMessage);
}

function localKey(userId: string): string {
  return `${STORAGE_KEY}:${userId}`;
}

export function readLocalAssignmentChats(userId: string): Conversation[] {
  try {
    const raw = window.localStorage.getItem(localKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isConversation).filter((chat) => chat.messages.length > 0).slice(0, 20) : [];
  } catch {
    return [];
  }
}

function writeLocalAssignmentChats(userId: string, chats: Conversation[]): boolean {
  try {
    window.localStorage.setItem(localKey(userId), JSON.stringify(chats.slice(0, 20)));
    return true;
  } catch {
    return false;
  }
}

function mapRow(row: Record<string, unknown>): Conversation | null {
  const messages = Array.isArray(row.messages) ? row.messages.filter(isChatMessage) : [];
  if (typeof row.id !== 'string' || typeof row.title !== 'string' || messages.length === 0) return null;
  const updatedAt = Date.parse(String(row.updated_at ?? '')) || 0;
  if (!updatedAt) return null;
  return { id: row.id, title: row.title, updatedAt, messages };
}

function describeStorageError(error: unknown): string {
  const message = String((error as { message?: string })?.message ?? error ?? '');
  if (/assignment_chats|relation.*does not exist|schema cache|table.*not found/i.test(message)) {
    return ASSIGNMENT_CHAT_LOCAL_ONLY_NOTICE;
  }
  if (/row-level security|policy|permission|not authorized/i.test(message)) {
    return 'Chat history could not sync. Check the assignment_chats row-level security policies in migration 0010.';
  }
  if (/failed to fetch|networkerror|load failed|timeout/i.test(message)) {
    return 'Chat history is saved on this device; cloud sync will retry when your connection is back.';
  }
  return message.slice(0, 180) || 'Chat history could not sync to your account.';
}

export async function loadAssignmentChats(userId: string): Promise<{
  chats: Conversation[];
  cloudSynced: boolean;
  deviceOk: boolean;
  notice?: string;
}> {
  const local = readLocalAssignmentChats(userId);
  const deviceOk = writeLocalAssignmentChats(userId, local);
  try {
    const { data, error } = await getSupabase()
      .from(ASSIGNMENT_CHATS_TABLE)
      .select('id,title,messages,updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw error;

    const merged = new Map(local.map((chat) => [chat.id, chat]));
    for (const row of data ?? []) {
      const chat = mapRow(row as Record<string, unknown>);
      if (!chat) continue;
      const known = merged.get(chat.id);
      if (!known || chat.updatedAt >= known.updatedAt) merged.set(chat.id, chat);
    }
    const chats = [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20);
    const wroteDevice = writeLocalAssignmentChats(userId, chats);
    return {
      chats,
      cloudSynced: true,
      deviceOk: deviceOk && wroteDevice,
      notice: deviceOk && wroteDevice ? undefined : 'Chat history synced to your account, but this browser could not save its offline copy.',
    };
  } catch (error) {
    return {
      chats: local,
      cloudSynced: false,
      deviceOk,
      notice: deviceOk
        ? describeStorageError(error)
        : `${describeStorageError(error)} This browser also could not load an offline copy.`,
    };
  }
}

let writeQueue: Promise<void> = Promise.resolve();

export function saveAssignmentChats(userId: string, chats: Conversation[]): Promise<{ notice?: string }> {
  const snapshot = chats.filter((chat) => chat.messages.length > 0).slice(0, 20)
    .map((chat) => ({ ...chat, messages: chat.messages.slice(-40) }));
  const operation = writeQueue.then(async () => {
    const deviceOk = writeLocalAssignmentChats(userId, snapshot);
    try {
      if (snapshot.length > 0) {
        const { error } = await getSupabase().from(ASSIGNMENT_CHATS_TABLE).upsert(
          snapshot.map((chat) => ({
            id: chat.id,
            user_id: userId,
            title: chat.title,
            messages: chat.messages,
            updated_at: new Date(chat.updatedAt).toISOString(),
          })),
          { onConflict: 'id' },
        );
        if (error) throw error;
      }
      return {
        notice: deviceOk ? undefined : 'Chat history synced to your account, but this browser could not save its offline copy.',
      };
    } catch (error) {
      return {
        notice: deviceOk
          ? describeStorageError(error)
          : `${describeStorageError(error)} This browser also could not save an offline copy.`,
      };
    }
  });
  writeQueue = operation.then(() => undefined);
  return operation;
}

export function deleteAssignmentChat(userId: string, chatId: string): Promise<{ notice?: string }> {
  const operation = writeQueue.then(async () => {
    const { error } = await getSupabase()
      .from(ASSIGNMENT_CHATS_TABLE)
      .delete()
      .eq('id', chatId)
      .eq('user_id', userId);
    if (error) throw error;
  });
  const result = operation.then(
    () => ({}),
    (error: unknown) => ({ notice: describeStorageError(error) }),
  );
  writeQueue = result.then(() => undefined);
  return result;
}
