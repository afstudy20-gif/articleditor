import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIError,
  configFromHeaders,
  resolveConfig,
  getDefaultProvider,
  isAIConfigured,
} from './provider';
import { getProviderMeta } from './registry';

// Pure/config-level tests only — nothing here performs network calls.

const ENV_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_EMBED_MODEL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'OPENAI_EMBED_MODEL',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_MODEL',
  'NVIDIA_API_KEY',
  'NVIDIA_MODEL',
] as const;

const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];

const clearEnv = (): void => {
  for (const k of ENV_KEYS) delete process.env[k];
};

after(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('resolveConfig', () => {
  beforeEach(clearEnv);

  it('falls back to registry defaults when no env or config is set', () => {
    const r = resolveConfig();
    assert.equal(r.gemini.apiKey, undefined);
    assert.equal(r.gemini.model, getProviderMeta('gemini').defaultModel);
    assert.equal(r.gemini.embedModel, 'text-embedding-004');
    assert.equal(r.anthropic.model, getProviderMeta('anthropic').defaultModel);
    assert.equal(r.openai.model, getProviderMeta('openai').defaultModel);
    assert.equal(r.openai.embedModel, 'text-embedding-3-small');
    assert.equal(r.deepseek.baseUrl, getProviderMeta('deepseek').baseUrl);
    assert.equal(r.nvidia.baseUrl, getProviderMeta('nvidia').baseUrl);
    assert.equal(r.preferred, undefined);
  });

  it('reads credentials and model overrides from process.env', () => {
    process.env.GEMINI_API_KEY = 'g-key';
    process.env.GEMINI_MODEL = 'gemini-custom';
    process.env.OPENAI_API_KEY = 'o-key';
    process.env.OPENAI_BASE_URL = 'https://proxy.example.com/v1';
    const r = resolveConfig();
    assert.equal(r.gemini.apiKey, 'g-key');
    assert.equal(r.gemini.model, 'gemini-custom');
    assert.equal(r.openai.apiKey, 'o-key');
    assert.equal(r.openai.baseUrl, 'https://proxy.example.com/v1');
  });

  it('prefers explicit config values over env vars', () => {
    process.env.ANTHROPIC_API_KEY = 'env-key';
    process.env.ANTHROPIC_MODEL = 'env-model';
    const r = resolveConfig({ anthropic: { apiKey: 'cfg-key', model: 'cfg-model' } });
    assert.equal(r.anthropic.apiKey, 'cfg-key');
    assert.equal(r.anthropic.model, 'cfg-model');
  });

  it('passes preferred through untouched', () => {
    assert.equal(resolveConfig({ preferred: 'openai' }).preferred, 'openai');
  });
});

describe('getDefaultProvider', () => {
  beforeEach(clearEnv);

  it('defaults to gemini when nothing is configured', () => {
    assert.equal(getDefaultProvider(), 'gemini');
  });

  it('follows priority order gemini > anthropic > openai > deepseek > nvidia', () => {
    process.env.NVIDIA_API_KEY = 'n';
    assert.equal(getDefaultProvider(), 'nvidia');
    process.env.DEEPSEEK_API_KEY = 'd';
    assert.equal(getDefaultProvider(), 'deepseek');
    process.env.OPENAI_API_KEY = 'o';
    assert.equal(getDefaultProvider(), 'openai');
    process.env.ANTHROPIC_API_KEY = 'a';
    assert.equal(getDefaultProvider(), 'anthropic');
    process.env.GEMINI_API_KEY = 'g';
    assert.equal(getDefaultProvider(), 'gemini');
  });

  it('honors preferred provider only when it has a key', () => {
    process.env.GEMINI_API_KEY = 'g';
    process.env.OPENAI_API_KEY = 'o';
    assert.equal(getDefaultProvider({ preferred: 'openai' }), 'openai');
    // Preferred without a key falls back to priority order.
    delete process.env.OPENAI_API_KEY;
    assert.equal(getDefaultProvider({ preferred: 'openai' }), 'gemini');
  });
});

describe('isAIConfigured', () => {
  beforeEach(clearEnv);

  it('is false with no keys anywhere', () => {
    assert.equal(isAIConfigured(), false);
  });

  it('is true when any provider has a key (env or config)', () => {
    process.env.DEEPSEEK_API_KEY = 'd';
    assert.equal(isAIConfigured(), true);
    delete process.env.DEEPSEEK_API_KEY;
    assert.equal(isAIConfigured({ anthropic: { apiKey: 'a' } }), true);
  });
});

describe('configFromHeaders', () => {
  it('ignores browser-supplied key headers entirely', () => {
    const headers = new Headers({
      'x-ai-gemini-key': 'leaked-key',
      'x-ai-provider': 'openai',
    });
    assert.deepEqual(configFromHeaders(headers), {});
  });
});

describe('AIError', () => {
  it('embeds provider and stage in the message and sets the name', () => {
    const err = new AIError('openai', 'embed', 'dimension mismatch');
    assert.equal(err.name, 'AIError');
    assert.equal(err.provider, 'openai');
    assert.equal(err.stage, 'embed');
    assert.equal(err.message, '[openai/embed] dimension mismatch');
    assert.ok(err instanceof Error);
  });
});
