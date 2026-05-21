import { useRef } from 'react';
import { NODE_KINDS, EXAMPLES, APP } from '../workflow.config';
import { useWorkflow } from '../store/useWorkflow';

export function Sidebar() {
  const { loadExample, clearWorkflow, exportJSON, importJSON } = useWorkflow();
  const fileRef = useRef<HTMLInputElement>(null);

  const onDragStart = (e: React.DragEvent, kind: string) => {
    e.dataTransfer.setData('nodeKind', kind);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleExport = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => importJSON(ev.target?.result as string);
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo">{APP.logo}</span>
        <div>
          <div className="sidebar__name">{APP.title}</div>
          <div className="sidebar__sub">{APP.subtitle}</div>
        </div>
      </div>

      <section className="sidebar__section">
        <div className="sidebar__section-title">Node Types</div>
        <div className="sidebar__hint">Drag onto the canvas to add</div>
        {NODE_KINDS.map(({ kind, color, icon, label, desc }) => (
          <div
            key={kind}
            className="sidebar__item"
            draggable
            onDragStart={(e) => onDragStart(e, kind)}
          >
            <div className="sidebar__item-dot" style={{ background: color }}>
              {icon}
            </div>
            <div>
              <div className="sidebar__item-name">{label}</div>
              <div className="sidebar__item-desc">{desc}</div>
            </div>
          </div>
        ))}
      </section>

      {EXAMPLES.length > 0 && (
        <section className="sidebar__section">
          <div className="sidebar__section-title">Examples</div>
          {EXAMPLES.map(({ label, icon }, index) => (
            <button key={label} className="sidebar__btn" onClick={() => loadExample(index)}>
              {icon} {label}
            </button>
          ))}
        </section>
      )}

      <section className="sidebar__section sidebar__section--bottom">
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button className="sidebar__btn sidebar__btn--outline" onClick={() => fileRef.current?.click()}>
          ↑ Import JSON
        </button>
        <button className="sidebar__btn sidebar__btn--outline" onClick={handleExport}>
          ↓ Export JSON
        </button>
        <button className="sidebar__btn sidebar__btn--danger" onClick={clearWorkflow}>
          ✕ Clear Canvas
        </button>
      </section>
    </aside>
  );
}
