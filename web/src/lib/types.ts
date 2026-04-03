export type DocumentFormat = "markdown" | "text" | "code" | "html" | "json";

export interface Block {
  id: string;
  kind: string;
  start: number;
  end: number;
  text: string;
  level?: number;
  line_start?: number;
  line_end?: number;
}

export interface Anchor {
  block_id: string;
  start: number;
  end: number;
  doc_start: number;
  doc_end: number;
  quote: string;
  prefix?: string;
  suffix?: string;
  revision: number;
  resolved?: boolean;
  resolved_block_id?: string;
}

export interface Document {
  id: string;
  title: string;
  format: DocumentFormat;
  source: string;
  revision: number;
  blocks: Block[];
  created_at: string;
  updated_at: string;
  last_edited?: string;
}

export interface Comment {
  id: string;
  thread_id: string;
  author: string;
  body: string;
  created_at: string;
}

export interface Thread {
  id: string;
  document_id: string;
  anchor: Anchor;
  status: "open" | "resolved";
  author: string;
  comments: Comment[];
  created_at: string;
  updated_at: string;
}

export interface ActivityEvent {
  id: string;
  document_id: string;
  type: string;
  actor: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

export interface SelectionRange {
  start: number;
  end: number;
  text: string;
  rect?: {
    left: number;
    top: number;
    bottom: number;
  };
}

export interface Presence {
  session_id: string;
  name: string;
  color: string;
  selection?: {
    start: number;
    end: number;
  };
}

export interface LiveMessage {
  type: string;
  session_id?: string;
  document?: Document;
  revision?: number;
  op?: Operation;
  presence?: Presence[];
  artifact?: string;
  data?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
}

export interface Operation {
  position: number;
  delete_count: number;
  insert_text: string;
  base_revision: number;
  author?: string;
}
