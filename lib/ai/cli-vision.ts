/**
 * Local-CLI vision fallback for the image→table tool.
 *
 * When no server API key is configured for any vision provider, the
 * image-table route can shell out to a CLI coding agent already
 * authenticated on the SAME machine running the Next.js server — no API key,
 * no billing, no extra login. This mirrors the keyless CLI pattern used by
 * the reference checker in the sibling `paper` project
 * (backend/services/ai_providers.py: `_generate_claude_cli` /
 * `_generate_zcode` / `_generate_kimi`), including its env-var override
 * conventions (KIMI_ACP_RUNNER, KIMI_CLI_BIN, ZCODE_CLI_BIN, CLAUDE_CLI_BIN).
 *
 * Explicit opt-in only via AI_LOCAL_CLI_VISION=claude|zcode|kimi — never
 * auto-detected, and a no-op in a normal Docker/Coolify deploy (the image
 * has none of these binaries or sessions).
 *
 * All three backends were verified against real installs with a synthetic
 * table image. Reliability differs, so the route uses the SHORT, condensed
 * prompt from lib/tables/image-table.ts#buildCliImageTablePrompt for all of
 * them (see below):
 *  - claude — RECOMMENDED. `claude -p` has no image flag; the prompt tells
 *    it to read the local file and it uses its own Read tool. Cleanest
 *    output (pure JSON), correct on every run tested (short and long prompt).
 *  - kimi   — RECOMMENDED. No direct CLI vision flag; routed through the ACP
 *    wrapper (`~/.kimi-code/acp-run.mjs`) referencing the local path in the
 *    prompt, same idea as claude — kimi picks a `ReadMediaFile` tool call on
 *    its own. Also correct on every run tested.
 *  - zcode  — OPTIONAL, LESS RELIABLE. Native `--attach <path>` flag, but its
 *    built-in `analyze_image` tool generates its OWN internal sub-prompt for
 *    the vision call rather than using ours directly, and with the original
 *    long/itemized instructions it sometimes derailed entirely (once literally
 *    describing an unrelated "website layout"). The short prompt measurably
 *    improved this (about 2/3 correct in testing vs 0/2 with the long one)
 *    but did not fully eliminate it — treat zcode results with more
 *    suspicion than claude/kimi. Output is also wrapped in a noisy tool-call
 *    trace (echoes the request/response of `analyze_image`); the real answer
 *    is the last top-level JSON object in the text, which
 *    `extractLastJsonObject` pulls out. Also uploads the image to a
 *    short-lived signed Z.ai storage URL as part of that tool call.
 *
 * (Gemini CLI and `codex exec -i` were tried first and dropped entirely:
 * Gemini's free tier here is deauthorized server-side, and codex
 * intermittently returned "Unable to process this image" for identical
 * repeated input — a similar flakiness class to zcode's, but with no
 * prompt-length mitigation found.)
 *
 * Security: fixed argv arrays via execFile (no shell string), image written
 * to a private temp directory, hard timeout, guaranteed cleanup, capped
 * output.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir, tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

export type CliVisionBackend = 'claude' | 'zcode' | 'kimi';

const BACKENDS: readonly CliVisionBackend[] = ['claude', 'zcode', 'kimi'];

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** File extension for a decoded image mime type; defaults to png. */
export function extFromMime(mimeType: string): string {
  return EXT_BY_MIME[mimeType] ?? 'png';
}

/**
 * Reads AI_LOCAL_CLI_VISION and returns a recognized backend, or null.
 * Explicit opt-in only — any other value (including "auto"/"true"/"1") is
 * rejected so a stray/mistyped env var never silently shells out.
 */
export function parseCliVisionBackend(value: string | undefined): CliVisionBackend | null {
  const v = value?.trim().toLowerCase();
  return (BACKENDS as readonly string[]).includes(v ?? '') ? (v as CliVisionBackend) : null;
}

export function isCliVisionEnabled(): CliVisionBackend | null {
  return parseCliVisionBackend(process.env.AI_LOCAL_CLI_VISION);
}

/**
 * claude CLI argv, matching the paper project's `_generate_claude_cli`:
 * headless print mode, plain-text output, Sonnet by default. The CLI has no
 * dedicated image-attach flag, so the prompt explicitly tells it to read the
 * local file — Claude Code's own Read tool handles images.
 */
export function buildClaudeArgs(opts: { imagePath: string; prompt: string }): string[] {
  return ['-p', '--output-format', 'text', '--model', 'sonnet', withImageInstruction(opts)];
}

/** zcode CLI argv: native `--attach` image flag, yolo mode, JSON envelope. */
export function buildZcodeArgs(opts: { imagePath: string; prompt: string }): string[] {
  return ['--prompt', opts.prompt, '--attach', opts.imagePath, '--mode', 'yolo', '--json'];
}

function withImageInstruction(opts: { imagePath: string; prompt: string }): string {
  return `Read the image file at ${opts.imagePath}. ${opts.prompt}`;
}

/**
 * Finds the last syntactically valid top-level `{...}` object in a noisy CLI
 * transcript (e.g. zcode's tool-call trace, which echoes the tool-call
 * *input* JSON before the real answer). A single forward pass tracks brace
 * depth so only complete, non-nested-in-anything-else objects are
 * considered — the last one to close is the answer. Returns the input
 * trimmed when no JSON object is found, so callers can still surface the
 * raw text in an error.
 */
export function extractLastJsonObject(text: string): string {
  let depth = 0;
  let start = -1;
  let last: string | null = null;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = text.slice(start, i + 1);
        try {
          JSON.parse(candidate);
          last = candidate;
        } catch {
          /* not valid JSON — ignore this top-level span */
        }
        start = -1;
      } else if (depth < 0) {
        depth = 0; // stray closing brace outside any object — resync
      }
    }
  }
  return last ?? text.trim();
}

const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

export class CliVisionError extends Error {
  constructor(public backend: CliVisionBackend, message: string) {
    super(`[cli:${backend}] ${message}`);
    this.name = 'CliVisionError';
  }
}

function kimiAcpRunnerPath(): string {
  return process.env.KIMI_ACP_RUNNER || join(homedir(), '.kimi-code', 'acp-run.mjs');
}

async function runClaude(imagePath: string, prompt: string, timeout: number): Promise<string> {
  // Deliberately no `cwd` override: pointing the CLI's working directory at
  // a bare temp dir was observed (with codex, a similar CLI) to make it
  // silently no-op — claude is fine either way, so keep the default cwd for
  // consistency with that finding.
  const { stdout } = await execFileAsync('claude', buildClaudeArgs({ imagePath, prompt }), {
    timeout,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  return stdout.trim();
}

async function runZcode(dir: string, imagePath: string, prompt: string, timeout: number): Promise<string> {
  const { stdout } = await execFileAsync('zcode', buildZcodeArgs({ imagePath, prompt }), {
    cwd: dir,
    timeout,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  const envelope = JSON.parse(stdout) as { response?: string };
  if (!envelope.response) throw new Error('zcode response missing "response" field');
  return extractLastJsonObject(envelope.response);
}

async function runKimi(dir: string, imagePath: string, prompt: string, timeout: number): Promise<string> {
  const promptPath = join(dir, 'prompt.txt');
  await writeFile(promptPath, withImageInstruction({ imagePath, prompt }), 'utf8');
  const { stdout } = await execFileAsync('node', [kimiAcpRunnerPath(), dir, promptPath], {
    timeout,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  return extractLastJsonObject(stdout);
}

/**
 * Runs the selected CLI against a temp copy of the image and returns its
 * raw text response. The caller (route) is responsible for JSON-parsing
 * and schema-validating the result exactly as it does for API providers.
 */
export async function generateVisionCli(
  backend: CliVisionBackend,
  prompt: string,
  image: { mimeType: string; base64: string },
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const dir = await mkdtemp(join(tmpdir(), 'arted-cli-vision-'));
  const imagePath = join(dir, `image.${extFromMime(image.mimeType)}`);
  try {
    await writeFile(imagePath, Buffer.from(image.base64, 'base64'));
    const text =
      backend === 'claude'
        ? await runClaude(imagePath, prompt, timeout)
        : backend === 'zcode'
          ? await runZcode(dir, imagePath, prompt, timeout)
          : await runKimi(dir, imagePath, prompt, timeout);
    if (!text) throw new CliVisionError(backend, 'Empty response');
    return text;
  } catch (err) {
    if (err instanceof CliVisionError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new CliVisionError(backend, msg);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
