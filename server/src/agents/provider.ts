export interface LLMRequest {
  system: string;
  user: string;
  context: Record<string, unknown>;
}

export interface LLMProvider {
  generateStructured<T>(_request: LLMRequest, _schema: (_value: unknown) => T): Promise<T>;
}

export class NoopLLMProvider implements LLMProvider {
  async generateStructured<T>(_request: LLMRequest, _schema: (_value: unknown) => T): Promise<T> {
    throw new Error('No LLM provider is configured. Deterministic routing remains active.');
  }
}
