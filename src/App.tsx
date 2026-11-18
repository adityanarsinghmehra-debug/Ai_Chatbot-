import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';
import {
  DEFAULT_SETTINGS,
  type ActiveTab,
  type BackupPayload,
  type ChatMessage,
  type ChatSettings,
  type ChatThread,
  type SharedMemory,
  type ThemeMode,
  type UserState,
} from './types/chat';
import {
  appendTurnToFirestore,
  clearFirestoreChat,
  createFirestoreChat,
  createInitialChat,
  ensureAndLoadUserProfile,
  generateSafeId,
  importBackupToFirestore,
  loadGuestState,
  loadUserChats,
  saveGuestState,
  saveSharedMemoryToFirestore,
  saveUserSettingsToFirestore,
} from './services/storageService';
import {
  deriveChatScopedMemory,
  extractMemoryFromMessage,
  generateOfflineReply,
} from './utils/offlineAssistant';
import { AuthScreen } from './components/AuthScreen';
import { TopBar } from './components/TopBar';
import { ChatScreen } from './components/ChatScreen';
import { HelpBackupScreen } from './components/HelpBackupScreen';
import { ErrorBoundary } from './components/ErrorBoundary';

function getInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem('material_ai_chat_theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Ignore storage errors
  }
  return 'light';
}

function getAutostartGuest(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1';
  } catch {
    return false;
  }
}

function AppContent() {
  const [authReady, setAuthReady] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [guestMode, setGuestMode] = useState<boolean>(() => getAutostartGuest());

  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');

  const [cloudAvailable, setCloudAvailable] = useState(false);
  const [settings, setSettings] = useState<ChatSettings>({ ...DEFAULT_SETTINGS, theme });
  const [shareMemoryEnabled, setShareMemoryEnabled] = useState(true);
  const [sharedMemory, setSharedMemory] = useState<SharedMemory>({ userName: '', facts: [] });
  const [chats, setChats] = useState<ChatThread[]>(() => [createInitialChat()]);
  const [activeChatId, setActiveChatId] = useState<string>('');
  const [userProfileDisplay, setUserProfileDisplay] = useState({
    displayName: 'Guest',
    email: '',
    photoURL: '',
  });

  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Sync theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('material_ai_chat_theme', theme);
    } catch {
      // Ignore
    }
  }, [theme]);

  // Check server Gemini availability
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: { cloudAvailable?: boolean }) => {
        const available = Boolean(data?.cloudAvailable);
        setCloudAvailable(available);
        setSettings((prev) => ({
          ...prev,
          engineMode: available ? prev.engineMode : 'offline',
        }));
      })
      .catch(() => {
        setCloudAvailable(false);
      });
  }, []);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        setGuestMode(false);
        setWorkspaceReady(false);
        setSendError(null);
        try {
          const profile = await ensureAndLoadUserProfile(user, {
            ...DEFAULT_SETTINGS,
            theme,
            engineMode: cloudAvailable ? 'cloud' : 'offline',
          });
          setUserProfileDisplay({
            displayName: profile.displayName,
            email: profile.email,
            photoURL: profile.photoURL,
          });
          setShareMemoryEnabled(profile.shareMemoryEnabled);
          setSharedMemory(profile.sharedMemory);
          setSettings((prev) => ({
            ...profile.settings,
            engineMode: prev.engineMode,
          }));
          setTheme(profile.settings.theme);

          let loadedChats = await loadUserChats(user.uid);
          if (loadedChats.length === 0) {
            const firstChat = createInitialChat();
            await createFirestoreChat(user.uid, firstChat);
            loadedChats = [firstChat];
          }
          setChats(loadedChats);
          setActiveChatId(loadedChats[0].id);
          setWorkspaceReady(true);
        } catch (err) {
          console.error('Failed loading user workspace:', err);
          setSendError(
            err instanceof Error
              ? err.message
              : 'Failed loading your Cloud Firestore workspace.'
          );
          setWorkspaceReady(true);
        }
      } else {
        setWorkspaceReady(true);
        if (getAutostartGuest()) {
          const snap = loadGuestState();
          setChats(snap.chats);
          setActiveChatId(snap.activeChatId);
          setSharedMemory(snap.sharedMemory);
          setShareMemoryEnabled(snap.shareMemoryEnabled);
          setSettings((prev) => ({ ...snap.settings, engineMode: prev.engineMode }));
        }
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Persist Guest state automatically when in guestMode
  useEffect(() => {
    if (guestMode && !firebaseUser && chats.length > 0) {
      saveGuestState({
        shareMemoryEnabled,
        sharedMemory,
        settings: { ...settings, theme },
        chats,
        activeChatId: activeChatId || chats[0].id,
      });
    }
  }, [guestMode, firebaseUser, shareMemoryEnabled, sharedMemory, settings, theme, chats, activeChatId]);

  const activeChat = useMemo(() => {
    return chats.find((c) => c.id === activeChatId) || chats[0];
  }, [chats, activeChatId]);

  const userState: UserState = useMemo(
    () => ({
      uid: firebaseUser ? firebaseUser.uid : 'guest',
      isGuest: !firebaseUser,
      displayName: firebaseUser ? userProfileDisplay.displayName : 'Guest',
      email: firebaseUser ? userProfileDisplay.email : '',
      photoURL: firebaseUser ? userProfileDisplay.photoURL : '',
      shareMemoryEnabled,
      sharedMemory,
      settings: { ...settings, theme },
    }),
    [firebaseUser, userProfileDisplay, shareMemoryEnabled, sharedMemory, settings, theme]
  );

  const handleContinueAsGuest = () => {
    const snap = loadGuestState();
    setGuestMode(true);
    setChats(snap.chats);
    setActiveChatId(snap.activeChatId);
    setSharedMemory(snap.sharedMemory);
    setShareMemoryEnabled(snap.shareMemoryEnabled);
    setSettings({ ...snap.settings, theme });
    setActiveTab('chat');
  };

  const handleToggleTheme = () => {
    const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    const nextSettings: ChatSettings = { ...settings, theme: nextTheme };
    setSettings(nextSettings);
    if (firebaseUser && workspaceReady) {
      void saveUserSettingsToFirestore(firebaseUser.uid, nextSettings).catch((err) => {
        console.error('Failed saving theme:', err);
      });
    }
  };

  const handleLogout = async () => {
    setSendError(null);
    if (firebaseUser) {
      await signOut(auth);
    }
    setGuestMode(false);
    setActiveTab('chat');
  };

  const handleNewChat = async () => {
    const newChat = createInitialChat(`Chat ${chats.length + 1}`);
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setSendError(null);
    if (firebaseUser && workspaceReady) {
      try {
        await createFirestoreChat(firebaseUser.uid, newChat);
      } catch (err) {
        setSendError(err instanceof Error ? err.message : 'Failed creating chat in Firestore.');
      }
    }
  };

  const handleClearChat = async () => {
    if (!activeChat) return;
    setSendError(null);
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat.id
          ? { ...c, title: 'New Chat', messages: [], updatedAtMs: Date.now() }
          : c
      )
    );
    if (firebaseUser && workspaceReady) {
      try {
        await clearFirestoreChat(firebaseUser.uid, activeChat.id);
      } catch (err) {
        setSendError(err instanceof Error ? err.message : 'Failed clearing chat in Firestore.');
      }
    }
  };

  const handleToggleShareMemory = () => {
    const next = !shareMemoryEnabled;
    setShareMemoryEnabled(next);
    if (firebaseUser && workspaceReady) {
      void saveSharedMemoryToFirestore(firebaseUser.uid, next, sharedMemory).catch((err) => {
        setSendError(err instanceof Error ? err.message : 'Failed saving memory preference.');
      });
    }
  };

  const handleResetSharedMemory = () => {
    const cleared: SharedMemory = { userName: '', facts: [] };
    setSharedMemory(cleared);
    if (firebaseUser && workspaceReady) {
      void saveSharedMemoryToFirestore(firebaseUser.uid, shareMemoryEnabled, cleared).catch((err) => {
        setSendError(err instanceof Error ? err.message : 'Failed resetting shared memory.');
      });
    }
  };

  const handleUpdateSettings = (partial: Partial<ChatSettings>) => {
    const next: ChatSettings = { ...settings, ...partial, theme };
    setSettings(next);
    if (firebaseUser && workspaceReady) {
      void saveUserSettingsToFirestore(firebaseUser.uid, next).catch((err) => {
        setSendError(err instanceof Error ? err.message : 'Failed saving settings.');
      });
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!activeChat) return;
    setSendError(null);

    const nowMs = Date.now();
    const userMsg: ChatMessage = {
      id: generateSafeId('msg_u'),
      chatId: activeChat.id,
      role: 'user',
      content,
      modelUsed: 'user',
      createdAtMs: nowMs,
    };

    const nextTitle =
      activeChat.messages.length === 0
        ? content.slice(0, 44) + (content.length > 44 ? '...' : '')
        : activeChat.title;

    const priorMessages = activeChat.messages;
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat.id
          ? { ...c, title: nextTitle, updatedAtMs: nowMs, messages: [...c.messages, userMsg] }
          : c
      )
    );

    setIsSending(true);
    try {
      let assistantContent = '';
      let modelUsed = 'offline-local';
      let nextMemory = sharedMemory;
      let memoryUpdated = false;

      if (settings.engineMode === 'offline') {
        const offline = generateOfflineReply({
          message: content,
          history: priorMessages,
          systemInstruction: settings.systemInstruction,
          shareMemoryEnabled,
          sharedMemory,
        });
        assistantContent = offline.reply;
        nextMemory = offline.updatedMemory;
        memoryUpdated = offline.memoryChanged;
      } else {
        // Extract memory updates even in Cloud Gemini mode
        const memExtract = extractMemoryFromMessage(
          content,
          shareMemoryEnabled ? sharedMemory : deriveChatScopedMemory(priorMessages)
        );
        if (shareMemoryEnabled && memExtract.changed) {
          nextMemory = memExtract.updated;
          memoryUpdated = true;
        }

        const effectiveMemory = shareMemoryEnabled ? nextMemory : memExtract.updated;
        const memoryContextLines: string[] = [];
        if (effectiveMemory.userName) {
          memoryContextLines.push(`User's name: ${effectiveMemory.userName}`);
        }
        if (effectiveMemory.facts.length > 0) {
          memoryContextLines.push(`Remembered facts: ${effectiveMemory.facts.join('; ')}`);
        }

        const fullSystemInstruction =
          memoryContextLines.length > 0
            ? `${settings.systemInstruction}\n\n[User Memory Context]\n${memoryContextLines.join('\n')}`
            : settings.systemInstruction;

        const resp = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: content,
            history: priorMessages.map((m) => ({ role: m.role, content: m.content })),
            systemInstruction: fullSystemInstruction,
            temperature: settings.temperature,
            model: settings.model,
          }),
        });

        const data = (await resp.json()) as {
          text?: string;
          modelUsed?: string;
          fallbackFrom?: string;
          error?: string;
        };

        if (!resp.ok || !data.text) {
          throw new Error(data.error || 'Cloud Gemini request failed.');
        }

        assistantContent = data.text;
        modelUsed = data.fallbackFrom
          ? `${data.modelUsed} (fallback from ${data.fallbackFrom})`
          : data.modelUsed || settings.model;
      }

      if (shareMemoryEnabled && memoryUpdated) {
        setSharedMemory(nextMemory);
        if (firebaseUser) {
          void saveSharedMemoryToFirestore(firebaseUser.uid, shareMemoryEnabled, nextMemory);
        }
      }

      const assistantMsg: ChatMessage = {
        id: generateSafeId('msg_a'),
        chatId: activeChat.id,
        role: 'assistant',
        content: assistantContent,
        modelUsed,
        createdAtMs: Date.now(),
      };

      const totalCount = priorMessages.length + 2;
      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat.id
            ? {
                ...c,
                title: nextTitle,
                updatedAtMs: assistantMsg.createdAtMs,
                messages: [...priorMessages, userMsg, assistantMsg],
              }
            : c
        )
      );

      if (firebaseUser) {
        await appendTurnToFirestore({
          uid: firebaseUser.uid,
          chatId: activeChat.id,
          title: nextTitle,
          userMsg,
          assistantMsg,
          newMessageCount: totalCount,
        });
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to generate reply.');
    } finally {
      setIsSending(false);
    }
  };

  const handleRestoreBackup = async (payload: BackupPayload) => {
    setChats(payload.chats);
    setActiveChatId(payload.chats[0].id);
    setSharedMemory(payload.sharedMemory);
    setShareMemoryEnabled(payload.shareMemoryEnabled);
    if (firebaseUser) {
      await importBackupToFirestore(firebaseUser.uid, payload);
    }
  };

  if (!authReady || (firebaseUser && !workspaceReady)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC] dark:bg-[#0E1117] text-sm text-[#475569] dark:text-[#94A3B8]">
        Loading workspace...
      </div>
    );
  }

  if (!firebaseUser && !guestMode) {
    return (
      <AuthScreen
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onContinueAsGuest={handleContinueAsGuest}
      />
    );
  }

  return (
    <div
      className={`${
        activeTab === 'chat' ? 'h-dvh overflow-hidden' : 'min-h-screen'
      } flex flex-col bg-[#F7F9FC] dark:bg-[#0E1117] text-[#111827] dark:text-[#F1F5F9]`}
    >
      <TopBar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0 });
        }}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        userState={userState}
        onLogout={() => void handleLogout()}
      />

      {activeTab === 'chat' && activeChat ? (
        <ChatScreen
          chats={chats}
          activeChat={activeChat}
          onSelectChat={(id) => {
            setActiveChatId(id);
            setSendError(null);
          }}
          onNewChat={() => void handleNewChat()}
          onClearChat={() => void handleClearChat()}
          shareMemoryEnabled={shareMemoryEnabled}
          onToggleShareMemory={handleToggleShareMemory}
          sharedMemory={sharedMemory}
          onResetSharedMemory={handleResetSharedMemory}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          cloudAvailable={cloudAvailable}
          isSending={isSending}
          sendError={sendError}
          onDismissError={() => setSendError(null)}
          onSendMessage={handleSendMessage}
        />
      ) : (
        <HelpBackupScreen
          chats={chats}
          sharedMemory={sharedMemory}
          shareMemoryEnabled={shareMemoryEnabled}
          onRestoreBackup={handleRestoreBackup}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
