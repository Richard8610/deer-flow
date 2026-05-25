import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { ChatPanel } from './components/ChatPanel';
import { useWorkflow } from './store/useWorkflow';
import { APP } from './workflow.config';
import { fetchProjects, fetchWorkflow, saveWorkflow } from './api';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function App() {
  const { nodes, edges, selectedNodeId, importJSON } = useWorkflow();

  const [projects, setProjects]           = useState<string[]>([]);
  const [activeProject, setActiveProject] = useState('');
  const [saveStatus, setSaveStatus]       = useState<SaveStatus>('idle');
  const [showChat, setShowChat]           = useState(false);

  const saveTimer        = useRef<ReturnType<typeof setTimeout>>();
  const activeProjectRef = useRef('');
  const skipNextSave     = useRef(false);
  const didAutoSelect    = useRef(false);

  // Load from ?workflow=<url> query param
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('workflow');
    if (!param || (!param.startsWith('http://') && !param.startsWith('https://'))) return;
    fetch(param)
      .then((r) => r.text())
      .then(importJSON)
      .catch((err) => console.error('Failed to load workflow from URL:', err));
  }, [importJSON]);

  // Discover projects from persistence server
  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  // Switch project: load its workflow.json
  const handleProjectChange = useCallback(async (name: string) => {
    activeProjectRef.current = name;
    setActiveProject(name);
    setSaveStatus('idle');
    if (!name) return;
    try {
      const data = await fetchWorkflow(name);
      skipNextSave.current = true;
      importJSON(JSON.stringify(data));
    } catch (e) {
      console.error('Failed to load project workflow:', e);
    }
  }, [importJSON]);

  // Auto-select project from ?project=<name> URL param once the project list is loaded
  useEffect(() => {
    if (didAutoSelect.current || projects.length === 0) return;
    const param = new URLSearchParams(window.location.search).get('project');
    if (param && projects.includes(param)) {
      didAutoSelect.current = true;
      void handleProjectChange(param);
    }
  }, [projects, handleProjectChange]);

  // Auto-save on canvas change (debounced 1 s)
  useEffect(() => {
    const project = activeProjectRef.current;
    if (!project) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }

    clearTimeout(saveTimer.current);
    setSaveStatus('idle');
    saveTimer.current = setTimeout(async () => {
      const current = activeProjectRef.current;
      if (!current) return;
      setSaveStatus('saving');
      try {
        await saveWorkflow(current, { nodes, edges });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('error');
      }
    }, 1000);

    return () => clearTimeout(saveTimer.current);
  }, [nodes, edges]);


  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar__title">{APP.title}</span>

        {projects.length > 0 && (
          <select
            className="topbar__project-select"
            value={activeProject}
            onChange={(e) => void handleProjectChange(e.target.value)}
          >
            <option value="">— local only —</option>
            {projects.map((p) => (
              <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
            ))}
          </select>
        )}

        {activeProject && saveStatus !== 'idle' && (
          <span className={`topbar__save-status topbar__save-status--${saveStatus}`}>
            {saveStatus === 'saving' && '↑ saving…'}
            {saveStatus === 'saved'  && '✓ saved'}
            {saveStatus === 'error'  && '✗ save failed'}
          </span>
        )}

        <Link
          to={activeProject ? `/chat?project=${encodeURIComponent(activeProject)}` : '/chat'}
          className="topbar__chat-btn"
        >
          💬 Chat
        </Link>

        <button
          className={`topbar__agent-btn${showChat ? ' topbar__agent-btn--active' : ''}`}
          onClick={() => setShowChat((v) => !v)}
          title="Toggle agent sidebar"
        >
          🤖 Agent
        </button>

        <div className="topbar__stats">
          <span>{nodes.length} nodes</span>
          <span>·</span>
          <span>{edges.length} edges</span>
          {selectedNodeId && (
            <>
              <span>·</span>
              <span className="topbar__selected">selected: <code>{selectedNodeId}</code></span>
            </>
          )}
        </div>

        {APP.githubUrl && (
          <a className="topbar__link" href={APP.githubUrl} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        )}
      </header>

      <div className="layout">
        <Sidebar />
        <main className="canvas-wrap">
          <Canvas />
        </main>
        <Inspector />
        {showChat && <ChatPanel activeProject={activeProject} />}
      </div>
    </div>
  );
}
