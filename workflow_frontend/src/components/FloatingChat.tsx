import { useEffect, useRef, useState } from 'react';
import { streamChat, fetchSkills, fetchModels, type ChatMessage, type Skill, type Model } from '../api';

const TOOLS = ['Calculator', 'Web Search', 'Image Generator'];
const ACCEPT = '.pdf,.txt,.docx,.md';

const WORKFLOW_RE = /```(?:json)?\s*(\{[\s\S]*?"nodes"[\s\S]*?"edges"[\s\S]*?\})\s*```/;

function extractWorkflowJSON(text: string): string | null {
  const m = text.match(WORKFLOW_RE);
  if (!m) return null;
  try { JSON.parse(m[1]); return m[1]; } catch { return null; }
}

function workflowToBuilderHref(json: string): string | null {
  try { return `/?workflow=${btoa(json)}`; } catch { return null; }
}

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

export function FloatingChat({ project = '' }: { project?: string }) {
  const [messages, setMessages]             = useState<Msg[]>([]);
  const [input, setInput]                   = useState('');
  const [streaming, setStreaming]           = useState(false);
  const [workflowJSON, setWorkflowJSON]     = useState<string | null>(null);

  const [models, setModels]                 = useState<Model[]>([]);
  const [selectedModel, setSelectedModel]   = useState('');
  const [skills, setSkills]                 = useState<Skill[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skillPanelOpen, setSkillPanelOpen] = useState(true);
  const [selectedTools, setSelectedTools]   = useState<string[]>([]);

  const [file, setFile]     = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const scrollRef     = useRef<HTMLDivElement>(null);
  const fileRef       = useRef<HTMLInputElement>(null);
  const inputRef      = useRef<HTMLTextAreaElement>(null);
  const skillPanelRef = useRef<HTMLDivElement>(null);
  const aiAccumRef    = useRef('');   // accumulates streaming text for workflow detection

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchModels().then((loaded) => {
      setModels(loaded);
      if (loaded.length > 0) setSelectedModel(loaded[0].name);
    }).catch(() => {});

    fetchSkills().then((loaded) => {
      setSkills(loaded);
      setSelectedSkills(loaded.filter((s) => s.category === 'public').map((s) => s.name));
    }).catch(() => {});

    inputRef.current?.focus();
  }, []);

  // ── Poll for newly created custom skills every 15 s ────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      fetchSkills().then((loaded) => {
        setSkills((prev) => {
          const names = new Set(prev.map((s) => s.name));
          const newOnes = loaded.filter((s) => s.category === 'custom' && !names.has(s.name));
          return newOnes.length ? [...prev, ...newOnes] : prev;
        });
      }).catch(() => {});
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  // ── Close skill panel on outside click ────────────────────────────────────
  useEffect(() => {
    if (!skillPanelOpen) return;
    function handle(e: MouseEvent) {
      if (skillPanelRef.current && !skillPanelRef.current.contains(e.target as Node))
        setSkillPanelOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [skillPanelOpen]);

  // ── Scroll to latest message ───────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ── File handling ──────────────────────────────────────────────────────────
  function handleFile(f: File | null) {
    if (!f) return;
    const allowed = ['.pdf', '.txt', '.docx', '.md'];
    const ext = '.' + f.name.split('.').pop()!.toLowerCase();
    if (!allowed.includes(ext)) { alert(`Unsupported file type: ${ext}`); return; }
    setFile(f);
  }

  function toggleSkill(name: string) {
    setSelectedSkills((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  }

  function toggleTool(tool: string) {
    setSelectedTools((prev) => prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]);
  }

  // ── Send ───────────────────────────────────────────────────────────────────
  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    const uid  = `u-${Date.now()}`;
    const aiId = `a-${Date.now() + 1}`;

    // Build history including the new user message
    const history: ChatMessage[] = [
      ...messages.map(({ role, content }) => ({ role, content })),
      { role: 'user', content: text },
    ];

    setMessages((prev) => [
      ...prev,
      { id: uid,  role: 'user',      content: text },
      { id: aiId, role: 'assistant', content: '' },
    ]);
    setInput('');
    setStreaming(true);
    setWorkflowJSON(null);
    aiAccumRef.current = '';

    try {
      await streamChat(
        history,
        project,
        (chunk) => {
          aiAccumRef.current += chunk;
          setMessages((prev) =>
            prev.map((m) => m.id === aiId ? { ...m, content: m.content + chunk } : m),
          );
        },
        (errMsg) => {
          setMessages((prev) =>
            prev.map((m) => m.id === aiId ? { ...m, content: errMsg, error: true } : m),
          );
        },
        { model: selectedModel },
      );

      const wf = extractWorkflowJSON(aiAccumRef.current);
      if (wf) setWorkflowJSON(wf);
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) => m.id === aiId ? { ...m, content: String(e), error: true } : m),
      );
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  function onDragOver(e: React.DragEvent) { e.preventDefault(); setDragging(true); }
  function onDragLeave()                  { setDragging(false); }
  function onDrop(e: React.DragEvent)     { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0] ?? null); }

  const publicSkills = skills.filter((s) => s.category === 'public');
  const customSkills = skills.filter((s) => s.category === 'custom');
  const skillSummary = selectedSkills.length === 0
    ? 'No skills selected'
    : `${selectedSkills.length} skill${selectedSkills.length !== 1 ? 's' : ''} selected`;

  const builderHref = workflowJSON ? workflowToBuilderHref(workflowJSON) : null;

  return (
    <div className="fc-window" role="dialog" aria-label="AI Chat Assistant">
      {/* Header */}
      <div className="fc-header">
        <span className="fc-header__title">AI Chat Assistant</span>
        {project && <span className="fc-header__project">{project.replace(/_/g, ' ')}</span>}
      </div>

      {/* Messages */}
      <div className="fc-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="fc-empty">Describe the workflow you want to build, or ask anything.</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`fc-msg fc-msg--${m.role}${m.error ? ' fc-msg--error' : ''}`}>
              <span className="fc-msg__label">{m.role === 'user' ? 'You' : 'Agent'}</span>
              <div className="fc-msg__bubble">
                {m.content
                  ? <pre className="fc-msg__text">{m.content}</pre>
                  : streaming && m.role === 'assistant'
                    ? <span className="fc-msg__thinking">thinking…</span>
                    : null
                }
              </div>
            </div>
          ))
        )}
      </div>

      {/* Workflow detected banner */}
      {builderHref && (
        <div className="fc-workflow-banner">
          <span>⚡ Workflow generated</span>
          <a href={builderHref} target="_blank" rel="noreferrer" className="fc-workflow-banner__link">
            Open in Builder ↗
          </a>
        </div>
      )}

      {/* Toolbar */}
      <div className="fc-toolbar">
        {/* File upload */}
        <div
          className={`fc-drop${dragging ? ' fc-drop--active' : ''}`}
          onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          role="button" tabIndex={0} aria-label="Upload document"
          onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
        >
          {file
            ? <span className="fc-drop__file">📄 {file.name} <button className="fc-drop__remove" onClick={(e) => { e.stopPropagation(); setFile(null); }} aria-label="Remove file">✕</button></span>
            : <span>📎 Upload file <span className="fc-drop__hint">(pdf, txt, docx, md)</span></span>
          }
        </div>
        <input ref={fileRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />

        {/* Model selector */}
        {models.length > 0 && (
          <div className="fc-field">
            <label className="fc-label" htmlFor="fc-model">Model</label>
            <select id="fc-model" className="fc-select" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
              {models.map((m) => (
                <option key={m.name} value={m.name}>{m.display_name ?? m.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Skill dropdown */}
        <div className="fc-field fc-skill-field" ref={skillPanelRef}>
          <span className="fc-label">Skills</span>
          <button
            className={`fc-skill-trigger${skillPanelOpen ? ' fc-skill-trigger--open' : ''}`}
            onClick={() => setSkillPanelOpen((v) => !v)}
            aria-expanded={skillPanelOpen}
          >
            <span>{skillSummary}</span>
            <span className="fc-skill-arrow">{skillPanelOpen ? '▲' : '▼'}</span>
          </button>

          {skillPanelOpen && (
            <div className="fc-skill-panel">
              {publicSkills.length > 0 && (
                <div className="fc-skill-section">
                  <div className="fc-skill-section-header">
                    <span className="fc-skill-section-label">Public</span>
                    <span className="fc-skill-actions">
                      <button className="fc-skill-action" onClick={() => setSelectedSkills((p) => [...new Set([...p, ...publicSkills.map((s) => s.name)])])}>All</button>
                      <button className="fc-skill-action" onClick={() => setSelectedSkills((p) => p.filter((n) => !publicSkills.some((s) => s.name === n)))}>None</button>
                    </span>
                  </div>
                  {publicSkills.map((s) => (
                    <label key={s.name} className="fc-skill-item" title={s.description}>
                      <input type="checkbox" className="fc-skill-checkbox" checked={selectedSkills.includes(s.name)} onChange={() => toggleSkill(s.name)} />
                      <span>{s.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="fc-skill-section">
                <span className="fc-skill-section-label fc-skill-section-label--custom">Custom</span>
                {customSkills.length === 0
                  ? <span className="fc-skill-empty">No custom skills yet</span>
                  : customSkills.map((s) => (
                    <label key={s.name} className="fc-skill-item fc-skill-item--custom" title={`Custom: ${s.description}`}>
                      <input type="checkbox" className="fc-skill-checkbox" checked={selectedSkills.includes(s.name)} onChange={() => toggleSkill(s.name)} />
                      <span>{s.name}</span>
                    </label>
                  ))
                }
              </div>
            </div>
          )}
        </div>

        {/* Tool chips */}
        <div className="fc-field">
          <span className="fc-label">Select tools</span>
          <div className="fc-chips" role="group" aria-label="Tool selection">
            {TOOLS.map((tool) => (
              <button
                key={tool}
                className={`fc-chip${selectedTools.includes(tool) ? ' fc-chip--on' : ''}`}
                onClick={() => toggleTool(tool)}
                aria-pressed={selectedTools.includes(tool)}
              >
                {tool}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="fc-footer">
        <textarea
          ref={inputRef}
          className="fc-input"
          placeholder="Type a message…"
          rows={2}
          value={input}
          disabled={streaming}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          aria-label="Message input"
        />
        <button
          className="fc-send"
          onClick={() => void send()}
          disabled={!input.trim() || streaming}
          aria-label="Send message"
        >
          {streaming ? <span className="fc-send__spinner" /> : '↑'}
        </button>
      </div>
    </div>
  );
}