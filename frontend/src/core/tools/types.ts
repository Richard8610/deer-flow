export interface Tool {
  name: string;
  group: string;
  use: string;
  extras: Record<string, unknown>;
}

export interface ToolGroup {
  name: string;
}

export interface CreateToolRequest {
  name: string;
  group: string;
  use: string;
  extras: Record<string, unknown>;
}

export interface UpdateToolRequest {
  group?: string;
  use?: string;
  extras?: Record<string, unknown>;
}