import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  DEFAULT_SETTINGS,
  type BackupPayload,
  type ChatMessage,
  type ChatSettings,
  type ChatThread,
  type SharedMemory,
  type UserState,
} from '../types/chat';
import { sanitizeMemory } from '../utils/offlineAssistant';

const GUEST_STORAGE_KEY = 'material_ai_chat_guest_v1';
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export function generateSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function timestampToMs(val: unknown): number {
  if (val instanceof Timestamp) {
    return val.toMillis();
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val;
  }
  return Date.now();
}

export interface GuestStorageSnapshot {
  shareMemoryEnabled: boolean;
  sharedMemory: SharedMemory;
  settings: ChatSettings;
  chats: ChatThread[];
  activeChatId: string;
}

export function createInitialChat(title = 'New Chat'): ChatThread {
  const now = Date.now();
  return {
    id: generateSafeId('chat'),
    title,
    createdAtMs: now,
    updatedAtMs: now,
    messages: [],
  };
}

export function loadGuestState(): GuestStorageSnapshot {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GuestStorageSnapshot>;
      const chats =
        Array.isArray(parsed.chats) && parsed.chats.length > 0
          ? parsed.chats
          : [createInitialChat()];
      const activeChatId =
        typeof parsed.activeChatId === 'string' &&
        chats.some((c) => c.id === parsed.activeChatId)
          ? parsed.activeChatId
          : chats[0].id;
      return {
        shareMemoryEnabled:
          typeof parsed.shareMemoryEnabled === 'boolean' ? parsed.shareMemoryEnabled : true,
        sharedMemory: sanitizeMemory(parsed.sharedMemory ?? { userName: '', facts: [] }),
        settings: {
          ...DEFAULT_SETTINGS,
          ...(parsed.settings ?? {}),
        },
        chats,
        activeChatId,
      };
    }
  } catch {
    // Ignore corrupted local guest data and start clean
  }
  const initialChat = createInitialChat();
  return {
    shareMemoryEnabled: true,
    sharedMemory: { userName: '', facts: [] },
    settings: { ...DEFAULT_SETTINGS },
    chats: [initialChat],
    activeChatId: initialChat.id,
  };
}

export function saveGuestState(snapshot: GuestStorageSnapshot): void {
  try {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota issues in guest mode
  }
}

function toFirestoreSettings(settings: ChatSettings) {
  return {
    systemInstruction: (settings.systemInstruction || '').slice(0, 2000),
    temperature: Math.max(0, Math.min(2, Number(settings.temperature) || 1.0)),
    model: (settings.model || DEFAULT_SETTINGS.model).slice(0, 60),
    theme: settings.theme === 'dark' ? 'dark' : 'light',
  };
}

export async function ensureAndLoadUserProfile(
  user: User,
  fallbackSettings: ChatSettings
): Promise<UserState> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);

  let snap;
  try {
    snap = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, userPath);
  }

  if (!snap.exists()) {
    const initialProfile = {
      uid: user.uid,
      displayName: (user.displayName || user.email?.split('@')[0] || 'User').slice(0, 80),
      email: (user.email || '').slice(0, 160),
      photoURL: (user.photoURL || '').slice(0, 500),
      shareMemoryEnabled: true,
      sharedMemory: { userName: '', facts: [] },
      settings: toFirestoreSettings(fallbackSettings),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(userRef, initialProfile);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, userPath);
    }

    return {
      uid: user.uid,
      isGuest: false,
      displayName: initialProfile.displayName,
      email: initialProfile.email,
      photoURL: initialProfile.photoURL,
      shareMemoryEnabled: true,
      sharedMemory: { userName: '', facts: [] },
      settings: {
        ...fallbackSettings,
        ...initialProfile.settings,
        theme: initialProfile.settings.theme as 'light' | 'dark',
      },
    };
  }

  const data = snap.data() as Record<string, unknown>;
  const rawSettings = (data.settings ?? {}) as Record<string, unknown>;
  const rawMem = (data.sharedMemory ?? {}) as Record<string, unknown>;

  return {
    uid: user.uid,
    isGuest: false,
    displayName:
      typeof data.displayName === 'string' && data.displayName
        ? data.displayName
        : user.displayName || user.email || 'User',
    email: typeof data.email === 'string' ? data.email : user.email || '',
    photoURL: typeof data.photoURL === 'string' ? data.photoURL : user.photoURL || '',
    shareMemoryEnabled:
      typeof data.shareMemoryEnabled === 'boolean' ? data.shareMemoryEnabled : true,
    sharedMemory: sanitizeMemory({
      userName: typeof rawMem.userName === 'string' ? rawMem.userName : '',
      facts: Array.isArray(rawMem.facts)
        ? rawMem.facts.filter((f): f is string => typeof f === 'string')
        : [],
    }),
    settings: {
      systemInstruction:
        typeof rawSettings.systemInstruction === 'string'
          ? rawSettings.systemInstruction
          : fallbackSettings.systemInstruction,
      temperature:
        typeof rawSettings.temperature === 'number'
          ? rawSettings.temperature
          : fallbackSettings.temperature,
      model:
        typeof rawSettings.model === 'string' ? rawSettings.model : fallbackSettings.model,
      theme: rawSettings.theme === 'dark' ? 'dark' : 'light',
      engineMode: fallbackSettings.engineMode,
    },
  };
}

export async function loadUserChats(uid: string): Promise<ChatThread[]> {
  const chatsPath = `users/${uid}/chats`;
  try {
    const q = query(collection(db, 'users', uid, 'chats'), where('ownerId', '==', uid));
    const chatsSnap = await getDocs(q);

    const threads: ChatThread[] = [];
    for (const chatDoc of chatsSnap.docs) {
      const c = chatDoc.data() as Record<string, unknown>;
      const chatId = chatDoc.id;
      const msgsPath = `users/${uid}/chats/${chatId}/messages`;
      let messages: ChatMessage[] = [];
      try {
        const mq = query(
          collection(db, 'users', uid, 'chats', chatId, 'messages'),
          where('ownerId', '==', uid)
        );
        const msgsSnap = await getDocs(mq);
        messages = msgsSnap.docs
          .map((mDoc) => {
            const m = mDoc.data() as Record<string, unknown>;
            return {
              id: mDoc.id,
              chatId,
              role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
              content: typeof m.content === 'string' ? m.content : '',
              modelUsed: typeof m.modelUsed === 'string' ? m.modelUsed : 'assistant',
              createdAtMs: timestampToMs(m.createdAt),
            };
          })
          .sort((a, b) => a.createdAtMs - b.createdAtMs);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, msgsPath);
      }

      threads.push({
        id: chatId,
        title: typeof c.title === 'string' && c.title ? c.title : 'Chat',
        createdAtMs: timestampToMs(c.createdAt),
        updatedAtMs: timestampToMs(c.updatedAt),
        messages,
      });
    }

    threads.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    return threads;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, chatsPath);
  }
}

export async function createFirestoreChat(uid: string, chat: ChatThread): Promise<void> {
  const chatId = SAFE_ID_REGEX.test(chat.id) ? chat.id : generateSafeId('chat');
  const path = `users/${uid}/chats/${chatId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'chats', chatId), {
      id: chatId,
      ownerId: uid,
      title: (chat.title || 'New Chat').slice(0, 120),
      messageCount: 0,
      lastMessagePreview: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function saveUserSettingsToFirestore(
  uid: string,
  settings: ChatSettings
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      settings: toFirestoreSettings(settings),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function saveSharedMemoryToFirestore(
  uid: string,
  shareMemoryEnabled: boolean,
  sharedMemory: SharedMemory
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      shareMemoryEnabled,
      sharedMemory: sanitizeMemory(sharedMemory),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function appendTurnToFirestore(params: {
  uid: string;
  chatId: string;
  title: string;
  userMsg: ChatMessage;
  assistantMsg: ChatMessage;
  newMessageCount: number;
}): Promise<void> {
  const { uid, chatId, title, userMsg, assistantMsg, newMessageCount } = params;
  const chatPath = `users/${uid}/chats/${chatId}`;
  try {
    const batch = writeBatch(db);
    const userMsgRef = doc(db, 'users', uid, 'chats', chatId, 'messages', userMsg.id);
    const assistantMsgRef = doc(
      db,
      'users',
      uid,
      'chats',
      chatId,
      'messages',
      assistantMsg.id
    );
    const chatRef = doc(db, 'users', uid, 'chats', chatId);

    batch.set(userMsgRef, {
      id: userMsg.id,
      chatId,
      ownerId: uid,
      role: 'user',
      content: userMsg.content.slice(0, 16000),
      modelUsed: 'user',
      createdAt: serverTimestamp(),
    });
    batch.set(assistantMsgRef, {
      id: assistantMsg.id,
      chatId,
      ownerId: uid,
      role: 'assistant',
      content: assistantMsg.content.slice(0, 16000),
      modelUsed: assistantMsg.modelUsed.slice(0, 80),
      createdAt: serverTimestamp(),
    });
    batch.update(chatRef, {
      title: title.slice(0, 120),
      messageCount: Math.min(500, newMessageCount),
      lastMessagePreview: assistantMsg.content.slice(0, 200),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, chatPath);
  }
}

export async function clearFirestoreChat(uid: string, chatId: string): Promise<void> {
  const path = `users/${uid}/chats/${chatId}/messages`;
  try {
    const mq = query(
      collection(db, 'users', uid, 'chats', chatId, 'messages'),
      where('ownerId', '==', uid)
    );
    const msgsSnap = await getDocs(mq);
    const docs = msgsSnap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      for (const d of docs.slice(i, i + 400)) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }
    await updateDoc(doc(db, 'users', uid, 'chats', chatId), {
      title: 'New Chat',
      messageCount: 0,
      lastMessagePreview: '',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function deleteFirestoreChat(uid: string, chatId: string): Promise<void> {
  const path = `users/${uid}/chats/${chatId}`;
  try {
    const mq = query(
      collection(db, 'users', uid, 'chats', chatId, 'messages'),
      where('ownerId', '==', uid)
    );
    const msgsSnap = await getDocs(mq);
    for (let i = 0; i < msgsSnap.docs.length; i += 400) {
      const batch = writeBatch(db);
      for (const d of msgsSnap.docs.slice(i, i + 400)) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }
    await deleteDoc(doc(db, 'users', uid, 'chats', chatId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function importBackupToFirestore(
  uid: string,
  payload: BackupPayload
): Promise<void> {
  const basePath = `users/${uid}`;
  try {
    await saveSharedMemoryToFirestore(uid, payload.shareMemoryEnabled, payload.sharedMemory);

    // Step 1: create or update parent chat docs first so message rules' exists() checks succeed
    for (const chat of payload.chats) {
      const chatRef = doc(db, 'users', uid, 'chats', chat.id);
      const existingChat = await getDoc(chatRef);
      const lastMsg = chat.messages[chat.messages.length - 1];
      const title = (chat.title || 'Imported Chat').slice(0, 120);
      const messageCount = Math.min(500, chat.messages.length);
      const lastMessagePreview = lastMsg ? lastMsg.content.slice(0, 200) : '';

      if (existingChat.exists()) {
        await updateDoc(chatRef, {
          title,
          messageCount,
          lastMessagePreview,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(chatRef, {
          id: chat.id,
          ownerId: uid,
          title,
          messageCount,
          lastMessagePreview,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    // Step 2: write messages (skipping already-existing immutable message docs)
    for (const chat of payload.chats) {
      for (let i = 0; i < chat.messages.length; i += 400) {
        const batch = writeBatch(db);
        let ops = 0;
        for (const msg of chat.messages.slice(i, i + 400)) {
          const msgRef = doc(db, 'users', uid, 'chats', chat.id, 'messages', msg.id);
          const existingMsg = await getDoc(msgRef);
          if (!existingMsg.exists()) {
            batch.set(msgRef, {
              id: msg.id,
              chatId: chat.id,
              ownerId: uid,
              role: msg.role,
              content: msg.content.slice(0, 16000),
              modelUsed: (msg.modelUsed || 'imported').slice(0, 80),
              createdAt: serverTimestamp(),
            });
            ops++;
          }
        }
        if (ops > 0) {
          await batch.commit();
        }
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, basePath);
  }
}
