/**
 * Local-CLI text generation, the text sibling of ./cli-vision.ts.
 *
 * Same rationale: shell out to a CLI coding agent already authenticated on the machine
 * running the Next.js server — no API key, no billing, no extra login — and a no-op in a
 * normal Docker/Coolify deploy, which has none of these binaries or sessions.
 *
 * Three things differ from the vision path, and each is deliberate:
 *
 *  1. The prompt is written to a temp FILE for every backend, not passed as an argv
 *     element. A graphical-abstract prompt carries the icon catalogue, an example spec and
 *     manuscript text — tens of kilobytes — and argv plus environment share a fixed limit
 *     (1 MB on macOS). cli-vision.ts gets away with argv only because its prompt is short.
 *
 *  2. `zcode` is not offered. It runs `--mode yolo`, and this path feeds it manuscript
 *     text the author pasted from elsewhere. A tool-enabled agent with unrestricted write
 *     access is the wrong place to put untrusted input, even fenced.
 *
 *  3. A separate env var, AI_LOCAL_CLI_TEXT. Enabling the keyless vision fallback should
 *     not silently also enable a different capability with a different risk profile.
 *
 * The prompt still fences the manuscript and tells the model not to follow instructions
 * inside it (lib/graphical-abstract/prompt.ts) — this is defence in depth, not a
 * replacement for that.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir, tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractLastJsonObject } from './cli-vision';

const execFileAsync = promisify(execFile);

export type CliTextBackend = 'claude' | 'kimi' | 'codex';

const BACKENDS: readonly CliTextBackend[] = ['claude', 'kimi', 'codex'];

/** Human label for the disclosure the author pastes into the manuscript. */
export const CLI_TEXT_LABELS: Record<CliTextBackend, string> = {
  claude: 'Claude Code (local CLI)',
  kimi: 'Kimi K2 (local CLI)',
  codex: 'OpenAI Codex (local CLI)',
};

/**
 * Reads AI_LOCAL_CLI_TEXT and returns a recognised backend, or null. Explicit opt-in
 * only — "auto"/"true"/"1" are rejected so a stray value never silently shells out.
 */
export function parseCliTextBackend(value: string | undefined): CliTextBackend | null {
  const v = value?.trim().toLowerCase();
  return (BACKENDS as readonly string[]).includes(v ?? '') ? (v as CliTextBackend) : null;
}

export function isCliTextEnabled(): CliTextBackend | null {
  return parseCliTextBackend(process.env.AI_LOCAL_CLI_TEXT);
}

export class CliTextError extends Error {
  constructor(public backend: CliTextBackend, message: string) {
    super(`[cli:${backend}] ${message}`);
    this.name = 'CliTextError';
  }
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

/**
 * Instruction that points the CLI at the prompt file. Every backend reads the file with
 * its own tool rather than receiving the text on the command line.
 */
function readFileInstruction(promptPath: string): string {
  return (
    `Read the file at ${promptPath}. It contains your full instructions. ` +
    'Follow them and reply with the requested JSON object only.'
  );
}

export function buildClaudeTextArgs(promptPath: string): string[] {
  return ['-p', '--output-format', 'text', '--model', 'sonnet', readFileInstruction(promptPath)];
}

export function buildCodexTextArgs(promptPath: string, outPath: string): string[] {
  return [
    'exec',
    '--skip-git-repo-check',
    '-s',
    'read-only',
    '--output-last-message',
    outPath,
    readFileInstruction(promptPath),
  ];
}

function kimiAcpRunnerPath(): string {
  return process.env.KIMI_ACP_RUNNER || join(homedir(), '.kimi-code', 'acp-run.mjs');
}

async function runClaude(promptPath: string, timeout: number): Promise<string> {
  const { stdout } = await execFileAsync('claude', buildClaudeTextArgs(promptPath), {
    timeout,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  return stdout.trim();
}

async function runKimi(dir: string, promptPath: string, timeout: number): Promise<string> {
  // The ACP wrapper already takes a prompt file, which is why the vision path uses it too.
  const { stdout } = await execFileAsync('node', [kimiAcpRunnerPath(), dir, promptPath], {
    timeout,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  return stdout.trim();
}

async function runCodex(dir: string, promptPath: string, timeout: number): Promise<string> {
  const outPath = join(dir, 'answer.txt');
  // read-only sandbox: this task only has to produce JSON on stdout, so there is no
  // reason to give an agent processing untrusted text any write access at all.
  const { stdout } = await execFileAsync('codex', buildCodexTextArgs(promptPath, outPath), {
    cwd: dir,
    timeout,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  const { readFile } = await import('node:fs/promises');
  const last = await readFile(outPath, 'utf8').catch(() => '');
  return (last || stdout).trim();
}

/**
 * Runs the selected CLI and returns its raw text response. The caller JSON-parses and
 * schema-validates exactly as it would for an API provider.
 */
export async function generateTextCli(
  backend: CliTextBackend,
  prompt: string,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const dir = await mkdtemp(join(tmpdir(), 'arted-cli-text-'));
  const promptPath = join(dir, 'prompt.md');
  try {
    await writeFile(promptPath, prompt, 'utf8');
    const text =
      backend === 'claude'
        ? await runClaude(promptPath, timeout)
        : backend === 'kimi'
          ? await runKimi(dir, promptPath, timeout)
          : await runCodex(dir, promptPath, timeout);
    if (!text) throw new CliTextError(backend, 'Empty response');
    // CLI transcripts are noisy (tool-call echoes, progress lines); the answer is the last
    // complete top-level JSON object in the stream.
    return extractLastJsonObject(text);
  } catch (err) {
    if (err instanceof CliTextError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new CliTextError(backend, msg);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
