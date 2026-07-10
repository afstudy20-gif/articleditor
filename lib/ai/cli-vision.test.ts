import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCliVisionBackend,
  extFromMime,
  buildClaudeArgs,
  CliVisionError,
} from './cli-vision';

describe('parseCliVisionBackend', () => {
  it('accepts exactly "claude" (case-insensitive, trimmed)', () => {
    assert.equal(parseCliVisionBackend('claude'), 'claude');
    assert.equal(parseCliVisionBackend('CLAUDE'), 'claude');
    assert.equal(parseCliVisionBackend('  claude  '), 'claude');
  });

  it('rejects anything else — explicit opt-in only, no auto/true/1/gemini/codex', () => {
    assert.equal(parseCliVisionBackend(undefined), null);
    assert.equal(parseCliVisionBackend(''), null);
    assert.equal(parseCliVisionBackend('auto'), null);
    assert.equal(parseCliVisionBackend('true'), null);
    assert.equal(parseCliVisionBackend('1'), null);
    assert.equal(parseCliVisionBackend('gemini'), null);
    assert.equal(parseCliVisionBackend('codex'), null);
    assert.equal(parseCliVisionBackend('claude; rm -rf /'), null);
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

describe('buildClaudeArgs', () => {
  it('produces headless print-mode argv with the image path folded into the prompt', () => {
    const args = buildClaudeArgs({ imagePath: '/tmp/x/image.png', prompt: 'transcribe the table' });
    assert.deepEqual(args, [
      '-p', '--output-format', 'text', '--model', 'sonnet',
      'Read the image file at /tmp/x/image.png. transcribe the table',
    ]);
  });

  it('never interpolates the prompt into a shell string (argv stays an array)', () => {
    const args = buildClaudeArgs({ imagePath: '/tmp/x/image.png', prompt: '"; rm -rf / #' });
    // The dangerous prompt is folded into exactly one argv element — execFile
    // never passes it through a shell, so it cannot break out of the command.
    const last = args[args.length - 1];
    assert.ok(last.includes('rm -rf'));
    assert.equal(args.filter((a) => a.includes('rm -rf')).length, 1);
  });
});

describe('CliVisionError', () => {
  it('tags the backend and prefixes the message', () => {
    const err = new CliVisionError('claude', 'boom');
    assert.equal(err.backend, 'claude');
    assert.equal(err.message, '[cli:claude] boom');
    assert.equal(err.name, 'CliVisionError');
    assert.ok(err instanceof Error);
  });
});
