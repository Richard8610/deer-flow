import { getNodeKindDef, type NodeKindField } from '../workflow.config';
import { useWorkflow } from '../store/useWorkflow';
import type { WorkflowNodeData } from '../types';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="insp__field">
      <label className="insp__label">{label}</label>
      {children}
    </div>
  );
}

function DynamicField({
  field, data, onChange,
}: {
  field: NodeKindField;
  data: WorkflowNodeData;
  onChange: (patch: Partial<WorkflowNodeData>) => void;
}) {
  const raw = data[field.key as keyof WorkflowNodeData] as string | number | undefined;
  const value = raw ?? field.default ?? '';

  if (field.type === 'select') {
    return (
      <Field label={field.label}>
        <select
          className="insp__select"
          value={String(value)}
          onChange={(e) => onChange({ [field.key]: e.target.value })}
        >
          {field.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </Field>
    );
  }

  if (field.type === 'number') {
    return (
      <Field label={field.label}>
        <input
          className="insp__input"
          type="number"
          value={Number(value)}
          onChange={(e) => onChange({ [field.key]: Number(e.target.value) })}
        />
      </Field>
    );
  }

  if (field.type === 'textarea') {
    return (
      <Field label={field.label}>
        <textarea
          className="insp__textarea"
          rows={field.rows ?? 4}
          value={String(value)}
          onChange={(e) => onChange({ [field.key]: e.target.value })}
        />
      </Field>
    );
  }

  return (
    <Field label={field.label}>
      <input
        className="insp__input"
        value={String(value)}
        onChange={(e) => onChange({ [field.key]: e.target.value })}
      />
    </Field>
  );
}

export function Inspector() {
  const { nodes, selectedNodeId, updateNodeData } = useWorkflow();
  const node = nodes.find((n) => n.id === selectedNodeId);

  if (!node) {
    return (
      <aside className="inspector inspector--empty">
        <p>Select a node to edit its properties</p>
      </aside>
    );
  }

  const d = node.data as WorkflowNodeData;
  const def = getNodeKindDef(d.nodeKind);
  const up = (patch: Partial<WorkflowNodeData>) => updateNodeData(node.id, patch);

  return (
    <aside className="inspector">
      <div className="insp__header">
        <span className="insp__badge" style={{ background: def.color }}>
          {def.label}
        </span>
        <code className="insp__id">{node.id}</code>
      </div>

      <Field label="Name">
        <input
          className="insp__input"
          value={d.label}
          onChange={(e) => up({ label: e.target.value })}
        />
      </Field>

      <Field label="Description">
        <textarea
          className="insp__textarea"
          rows={3}
          value={d.description ?? ''}
          onChange={(e) => up({ description: e.target.value })}
        />
      </Field>

      {def.inspectorFields?.map((field) => (
        <DynamicField key={field.key} field={field} data={d} onChange={up} />
      ))}

      <Field label="Input Fields (one per line)">
        <textarea
          className="insp__textarea"
          rows={3}
          value={(d.inputFields ?? []).join('\n')}
          onChange={(e) => up({ inputFields: e.target.value.split('\n').filter(Boolean) })}
        />
      </Field>

      <Field label="Output Fields (one per line)">
        <textarea
          className="insp__textarea"
          rows={3}
          value={(d.outputFields ?? []).join('\n')}
          onChange={(e) => up({ outputFields: e.target.value.split('\n').filter(Boolean) })}
        />
      </Field>
    </aside>
  );
}
