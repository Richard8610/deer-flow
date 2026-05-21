import { useCallback } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  ReactFlowProvider, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflow } from '../store/useWorkflow';
import { nodeTypes } from '../nodes';
import { edgeTypes } from '../edges';
import { type NodeKind } from '../types';

function FlowCanvas() {
  const { screenToFlowPosition } = useReactFlow();
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    selectNode, addNode,
  } = useWorkflow();

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData('nodeKind') as NodeKind;
      if (!kind) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode(kind, position);
    },
    [screenToFlowPosition, addNode],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, node) => selectNode(node.id)}
      onPaneClick={() => selectNode(null)}
      onDrop={onDrop}
      onDragOver={onDragOver}
      fitView
      deleteKeyCode="Delete"
      defaultEdgeOptions={{ type: 'dataflow', animated: true }}
    >
      <Background gap={20} color="#CBD5E1" />
      <Controls />
      <MiniMap nodeStrokeWidth={3} pannable zoomable />
    </ReactFlow>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}
