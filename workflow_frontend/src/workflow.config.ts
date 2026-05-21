/**
 * workflow.config.ts — THE file to edit when adapting this template to a new project.
 *
 * Change APP, NODE_KINDS, and EXAMPLES.  Everything else (canvas, inspector,
 * sidebar, edges, store) derives from these definitions automatically.
 */

import type { Node, Edge } from '@xyflow/react';
import { competitiveAnalysisExample, genericWorkflowExample } from './data/examples';
import type { WorkflowNodeData } from './types';

// ── App branding ───────────────────────────────────────────────────────────

export const APP = {
  title: 'Workflow Builder',
  logo: '⚡',
  subtitle: 'Workflow Visualizer',
  /** Set to a URL string to show a "GitHub ↗" link in the topbar. */
  githubUrl: 'https://github.com/bytedance/deer-flow',
};

// ── Node kind system ───────────────────────────────────────────────────────

/** A single inspector control rendered for a specific node kind. */
export interface NodeKindField {
  /** Key in WorkflowNodeData to read/write (scalar fields only). */
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select';
  rows?: number;
  options?: string[];
  default?: string | number;
}

export interface NodeKindDef {
  kind: string;
  color: string;
  icon: string;
  label: string;
  /**
   * React Flow node component to use:
   *   'io'        — no target handle (source-only) or no source handle (target-only)
   *   'process'   — target on left, source on right
   *   'condition' — target on left, two sources (true/false) on right
   */
  rfType: 'io' | 'process' | 'condition';
  /**
   * Which handles to render for 'io' nodes.
   * 'source-only' → entry node (no incoming edges)
   * 'target-only' → terminal node (no outgoing edges)
   * Ignored for 'process' and 'condition'.
   */
  handles?: 'source-only' | 'target-only';
  /** Short description shown in the sidebar palette. */
  desc: string;
  /** Extra fields rendered in the Inspector panel for this node kind. */
  inspectorFields?: NodeKindField[];
}

export const NODE_KINDS: NodeKindDef[] = [
  {
    kind: 'start', color: '#7C3AED', icon: '▶', label: 'Start',
    rfType: 'io', handles: 'source-only',
    desc: 'Entry point for user input',
  },
  {
    kind: 'end', color: '#059669', icon: '⏹', label: 'End',
    rfType: 'io', handles: 'target-only',
    desc: 'Final output of the workflow',
  },
  {
    kind: 'llm', color: '#2563EB', icon: '🧠', label: 'LLM',
    rfType: 'process',
    desc: 'Call a language model with a prompt',
    inspectorFields: [
      { key: 'model',  label: 'Model',          type: 'text',     default: 'default' },
      { key: 'prompt', label: 'Prompt Template', type: 'textarea', rows: 7 },
    ],
  },
  {
    kind: 'subagent', color: '#D97706', icon: '🤖', label: 'Subagent',
    rfType: 'process',
    desc: 'Delegate a task to a subagent',
    inspectorFields: [
      { key: 'subagentType',   label: 'Subagent Type', type: 'select', options: ['general-purpose', 'bash', 'ca-researcher'], default: 'general-purpose' },
      { key: 'timeoutSeconds', label: 'Timeout (sec)', type: 'number', default: 300 },
    ],
  },
  {
    kind: 'tool', color: '#0891B2', icon: '🔧', label: 'Tool',
    rfType: 'process',
    desc: 'Execute a tool or function',
    inspectorFields: [
      { key: 'toolName', label: 'Tool Name', type: 'text' },
    ],
  },
  {
    kind: 'condition', color: '#DC2626', icon: '◆', label: 'Condition',
    rfType: 'condition',
    desc: 'Branch on a runtime condition',
  },
];

const _fallback: Omit<NodeKindDef, 'kind'> = {
  color: '#64748B', icon: '❓', label: 'Node', rfType: 'process', desc: '',
};

/** Returns the NodeKindDef for `kind`, or a generic fallback for unknown kinds. */
export function getNodeKindDef(kind: string): NodeKindDef {
  return NODE_KINDS.find((d) => d.kind === kind) ?? { ..._fallback, kind, label: kind };
}

// ── Built-in example workflows ─────────────────────────────────────────────

export interface ExampleWorkflow {
  label: string;
  icon: string;
  data: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] };
}

/**
 * Add, remove, or reorder entries here to change the Examples section.
 * Each entry needs `label`, `icon`, and a `data` object with `nodes` + `edges`
 * in React Flow format.
 */
export const EXAMPLES: ExampleWorkflow[] = [
  { label: 'Competitive Analysis', icon: '🏢', data: competitiveAnalysisExample },
  { label: 'Generic Workflow',     icon: '⚙️', data: genericWorkflowExample },
];
