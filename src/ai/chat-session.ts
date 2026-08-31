/**
 * src/ai/chat-session.ts
 *
 * ponytail: 单会话 abort 控制 — 同时只跑一个 ai:chat.
 */
type ChatSession = {
  id: number;
  aborted: boolean;
  abortReq: (() => void) | null;
};

let activeSession: ChatSession | null = null;

export function beginChatSession() {
  const session: ChatSession = {
    id: Date.now(),
    aborted: false,
    abortReq: null,
  };
  activeSession = session;
  return {
    id: session.id,
    isAborted: () => session.aborted,
    setAbortHandler: (fn: () => void) => {
      session.abortReq = fn;
    },
  };
}

export function cancelChatSession(sessionId?: number): boolean {
  if (!activeSession) return false;
  if (sessionId != null && activeSession.id !== sessionId) return false;
  activeSession.aborted = true;
  if (activeSession.abortReq) activeSession.abortReq();
  return true;
}

export function endChatSession(sessionId: number) {
  if (activeSession && activeSession.id === sessionId) {
    activeSession = null;
  }
}

module.exports = {
  beginChatSession,
  cancelChatSession,
  endChatSession,
};
