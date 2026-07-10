/**
 * Local-CLI vision fallback for the image→table tool.
 *
 * When no server API key is configured for any vision provider, the
 * image-table route can shell out to the Claude Code CLI already
 * authenticated on the SAME machine running the Next.js server — no API key,
 * no billing, no extra login. This mirrors the keyless CLI pattern used by
 * the reference checker in the sibling `paper` project
 * (backend/services/ai_providers.py: `_generate_claude_cli`, subprocess +
 * `claude -p --output-format text`).
 *
 * Explicit opt-in only via AI_LOCAL_CLI_VISION=claude — never auto-detected,
 * and a no-op in a normal Docker/Coolify deploy (the image has no `claude`
 * binary or session).
 *
 * Verified against a real install: unlike `codex exec -i <img>` (intermittent
 * "Unable to process this image" on identical repeated input — see git
 * history) and Gemini CLI (free tier can be deauthorized server-side,
 * independent of this app), `claude -p` reliably reads a local image file
 * referenced by path in the prompt (it uses its own Read tool) and returned
 * byte-identical, correct table JSON across repeated runs in testing.
 *
 * Security: fixed argv array via execFile (no shell string), image written
 * to a private temp directory, hard timeout, guaranteed cleanup, capped
 * output.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

export type CliVisionBackend = 'claude';

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
  return value?.trim().toLowerCase() === 'claude' ? 'claude' : null;
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
  const fullPrompt = `Read the image file at ${opts.imagePath}. ${opts.prompt}`;
  return ['-p', '--output-format', 'text', '--model', 'sonnet', fullPrompt];
}

const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

export class CliVisionError extends Error {
  constructor(public backend: CliVisionBackend, message: string) {
    super(`[cli:${backend}] ${message}`);
    this.name = 'CliVisionError';
  }
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
    // Deliberately no `cwd` override: pointing the CLI's working directory
    // at a bare temp dir was observed to make it silently no-op (no output,
    // no error) — it needs to run from the server's normal project cwd.
    const { stdout } = await execFileAsync('claude', buildClaudeArgs({ imagePath, prompt }), {
      timeout,
      maxBuffer: MAX_OUTPUT_BYTES,
    });
    const text = stdout.trim();
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
