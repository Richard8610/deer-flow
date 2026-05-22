import { useEffect, useRef, useState } from 'react';
import { fetchSkills, type Skill } from '../api';

const TOOLS = ['Calculator', 'Web Search', 'Image Generator'];
const ACCEPT = '.pdf,.txt,.docx,.md';

interface Msg {
  id: string;
  role: 'user' | 'bot';
  text: string;
}

function mockBotReply(userText: string): string {
  return `(mock) Got your message: "${userText.slice(0, 80)}${userText.length > 80 ? '…' : ''}"`;
}

export function FloatingChat() {
  const [open, setOpen]               = useState(false);
  const [messages, setMessages]       = useState<Msg[]>([]);
  const [input, setInput]             = useState('');
  const [file, setFile]               = useState<File | null>(null);
  const [skills, setSkills]           = useState<Skill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [dragging, setDragging]       = useState(false);

  const scrollRef  = useRef<HTMLDivElement>(null);
  const fileRef    = useRef<HTMLInputElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchSkills().then(setSkills).catch(() => setSkills([]));
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function handleFile(f: File | null) {
    if (!f) return;
    const allowed = ['.pdf', '.txt', '.docx', '.md'];
    const ext = '.' + f.name.split('.').pop()!.toLowerCase();
    if (!allowed.includes(ext)) { alert(`Unsupported file type: ${ext}`); return; }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => console.log('[FloatingChat] file content preview:', (e.target?.result as string)?.slice(0, 500));
    reader.readAsText(f);
  }

  function toggleTool(tool: string) {
    setSelectedTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool],
    );
  }

  function send() {
    const text = input.trim();
    if (!text) return;
    const payload = { message: text, uploadedFile: file?.name ?? null, selectedSkill, selectedTools };
    console.log('[FloatingChat] send:', payload);

    const uid = `u-${Date.now()}`;
    const bid = `b-${Date.now() + 1}`;
    setMessages((prev) => [
      ...prev,
      { id: uid, role: 'user', text },
      { id: bid, role: 'bot',  text: mockBotReply(text) },
    ]);
    setInput('');
  }

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  function onDragOver(e: React.DragEvent) { e.preventDefault(); setDragging(true); }
  function onDragLeave()                  { setDragging(false); }
  function onDrop(e: React.DragEvent)     { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0] ?? null); }

  return (
    <>
      {/* Collapsed toggle button */}
      {!open && (
        <button
          className="fc-toggle"
          onClick={() => setOpen(true)}
          aria-label="Open chat"
        >
          💬
        </button>
      )}

      {/* Expanded window */}
      {open && (
        <div className="fc-window" role="dialog" aria-label="AI Chat Assistant">
          {/* Header */}
          <div className="fc-header">
            <span className="fc-header__title">AI Chat Assistant</span>
            <button className="fc-header__close" onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
          </div>

          {/* Message history */}
          <div className="fc-messages" ref={scrollRef}>
            {messages.length === 0 ? (
              <p className="fc-empty">Send a message to start the conversation.</p>
            ) : messages.map((m) => (
              <div key={m.id} className={`fc-msg fc-msg--${m.role}`}>
                <span className="fc-msg__label">{m.role === 'user' ? 'You' : 'Bot'}</span>
                <div className="fc-msg__bubble">{m.text}</div>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="fc-toolbar">
            {/* File upload */}
            <div
              className={`fc-drop${dragging ? ' fc-drop--active' : ''}`}
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Upload document"
              onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
            >
              {file
                ? <span className="fc-drop__file">📄 {file.name} <button className="fc-drop__remove" onClick={(e) => { e.stopPropagation(); setFile(null); }} aria-label="Remove file">✕</button></span>
                : <span>📎 Upload file <span className="fc-drop__hint">(pdf, txt, docx, md)</span></span>
              }
            </div>
            <input ref={fileRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />

            {/* Skill selector */}
            <div className="fc-field">
              <label className="fc-label" htmlFor="fc-skill">Select a skill</label>
              <select
                id="fc-skill"
                className="fc-select"
                value={selectedSkill}
                onChange={(e) => setSelectedSkill(e.target.value)}
              >
                <option value="">— none —</option>
                {skills.map((s) => (
                  <option key={s.name} value={s.name} title={s.description}>{s.name}</option>
                ))}
              </select>
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
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              aria-label="Message input"
            />
            <button
              className="fc-send"
              onClick={send}
              disabled={!input.trim()}
              aria-label="Send message"
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  );
}
