import { useEffect, useRef, useState } from 'react';
import { fetchSkills, fetchModels, type Skill, type Model } from '../api';

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
  const [messages, setMessages]           = useState<Msg[]>([]);
  const [input, setInput]                 = useState('');
  const [file, setFile]                   = useState<File | null>(null);
  const [models, setModels]               = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [skills, setSkills]               = useState<Skill[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skillPanelOpen, setSkillPanelOpen] = useState(true);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [dragging, setDragging]           = useState(false);

  const scrollRef    = useRef<HTMLDivElement>(null);
  const fileRef      = useRef<HTMLInputElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const skillPanelRef = useRef<HTMLDivElement>(null);

  // Initial load — models + skills
  useEffect(() => {
    fetchModels().then((loaded) => {
      setModels(loaded);
      if (loaded.length > 0) setSelectedModel(loaded[0].name);
    }).catch(() => {});
    fetchSkills()
      .then((loaded) => {
        setSkills(loaded);
        setSelectedSkills(loaded.filter((s) => s.category === 'public').map((s) => s.name));
      })
      .catch(() => {});
    inputRef.current?.focus();
  }, []);

  // Poll for newly created custom skills every 15 s
  useEffect(() => {
    const id = setInterval(() => {
      fetchSkills()
        .then((loaded) => {
          setSkills((prev) => {
            const prevNames = new Set(prev.map((s) => s.name));
            const newCustom = loaded.filter((s) => s.category === 'custom' && !prevNames.has(s.name));
            return newCustom.length ? [...prev, ...newCustom] : prev;
          });
        })
        .catch(() => {});
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  // Close skill panel when clicking outside
  useEffect(() => {
    if (!skillPanelOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (skillPanelRef.current && !skillPanelRef.current.contains(e.target as Node)) {
        setSkillPanelOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [skillPanelOpen]);

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
    reader.onload = (e) => console.log('[FloatingChat] file preview:', (e.target?.result as string)?.slice(0, 500));
    reader.readAsText(f);
  }

  function toggleSkill(name: string) {
    setSelectedSkills((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  function toggleTool(tool: string) {
    setSelectedTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool],
    );
  }

  function send() {
    const text = input.trim();
    if (!text) return;
    const payload = { message: text, uploadedFile: file?.name ?? null, selectedModel, selectedSkills, selectedTools };
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

  function onDragOver(e: React.DragEvent) { e.preventDefault(); setDragging(true); }
  function onDragLeave()                  { setDragging(false); }
  function onDrop(e: React.DragEvent)     { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0] ?? null); }

  const publicSkills = skills.filter((s) => s.category === 'public');
  const customSkills = skills.filter((s) => s.category === 'custom');

  const skillSummary = selectedSkills.length === 0
    ? 'No skills selected'
    : `${selectedSkills.length} skill${selectedSkills.length !== 1 ? 's' : ''} selected`;

  return (
    <div className="fc-window" role="dialog" aria-label="AI Chat Assistant">
      {/* Header */}
      <div className="fc-header">
        <span className="fc-header__title">AI Chat Assistant</span>
      </div>

      {/* Message history */}
      {messages.length > 0 && (
        <div className="fc-messages" ref={scrollRef}>
          {messages.map((m) => (
            <div key={m.id} className={`fc-msg fc-msg--${m.role}`}>
              <span className="fc-msg__label">{m.role === 'user' ? 'You' : 'Bot'}</span>
              <div className="fc-msg__bubble">{m.text}</div>
            </div>
          ))}
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
            <select
              id="fc-model"
              className="fc-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.display_name ?? m.name}
                </option>
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
              {/* Public skills */}
              {publicSkills.length > 0 && (
                <div className="fc-skill-section">
                  <div className="fc-skill-section-header">
                    <span className="fc-skill-section-label">Public</span>
                    <span className="fc-skill-actions">
                      <button className="fc-skill-action" onClick={() => setSelectedSkills((prev) => [...new Set([...prev, ...publicSkills.map((s) => s.name)])])}>All</button>
                      <button className="fc-skill-action" onClick={() => setSelectedSkills((prev) => prev.filter((n) => !publicSkills.some((s) => s.name === n)))}>None</button>
                    </span>
                  </div>
                  {publicSkills.map((s) => (
                    <label key={s.name} className="fc-skill-item" title={s.description}>
                      <input
                        type="checkbox"
                        className="fc-skill-checkbox"
                        checked={selectedSkills.includes(s.name)}
                        onChange={() => toggleSkill(s.name)}
                      />
                      <span>{s.name}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Custom skills */}
              <div className="fc-skill-section">
                <span className="fc-skill-section-label fc-skill-section-label--custom">Custom</span>
                {customSkills.length === 0
                  ? <span className="fc-skill-empty">No custom skills yet</span>
                  : customSkills.map((s) => (
                    <label key={s.name} className="fc-skill-item fc-skill-item--custom" title={`Custom: ${s.description}`}>
                      <input
                        type="checkbox"
                        className="fc-skill-checkbox"
                        checked={selectedSkills.includes(s.name)}
                        onChange={() => toggleSkill(s.name)}
                      />
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
  );
}