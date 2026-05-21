import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getNodeKindDef, type NodeKindDef } from '../workflow.config';
import type { WorkflowNodeData } from '../types';

// ── Shared shell ────────────────────────────────────────────────────────────

function NodeShell({ data, def, children }: { data: WorkflowNodeData; def: NodeKindDef; children?: React.ReactNode }) {
  return (
    <div className="wf-node">
      <div className="wf-node__header" style={{ background: def.color }}>
        <span className="wf-node__icon">{def.icon}</span>
        <span className="wf-node__type">{def.label}</span>
      </div>
      <div className="wf-node__body">
        <p className="wf-node__label">{data.label}</p>
        {data.description && <p className="wf-node__desc">{data.description}</p>}
        {children}
        {(data.inputFields?.length || data.outputFields?.length) ? (
          <div className="wf-node__fields">
            {data.inputFields?.length ? (
              <div className="wf-node__field-row">
                <span className="wf-node__field-dir">In</span>
                {data.inputFields.map((f) => (
                  <span key={f} className="wf-node__chip wf-node__chip--in">{f}</span>
                ))}
              </div>
            ) : null}
            {data.outputFields?.length ? (
              <div className="wf-node__field-row">
                <span className="wf-node__field-dir">Out</span>
                {data.outputFields.map((f) => (
                  <span key={f} className="wf-node__chip wf-node__chip--out">{f}</span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Node components ─────────────────────────────────────────────────────────

/** Entry / terminal nodes — handle layout driven by NodeKindDef.handles */
export function IONode({ data }: NodeProps) {
  const d = data as WorkflowNodeData;
  const def = getNodeKindDef(d.nodeKind);
  return (
    <>
      {def.handles !== 'source-only' && <Handle type="target" position={Position.Left} />}
      <NodeShell data={d} def={def} />
      {def.handles !== 'target-only' && <Handle type="source" position={Position.Right} />}
    </>
  );
}

/** Standard processing nodes — target on left, source on right */
export function ProcessNode({ data }: NodeProps) {
  const d = data as WorkflowNodeData;
  const def = getNodeKindDef(d.nodeKind);
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <NodeShell data={d} def={def} />
      <Handle type="source" position={Position.Right} />
    </>
  );
}

/** Branch nodes — one target, two sources (true / false) */
export function ConditionNode({ data }: NodeProps) {
  const d = data as WorkflowNodeData;
  const def = getNodeKindDef(d.nodeKind);
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <NodeShell data={d} def={def}>
        <div className="wf-node__branches">
          <span style={{ color: '#059669' }}>↗ true</span>
          <span style={{ color: '#DC2626' }}>↘ false</span>
        </div>
      </NodeShell>
      <Handle type="source" position={Position.Right} id="true"  style={{ top: '38%' }} />
      <Handle type="source" position={Position.Right} id="false" style={{ top: '62%' }} />
    </>
  );
}

export const nodeTypes = {
  io:        IONode,
  process:   ProcessNode,
  condition: ConditionNode,
};
