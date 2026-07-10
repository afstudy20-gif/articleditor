import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCliVisionBackend,
  extFromMime,
  buildClaudeArgs,
  buildZcodeArgs,
  extractLastJsonObject,
  CliVisionError,
} from './cli-vision';

describe('parseCliVisionBackend', () => {
  it('accepts claude, zcode, kimi (case-insensitive, trimmed)', () => {
    assert.equal(parseCliVisionBackend('claude'), 'claude');
    assert.equal(parseCliVisionBackend('ZCODE'), 'zcode');
    assert.equal(parseCliVisionBackend('  kimi  '), 'kimi');
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
    const last = args[args.length - 1];
    assert.ok(last.includes('rm -rf'));
    assert.equal(args.filter((a) => a.includes('rm -rf')).length, 1);
  });
});

describe('buildZcodeArgs', () => {
  it('attaches the image via the native --attach flag and requests JSON output', () => {
    const args = buildZcodeArgs({ imagePath: '/tmp/x/image.png', prompt: 'transcribe' });
    assert.deepEqual(args, [
      '--prompt', 'transcribe', '--attach', '/tmp/x/image.png', '--mode', 'yolo', '--json',
    ]);
  });
});

describe('extractLastJsonObject', () => {
  it('returns a bare JSON object unchanged (trimmed)', () => {
    const json = '{"rows":[["a","b"]],"hasHeader":true}';
    assert.equal(extractLastJsonObject(`  ${json}  `), json);
  });

  it('pulls the trailing JSON object out of a noisy tool-call transcript', () => {
    const noisy =
      '**Tool: analyze_image**\n' +
      '**Input:**\n```json\n{"imageSource":"https://example.com/x.png","prompt":"describe"}\n```\n' +
      '**Output:**\n' +
      '{"rows":[["Group","N"],["Diabetic","32"]],"hasHeader":true}';
    assert.equal(
      extractLastJsonObject(noisy),
      '{"rows":[["Group","N"],["Diabetic","32"]],"hasHeader":true}',
    );
  });

  it('handles nested braces inside the trailing object', () => {
    const text = 'preamble {"a":{"nested":1},"b":[{"c":2}]}';
    assert.equal(extractLastJsonObject(text), '{"a":{"nested":1},"b":[{"c":2}]}');
  });

  it('falls back to the trimmed input when no valid JSON object is present', () => {
    assert.equal(extractLastJsonObject('  no json here  '), 'no json here');
    assert.equal(extractLastJsonObject('{unterminated'), '{unterminated');
  });
});

describe('CliVisionError', () => {
  it('tags the backend and prefixes the message', () => {
    const err = new CliVisionError('zcode', 'boom');
    assert.equal(err.backend, 'zcode');
    assert.equal(err.message, '[cli:zcode] boom');
    assert.equal(err.name, 'CliVisionError');
    assert.ok(err instanceof Error);
  });
});
