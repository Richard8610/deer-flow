/** Open-ended — define your kinds in workflow.config.ts */
export type NodeKind = string;

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  nodeKind: NodeKind;
  description?: string;
  // Common scalar fields referenced by built-in inspectorFields
  model?: string;
  prompt?: string;
  subagentType?: string;
  timeoutSeconds?: number;
  toolName?: string;
  // Data-flow annotations shown as chips on nodes
  inputFields?: string[];
  outputFields?: string[];
}
