// RAG layer error types.
//
// `RagEmbedError` / `RagChatError` wrap transport, parsing and upstream
// failures surfaced by the browser clients; the optional `cause` keeps the
// original error for logging without leaking provider detail to the UI.
// `RagConfigError` signals a missing server key (OpenAI / Anthropic) — the
// route handlers map it to a clear 500 before any provider call is attempted.

export class RagEmbedError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'RagEmbedError';
  }
}

export class RagChatError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'RagChatError';
  }
}

export class RagConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RagConfigError';
  }
}
