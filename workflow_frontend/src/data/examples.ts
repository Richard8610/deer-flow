import type { Node, Edge } from '@xyflow/react';
import type { WorkflowNodeData } from '../types';

// ── Competitive Analysis workflow ──────────────────────────────────────────

const caNodes: Node<WorkflowNodeData>[] = [
  {
    id: 'start',
    type: 'io',
    position: { x: 40, y: 220 },
    data: { label: 'User Input', nodeKind: 'start', description: 'Company name from user message', outputFields: ['messages'] },
  },
  {
    id: 'extract_company',
    type: 'process',
    position: { x: 260, y: 220 },
    data: { label: 'Extract Company', nodeKind: 'tool', toolName: 'company_extractor', description: 'Parse company name from message text', inputFields: ['messages'], outputFields: ['task_description'] },
  },
  {
    id: 'company_research',
    type: 'process',
    position: { x: 520, y: 60 },
    data: { label: 'Company Research', nodeKind: 'subagent', subagentType: 'ca-researcher', timeoutSeconds: 300, description: 'Profile, products, funding & recent news', inputFields: ['task_description'], outputFields: ['execution_results[company]'] },
  },
  {
    id: 'competitor_research',
    type: 'process',
    position: { x: 520, y: 220 },
    data: { label: 'Competitor Research', nodeKind: 'subagent', subagentType: 'ca-researcher', timeoutSeconds: 300, description: 'Top 3–5 competitors with comparison table', inputFields: ['task_description'], outputFields: ['execution_results[competitors]'] },
  },
  {
    id: 'market_research',
    type: 'process',
    position: { x: 520, y: 380 },
    data: { label: 'Market Research', nodeKind: 'subagent', subagentType: 'ca-researcher', timeoutSeconds: 300, description: 'Market size, trends, growth drivers & risks', inputFields: ['task_description'], outputFields: ['execution_results[market]'] },
  },
  {
    id: 'generate_report',
    type: 'process',
    position: { x: 820, y: 220 },
    data: { label: 'Generate Report', nodeKind: 'llm', model: 'default', description: 'Synthesise research into Markdown report', prompt: 'COMPETITIVE_REPORT_PROMPT_TEMPLATE', inputFields: ['task_description', 'execution_results'], outputFields: ['final_output'] },
  },
  {
    id: 'save_report',
    type: 'process',
    position: { x: 1080, y: 220 },
    data: { label: 'Save Report', nodeKind: 'tool', toolName: 'write_file', description: 'Write to disk and append file path to output', inputFields: ['final_output', 'task_description'], outputFields: ['final_output'] },
  },
  {
    id: 'end',
    type: 'io',
    position: { x: 1330, y: 220 },
    data: { label: 'Report Output', nodeKind: 'end', description: 'Competitive analysis Markdown report', inputFields: ['final_output'] },
  },
];

const caEdges: Edge[] = [
  { id: 'e-start-extract',      source: 'start',              target: 'extract_company',     type: 'dataflow', animated: true, label: 'messages' },
  { id: 'e-extract-company',    source: 'extract_company',     target: 'company_research',    type: 'dataflow', animated: true, label: 'task_description' },
  { id: 'e-extract-competitor', source: 'extract_company',     target: 'competitor_research', type: 'dataflow', animated: true, label: 'task_description' },
  { id: 'e-extract-market',     source: 'extract_company',     target: 'market_research',     type: 'dataflow', animated: true, label: 'task_description' },
  { id: 'e-company-report',     source: 'company_research',    target: 'generate_report',     type: 'dataflow', animated: true, label: 'execution_results' },
  { id: 'e-competitor-report',  source: 'competitor_research', target: 'generate_report',     type: 'dataflow', animated: true, label: 'execution_results' },
  { id: 'e-market-report',      source: 'market_research',     target: 'generate_report',     type: 'dataflow', animated: true, label: 'execution_results' },
  { id: 'e-report-save',        source: 'generate_report',     target: 'save_report',         type: 'dataflow', animated: true, label: 'final_output' },
  { id: 'e-save-end',           source: 'save_report',         target: 'end',                 type: 'dataflow', animated: true, label: 'final_output' },
];

export const competitiveAnalysisExample = { nodes: caNodes, edges: caEdges };

// ── Generic Workflow (project_agent) ──────────────────────────────────────

const gwNodes: Node<WorkflowNodeData>[] = [
  {
    id: 'start',
    type: 'io',
    position: { x: 40, y: 280 },
    data: { label: 'User Input', nodeKind: 'start', description: 'User task description', outputFields: ['messages'] },
  },
  {
    id: 'parse_input',
    type: 'process',
    position: { x: 250, y: 280 },
    data: { label: 'Parse Input', nodeKind: 'tool', description: 'Extract task_description from latest human message', inputFields: ['messages'], outputFields: ['task_description'] },
  },
  {
    id: 'decompose',
    type: 'process',
    position: { x: 480, y: 280 },
    data: { label: 'Decompose', nodeKind: 'llm', description: 'Break task into 2–5 independent subtasks', prompt: 'DECOMPOSE_PROMPT', inputFields: ['task_description'], outputFields: ['subtasks'] },
  },
  {
    id: 'search_skills',
    type: 'process',
    position: { x: 710, y: 280 },
    data: { label: 'Search Skills', nodeKind: 'tool', toolName: 'get_or_new_skill_storage', description: 'List all enabled skills for context', inputFields: ['subtasks'], outputFields: ['available_skills'] },
  },
  {
    id: 'plan_workflow',
    type: 'process',
    position: { x: 940, y: 280 },
    data: { label: 'Plan Workflow', nodeKind: 'llm', description: 'Assign subtasks to subagents & scaffold project dir', prompt: 'PLAN_PROMPT', inputFields: ['task_description', 'subtasks', 'available_skills'], outputFields: ['subagent_assignments', 'project_dir'] },
  },
  {
    id: 'subtask_1',
    type: 'process',
    position: { x: 1200, y: 140 },
    data: { label: 'execute_subtask (1)', nodeKind: 'subagent', subagentType: 'general-purpose', description: 'Runs in parallel via Send — one node per assignment', inputFields: ['prompt', 'subagent_type'], outputFields: ['execution_results[+]'] },
  },
  {
    id: 'subtask_2',
    type: 'process',
    position: { x: 1200, y: 300 },
    data: { label: 'execute_subtask (2)', nodeKind: 'subagent', subagentType: 'general-purpose', description: 'Runs in parallel via Send — one node per assignment', inputFields: ['prompt', 'subagent_type'], outputFields: ['execution_results[+]'] },
  },
  {
    id: 'subtask_n',
    type: 'process',
    position: { x: 1200, y: 460 },
    data: { label: 'execute_subtask (N)', nodeKind: 'subagent', subagentType: 'general-purpose', description: 'Runs in parallel via Send — one node per assignment', inputFields: ['prompt', 'subagent_type'], outputFields: ['execution_results[+]'] },
  },
  {
    id: 'evaluate',
    type: 'process',
    position: { x: 1470, y: 300 },
    data: { label: 'Evaluate', nodeKind: 'llm', description: 'Score each result; set all_passed flag', prompt: 'EVALUATE_PROMPT', inputFields: ['execution_results', 'task_description'], outputFields: ['evaluation_results', 'all_passed'] },
  },
  {
    id: 'retry_check',
    type: 'condition',
    position: { x: 1700, y: 300 },
    data: { label: 'Retry?', nodeKind: 'condition', description: 'all_passed=False and retry_count < 2 → retry failed tasks', inputFields: ['all_passed', 'retry_count'], outputFields: ['→ prepare_retry', '→ synthesize'] },
  },
  {
    id: 'prepare_retry',
    type: 'process',
    position: { x: 1700, y: 480 },
    data: { label: 'Prepare Retry', nodeKind: 'tool', description: 'Filter assignments to failed subtasks; increment retry_count', inputFields: ['evaluation_results', 'subagent_assignments'], outputFields: ['subagent_assignments', 'retry_count'] },
  },
  {
    id: 'synthesize',
    type: 'process',
    position: { x: 1940, y: 220 },
    data: { label: 'Synthesize', nodeKind: 'llm', description: 'Write final response covering results and next steps', prompt: 'SYNTHESIZE_PROMPT', inputFields: ['execution_results', 'evaluation_results', 'task_description'], outputFields: ['final_output'] },
  },
  {
    id: 'end',
    type: 'io',
    position: { x: 2180, y: 220 },
    data: { label: 'Output', nodeKind: 'end', description: 'Final synthesised response', inputFields: ['final_output'] },
  },
];

const gwEdges: Edge[] = [
  { id: 'g1',  source: 'start',         target: 'parse_input',   type: 'dataflow', animated: true, label: 'messages' },
  { id: 'g2',  source: 'parse_input',   target: 'decompose',     type: 'dataflow', animated: true, label: 'task_description' },
  { id: 'g3',  source: 'decompose',     target: 'search_skills', type: 'dataflow', animated: true, label: 'subtasks' },
  { id: 'g4',  source: 'search_skills', target: 'plan_workflow', type: 'dataflow', animated: true, label: 'available_skills' },
  { id: 'g5',  source: 'plan_workflow', target: 'subtask_1',     type: 'dataflow', animated: true, label: 'Send ×N' },
  { id: 'g6',  source: 'plan_workflow', target: 'subtask_2',     type: 'dataflow', animated: true, label: 'Send ×N' },
  { id: 'g7',  source: 'plan_workflow', target: 'subtask_n',     type: 'dataflow', animated: true, label: 'Send ×N' },
  { id: 'g8',  source: 'subtask_1',     target: 'evaluate',      type: 'dataflow', animated: true, label: 'execution_results' },
  { id: 'g9',  source: 'subtask_2',     target: 'evaluate',      type: 'dataflow', animated: true, label: 'execution_results' },
  { id: 'g10', source: 'subtask_n',     target: 'evaluate',      type: 'dataflow', animated: true, label: 'execution_results' },
  { id: 'g11', source: 'evaluate',      target: 'retry_check',   type: 'dataflow', animated: true, label: 'evaluation_results' },
  { id: 'g12', source: 'retry_check',   target: 'prepare_retry', type: 'dataflow', animated: true, label: 'false', sourceHandle: 'false' },
  { id: 'g13', source: 'retry_check',   target: 'synthesize',    type: 'dataflow', animated: true, label: 'true',  sourceHandle: 'true' },
  { id: 'g14', source: 'prepare_retry', target: 'subtask_1',     type: 'dataflow', animated: true, label: 'Send ×M' },
  { id: 'g15', source: 'synthesize',    target: 'end',           type: 'dataflow', animated: true, label: 'final_output' },
];

export const genericWorkflowExample = { nodes: gwNodes, edges: gwEdges };
