/**
 * Local-CLI vision fallback for the image→table tool.
 *
 * When no server API key is configured for any vision provider, the
 * image-table route can shell out to a CLI coding agent already
 * authenticated on the SAME machine running the Next.js server (e.g. a
 * developer's laptop running `npm run dev`, or a self-host where the
 * operator deliberately installed + logged into these tools). This is
 * explicit opt-in only via AI_LOCAL_CLI_VISION — it is NOT auto-detected,
 * and it does nothing in a normal Docker/Coolify deploy that doesn't set
 * the env var and bundle the CLI binaries.
 *
 * BEST-EFFORT, NOT RECOMMENDED FOR PRODUCTION: both backends were manually
 * verified against real installs and neither is reliable for this task —
 *  - codex  (`codex exec -i <img>`) intermittently returns "Unable to
 *    process this image" for the exact same input across repeated runs,
 *    and spins up the full coding-agent harness (hooks/skills/MCP) per
 *    call, burning ~15-20k tokens for one image.
 *  - gemini CLI's free tier can be entirely deauthorized server-side
 *    ("IneligibleTierError") independent of anything this app does.
 * A real Gemini/OpenAI/Anthropic API key (free tiers exist) is the
 * reliable path; this module exists only as a stopgap when a developer
 * has zero API keys but an authenticated CLI on hand.
 *
 * Supported backends:
 *  - codex  (OpenAI Codex CLI)  — native `-i/--image` flag.
 *  - gemini (Gemini CLI)        — `@<path>` file-attachment syntax in the
 *                                  prompt; Gemini CLI reads the referenced
 *                                  image into the model context.
 *
 * Security: fixed argv arrays only (no shell string), image written to a
 * private temp directory, hard timeout, guaranteed cleanup, capped output.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

export type CliVisionBackend = 'codex' | 'gemini';

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
 * Explicit opt-in only — any other value (including "auto"/"true") is
 * rejected so a stray/mistyped env var never silently shells out.
 */
export function parseCliVisionBackend(value: string | undefined): CliVisionBackend | null {
  const v = value?.trim().toLowerCase();
  return v === 'codex' || v === 'gemini' ? v : null;
}

export function isCliVisionEnabled(): CliVisionBackend | null {
  return parseCliVisionBackend(process.env.AI_LOCAL_CLI_VISION);
}

/** codex exec argv: native image attachment + a file the last message is written to. */
export function buildCodexArgs(opts: { imagePath: string; outPath: string; prompt: string }): string[] {
  return [
    'exec',
    '--skip-git-repo-check',
    '-s', 'read-only',
    '-i', opts.imagePath,
    '--output-last-message', opts.outPath,
    opts.prompt,
  ];
}

/** gemini CLI argv: `@path` attaches the image file into the model context. */
export function buildGeminiArgs(opts: { imagePath: string; prompt: string }): string[] {
  return ['-o', 'text', '-p', `@${opts.imagePath}\n${opts.prompt}`];
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
  const outPath = join(dir, 'out.txt');
  try {
    await writeFile(imagePath, Buffer.from(image.base64, 'base64'));
    if (backend === 'codex') {
      await execFileAsync('codex', buildCodexArgs({ imagePath, outPath, prompt }), {
        cwd: dir,
        timeout,
        maxBuffer: MAX_OUTPUT_BYTES,
      });
      const text = (await readFile(outPath, 'utf8')).trim();
      if (!text) throw new CliVisionError(backend, 'Empty response');
      return text;
    }
    const { stdout } = await execFileAsync('gemini', buildGeminiArgs({ imagePath, prompt }), {
      cwd: dir,
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
