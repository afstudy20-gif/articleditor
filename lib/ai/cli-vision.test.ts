import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCliVisionBackend,
  extFromMime,
  buildCodexArgs,
  buildGeminiArgs,
  CliVisionError,
} from './cli-vision';

describe('parseCliVisionBackend', () => {
  it('accepts exactly "codex" or "gemini" (case-insensitive)', () => {
    assert.equal(parseCliVisionBackend('codex'), 'codex');
    assert.equal(parseCliVisionBackend('GEMINI'), 'gemini');
    assert.equal(parseCliVisionBackend('  gemini  '), 'gemini');
  });

  it('rejects anything else — explicit opt-in only, no auto/true/1', () => {
    assert.equal(parseCliVisionBackend(undefined), null);
    assert.equal(parseCliVisionBackend(''), null);
    assert.equal(parseCliVisionBackend('auto'), null);
    assert.equal(parseCliVisionBackend('true'), null);
    assert.equal(parseCliVisionBackend('1'), null);
    assert.equal(parseCliVisionBackend('anthropic'), null);
    assert.equal(parseCliVisionBackend('codex; rm -rf /'), null);
  });
});

describe('extFromMime', () => {
  it('maps known image mime types', () => {
    assert.equal(extFromMime('image/png'), 'png');
    assert.equal(extFromMime('image/jpeg'), 'jpg');
    assert.equal(extFromMime('image/webp'), 'webp');
    assert.equal(extFromMime('image/gif'), 'gif');
  });

  it('defaults to png for unknown types', () => {
    assert.equal(extFromMime('image/bmp'), 'png');
    assert.equal(extFromMime(''), 'png');
  });
});

describe('buildCodexArgs', () => {
  it('produces a fixed argv array with the image and output-file flags', () => {
    const args = buildCodexArgs({
      imagePath: '/tmp/x/image.png',
      outPath: '/tmp/x/out.txt',
      prompt: 'transcribe the table',
    });
    assert.deepEqual(args, [
      'exec',
      '--skip-git-repo-check',
      '-s', 'read-only',
      '-i', '/tmp/x/image.png',
      '--output-last-message', '/tmp/x/out.txt',
      'transcribe the table',
    ]);
  });

  it('never interpolates the prompt into a shell string (argv stays an array)', () => {
    const args = buildCodexArgs({
      imagePath: '/tmp/x/image.png',
      outPath: '/tmp/x/out.txt',
      prompt: '"; rm -rf / #',
    });
    // The dangerous prompt is exactly one argv element — execFile never
    // passes it through a shell, so it cannot break out of the command.
    assert.equal(args.filter((a) => a.includes('rm -rf')).length, 1);
    assert.equal(args[args.length - 1], '"; rm -rf / #');
  });
});

describe('buildGeminiArgs', () => {
  it('attaches the image via @path prefix in the prompt', () => {
    const args = buildGeminiArgs({ imagePath: '/tmp/x/image.png', prompt: 'transcribe' });
    assert.deepEqual(args, ['-o', 'text', '-p', '@/tmp/x/image.png\ntranscribe']);
  });
});

describe('CliVisionError', () => {
  it('tags the backend and prefixes the message', () => {
    const err = new CliVisionError('codex', 'boom');
    assert.equal(err.backend, 'codex');
    assert.equal(err.message, '[cli:codex] boom');
    assert.equal(err.name, 'CliVisionError');
    assert.ok(err instanceof Error);
  });
});
