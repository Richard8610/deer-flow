import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { useWorkflow } from './store/useWorkflow';
import { APP } from './workflow.config';

export default function App() {
  const { nodes, edges, selectedNodeId, importJSON } = useWorkflow();

  // Load from ?workflow=<url> — base64 payloads are decoded at store init time.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('workflow');
    if (!param || (!param.startsWith('http://') && !param.startsWith('https://'))) return;
    fetch(param)
      .then((r) => r.text())
      .then(importJSON)
      .catch((err) => console.error('Failed to load workflow from URL:', err));
  }, [importJSON]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar__title">{APP.title}</span>
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
      </div>
    </div>
  );
}
