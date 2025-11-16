export interface CactusDownloadParams {
  model?: string;
  onProgress?: (progress: number) => void;
}

export interface CactusInitParams {
  model?: string;
  contextSize?: number;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Options {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface Tool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: {
      [key: string]: {
        type: string;
        description: string;
      };
    };
    required: string[];
  };
}

export interface CactusCompletionParams {
  messages: Message[];
  options?: Options;
  tools?: Tool[];
  onToken?: (token: string) => void;
  model?: string;
  contextSize?: number;
}

export interface CactusCompletionResult {
  success: boolean;
  response: string;
  functionCalls?: { name: string; arguments: { [key: string]: any } }[];
  timeToFirstTokenMs: number;
  totalTimeMs: number;
  tokensPerSecond: number;
  prefillTokens: number;
  decodeTokens: number;
  totalTokens: number;
}

export interface CactusEmbeddingParams {
  text: string;
  model?: string;
}

export interface CactusEmbeddingResult {
  embedding: number[];
}

export interface CactusGetModelsParams {
  forceRefresh?: boolean;
}

export interface CactusModel {
  // API
  name: string;
  slug: string;
  quantization: number;
  sizeMb: number;
  downloadUrl: string;
  supportsToolCalling: boolean;
  supportsVision: boolean;
  createdAt: Date;

  // Local
  isDownloaded: boolean;
}
