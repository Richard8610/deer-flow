import { useEffect, useRef, useState } from 'react';
import { streamChat, type ChatMessage } from '../api';
import { useWorkflow } from '../store/useWorkflow';

// Detect a JSON code block containing nodes + edges
const WORKFLOW_JSON_RE = /```(?:json)?\s*(\{[\s\S]*?"nodes"[\s\S]*?"edges"[\s\S]*?\})\s*```/;

function extractWorkflowJSON(text: string): string | null {
  const m = text.match(WORKFLOW_JSON_RE);
  if (!m) return null;
  try { JSON.parse(m[1]); return m[1]; } catch { return null; }
}

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

export function ChatPanel({ activeProject }: { activeProject: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput]       = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const { importJSON } = useWorkflow();

  // Scroll to bottom whenever messages change
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', content: text };
    const aiId = `a-${Date.now()}`;
    const aiMsg: Msg = { id: aiId, role: 'assistant', content: '' };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput('');
    setStreaming(true);

    // Build history for the API (exclude the empty assistant placeholder)
    const history: ChatMessage[] = [...messages, userMsg].map(({ role, content }) => ({ role, content }));

    try {
      await streamChat(
        history,
        activeProject,
        (chunk) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, content: m.content + chunk } : m)),
          );
        },
        (errMsg) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, content: errMsg, error: true } : m)),
          );
        },
      );
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiId ? { ...m, content: String(e), error: true } : m,
        ),
      );
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  // The last assistant message — checked for embedded workflow JSON
  const lastAI = [...messages].reverse().find((m) => m.role === 'assistant' && m.content);
  const embeddedJSON = lastAI ? extractWorkflowJSON(lastAI.content) : null;

  return (
    <div className="chat-panel">
      <div className="chat-panel__header">
        <span className="chat-panel__title">Agent Chat</span>
        {activeProject
          ? <span className="chat-panel__project">{activeProject.replace(/_/g, ' ')}</span>
          : <span className="chat-panel__project chat-panel__project--none">no project selected</span>
        }
      </div>

      <div className="chat-panel__messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-panel__empty">
            <p>Describe the workflow you want to build.</p>
            <p>The agent will help plan it — if it outputs a workflow definition you can load it straight onto the canvas.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`chat-msg chat-msg--${msg.role}${msg.error ? ' chat-msg--error' : ''}`}>
              <div className="chat-msg__label">{msg.role === 'user' ? 'You' : 'Agent'}</div>
              <div className="chat-msg__bubble">
                {msg.content
                  ? <pre className="chat-msg__text">{msg.content}</pre>
                  : streaming && msg.role === 'assistant'
                    ? <span className="chat-msg__thinking">thinking…</span>
                    : null
                }
              </div>
            </div>
          ))
        )}
      </div>

      {embeddedJSON && (
        <div className="chat-panel__banner">
          <span>Workflow detected in response</span>
          <button
            className="chat-panel__load-btn"
            onClick={() => importJSON(embeddedJSON)}
          >
            ↙ Load to canvas
          </button>
        </div>
      )}

      <div className="chat-panel__footer">
        <textarea
          ref={inputRef}
          className="chat-panel__input"
          placeholder={activeProject
            ? `Describe a workflow for "${activeProject.replace(/_/g, ' ')}"…`
            : 'Describe the workflow you want to build…'}
          rows={3}
          value={input}
          disabled={streaming}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
        />
        <button
          className="chat-panel__send"
          disabled={!input.trim() || streaming}
          onClick={() => void send()}
          title="Send (Enter)"
        >
          {streaming ? <span className="chat-panel__spinner" /> : '↑'}
        </button>
      </div>
    </div>
  );
}
