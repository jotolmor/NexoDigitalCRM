import { useSyncExternalStore } from 'react';

type Message = { role: 'user' | 'assistant'; content: string };
type Snapshot = {
  assistantAnswer: string;
  assistantHistory: Message[];
  assistantError: string;
  assistantAction: any;
  assistantBusy: boolean;
  assistantDraft: string;
};
type Session = { accessToken: string; user: { tenantId: string; id?: string; clinicId?: string | null } };
type Update<T> = T | ((previous: T) => T);
const prefix = 'nexocrm-assistant-v1:';
const empty = (): Snapshot => ({ assistantAnswer: '', assistantHistory: [], assistantError: '',
  assistantAction: null, assistantBusy: false, assistantDraft: '' });
const stores = new Map<string, ReturnType<typeof createStore>>();

function scope(session: Session) {
  const user = session.user;
  if (!user.id) throw new Error('La sesión no identifica al usuario. Vuelve a iniciar sesión.');
  return prefix + JSON.stringify([user.tenantId, user.clinicId ?? null, user.id]);
}

function restore(key: string): Snapshot {
  const initial = empty();
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (!saved || saved.version !== 1) return initial;
    if (Array.isArray(saved.history)) initial.assistantHistory = saved.history
      .filter((entry: any) => entry && (entry.role === 'user' || entry.role === 'assistant') && typeof entry.content === 'string')
      .slice(-40).map((entry: Message) => ({ role: entry.role, content: entry.content.slice(0, 4000) }));
    initial.assistantAnswer = initial.assistantHistory.filter(entry => entry.role === 'assistant').at(-1)?.content ?? '';
    initial.assistantDraft = typeof saved.draft === 'string' ? saved.draft.slice(0, 1000) : '';
    if (saved.hadPending) initial.assistantError = 'La acción pendiente debe volver a prepararse antes de confirmarla.';
  } catch { /* A browser that blocks storage can still use in-memory chat. */ }
  return initial;
}

function createStore(key: string) {
  let snapshot = restore(key);
  let active = true;
  const listeners = new Set<() => void>();
  const update = <K extends keyof Snapshot>(field: K, value: Update<Snapshot[K]>) => {
    if (!active) return;
    const next = typeof value === 'function'
      ? (value as (previous: Snapshot[K]) => Snapshot[K])(snapshot[field]) : value;
    snapshot = { ...snapshot, [field]: next };
    if (field === 'assistantHistory') snapshot.assistantHistory = snapshot.assistantHistory.slice(-40);
    if (field === 'assistantHistory' || field === 'assistantDraft' || field === 'assistantAction') {
      try { sessionStorage.setItem(key, JSON.stringify({ version: 1,
        history: snapshot.assistantHistory, draft: snapshot.assistantDraft,
        hadPending: Boolean(snapshot.assistantAction) })); } catch { /* Keep the in-memory conversation. */ }
    }
    listeners.forEach(listener => listener());
  };
  const setters = {
    setAssistantAnswer: (value: Update<string>) => update('assistantAnswer', value),
    setAssistantHistory: (value: Update<Message[]>) => update('assistantHistory', value),
    setAssistantError: (value: Update<string>) => update('assistantError', value),
    setAssistantAction: (value: Update<any>) => update('assistantAction', value),
    setAssistantBusy: (value: Update<boolean>) => update('assistantBusy', value),
    setAssistantDraft: (value: Update<string>) => update('assistantDraft', value),
    resetAssistantConversation: () => {
      if (!active || snapshot.assistantBusy) return;
      snapshot = empty();
      try { sessionStorage.removeItem(key); } catch { /* Storage can be disabled. */ }
      listeners.forEach(listener => listener());
    }
  };
  return { getSnapshot: () => snapshot, setters,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    deactivate: () => { active = false; snapshot = empty(); listeners.forEach(listener => listener()); }
  };
}

export function assistantConversationStore(session: Session) {
  const key = scope(session);
  let store = stores.get(key);
  if (!store) { store = createStore(key); stores.set(key, store); }
  return store;
}

export function useAssistantConversation(session: Session) {
  const store = assistantConversationStore(session);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { ...snapshot, ...store.setters };
}

export function clearAssistantConversations() {
  stores.forEach(store => store.deactivate());
  stores.clear();
  try {
    const keys = Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i));
    keys.forEach(key => { if (key?.startsWith(prefix)) sessionStorage.removeItem(key); });
  } catch { /* Storage can be disabled. */ }
}
