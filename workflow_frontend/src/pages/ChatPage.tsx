import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { streamChat, fetchProjects, type ChatMessage } from '../api';
import { APP } from '../workflow.config';

const WORKFLOW_JSON_RE = /```(?:json)?\s*(\{[\s\S]*?"nodes"[\s\S]*?"edges"[\s\S]*?\})\s*```/;

function extractWorkflowJSON(text: string): string | null {
  const m = text.match(WORKFLOW_JSON_RE);
  if (!m) return null;
  try { JSON.parse(m[1]); return m[1]; } catch { return null; }
}

function workflowToBase64(json: string): string {
  return btoa(json);
}

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

export function ChatPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [projects, setProjects]         = useState<string[]>([]);
  const [activeProject, setActiveProject] = useState(searchParams.get('project') ?? '');
  const [messages, setMessages]         = useState<Msg[]>([]);
  const [input, setInput]               = useState('');
  const [streaming, setStreaming]       = useState(false);

  const scrollRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleProjectChange = useCallback((name: string) => {
    setActiveProject(name);
    const url = name ? `/chat?project=${encodeURIComponent(name)}` : '/chat';
    navigate(url, { replace: true });
  }, [navigate]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', content: text };
    const aiId = `a-${Date.now()}`;
    const aiMsg: Msg = { id: aiId, role: 'assistant', content: '' };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput('');
    setStreaming(true);

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

  const lastAI = [...messages].reverse().find((m) => m.role === 'assistant' && m.content);
  const embeddedJSON = lastAI ? extractWorkflowJSON(lastAI.content) : null;
  const builderHref = embeddedJSON
    ? `/?workflow=${encodeURIComponent(workflowToBase64(embeddedJSON))}`
    : '/';

  return (
    <div className="chat-page">
      <header className="topbar">
        <Link to="/" className="topbar__back">← Builder</Link>
        <span className="topbar__title">{APP.title} — Agent Chat</span>

        {projects.length > 0 && (
          <select
            className="topbar__project-select"
            value={activeProject}
            onChange={(e) => handleProjectChange(e.target.value)}
          >
            <option value="">— no project —</option>
            {projects.map((p) => (
              <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
            ))}
          </select>
        )}

        {embeddedJSON && (
          <Link to={builderHref} className="topbar__chat-btn topbar__chat-btn--active">
            ↙ Open in Builder
          </Link>
        )}
      </header>

      <div className="chat-full">
        <div className="chat-full__messages" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="chat-panel__empty">
              <p>Describe the workflow you want to build.</p>
              <p>The agent will help plan it — if it outputs a workflow definition you can open it in the Builder.</p>
              {!activeProject && projects.length > 0 && (
                <p style={{ color: '#64748B', fontSize: '11px' }}>
                  Select a project above to route your message to the right agent.
                </p>
              )}
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-msg chat-msg--${msg.role}${msg.error ? ' chat-msg--error' : ''}`}
              >
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

        <div className="chat-full__footer">
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
    </div>
  );
}
