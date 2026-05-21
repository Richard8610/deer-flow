import { create } from 'zustand';
import {
  applyEdgeChanges, applyNodeChanges, addEdge,
  type Node, type Edge, type NodeChange, type EdgeChange,
  type Connection, type XYPosition,
} from '@xyflow/react';
import { type WorkflowNodeData, type NodeKind } from '../types';
import { getNodeKindDef, EXAMPLES } from '../workflow.config';

let _nodeCounter = 200;

interface WorkflowStore {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;

  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  selectNode: (id: string | null) => void;
  updateNodeData: (id: string, patch: Partial<WorkflowNodeData>) => void;
  addNode: (kind: NodeKind, position: XYPosition) => void;
  loadExample: (index: number) => void;
  importJSON: (json: string) => void;
  clearWorkflow: () => void;
  exportJSON: () => string;
}

/** Decode a ?workflow=<base64> query param into nodes/edges if present. */
function loadFromBase64Param(): { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } | null {
  try {
    const param = new URLSearchParams(window.location.search).get('workflow');
    if (!param || param.startsWith('http://') || param.startsWith('https://')) return null;
    const data = JSON.parse(atob(param)) as { nodes: Node<WorkflowNodeData>[]; edges: Edge[] };
    if (Array.isArray(data.nodes) && Array.isArray(data.edges)) return data;
  } catch { /* ignored */ }
  return null;
}

const _default = EXAMPLES[0]?.data ?? { nodes: [], edges: [] };
const _urlState = loadFromBase64Param();

export const useWorkflow = create<WorkflowStore>((set, get) => ({
  nodes: (_urlState ?? _default).nodes,
  edges: (_urlState ?? _default).edges,
  selectedNodeId: null,

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) as Node<WorkflowNodeData>[] })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

  onConnect: (connection) =>
    set((s) => ({
      edges: addEdge({ ...connection, type: 'dataflow', animated: true }, s.edges),
    })),

  selectNode: (id) => set({ selectedNodeId: id }),

  updateNodeData: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    })),

  addNode: (kind, position) => {
    const id = `node_${++_nodeCounter}`;
    const def = getNodeKindDef(kind);
    set((s) => ({
      nodes: [
        ...s.nodes,
        {
          id,
          type: def.rfType,
          position,
          data: {
            label: `New ${def.label}`,
            nodeKind: kind,
            description: '',
            inputFields: [],
            outputFields: [],
          },
        },
      ],
      selectedNodeId: id,
    }));
  },

  loadExample: (index) => {
    const ex = EXAMPLES[index]?.data ?? _default;
    set({ nodes: ex.nodes, edges: ex.edges, selectedNodeId: null });
  },

  importJSON: (json) => {
    try {
      const data = JSON.parse(json) as { nodes: Node<WorkflowNodeData>[]; edges: Edge[] };
      if (!Array.isArray(data.nodes) || !Array.isArray(data.edges))
        throw new Error('Expected { nodes: [...], edges: [...] }');
      set({ nodes: data.nodes, edges: data.edges, selectedNodeId: null });
    } catch (e) {
      alert(`Invalid workflow JSON: ${(e as Error).message}`);
    }
  },

  clearWorkflow: () => set({ nodes: [], edges: [], selectedNodeId: null }),

  exportJSON: () => {
    const { nodes, edges } = get();
    return JSON.stringify(
      {
        nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
        edges: edges.map(({ id, source, target, sourceHandle, targetHandle, label }) => ({
          id, source, target, sourceHandle, targetHandle, label,
        })),
      },
      null,
      2,
    );
  },
}));
