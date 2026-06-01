// Pure writing-statistics computation over a TipTap document JSON tree.
// No side effects, no logging, no external dependencies. See ./types for the
// produced shape. Node shape mirrors the editor: { type, content?, text?, attrs? }.

import type { WritingStats } from './types';

/** Minimal structural view of a TipTap node. All fields optional/guarded. */
interface DocNode {
  type?: string;
  text?: string;
  content?: unknown;
  attrs?: { refIds?: unknown } | null;
}

/** Mutable accumulator used internally while walking the tree. */
interface Accumulator {
  text: string;
  paragraphs: number;
  headings: number;
  citations: number;
  refIds: Set<string>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asNode(value: unknown): DocNode | null {
  return isObject(value) ? (value as DocNode) : null;
}

function childrenOf(node: DocNode): DocNode[] {
  if (!Array.isArray(node.content)) return [];
  const out: DocNode[] = [];
  for (const child of node.content) {
    const n = asNode(child);
    if (n) out.push(n);
  }
  return out;
}

/** Concatenated text of a node's entire subtree (text nodes only). */
function subtreeText(node: DocNode): string {
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
  let out = '';
  for (const child of childrenOf(node)) out += subtreeText(child);
  return out;
}

/** Collect refIds from a citation node's attrs, ignoring malformed entries. */
function citationRefIds(node: DocNode): string[] {
  const raw = node.attrs?.refIds;
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const id of raw) if (typeof id === 'string' && id.length > 0) ids.push(id);
  return ids;
}

/** Recursively fold a node and its descendants into the accumulator. */
function accumulate(node: DocNode, acc: Accumulator): void {
  switch (node.type) {
    case 'text':
      if (typeof node.text === 'string') acc.text += node.text;
      return;
    case 'citation': {
      acc.citations += 1;
      for (const id of citationRefIds(node)) acc.refIds.add(id);
      return;
    }
    case 'paragraph':
      if (subtreeText(node).trim().length > 0) acc.paragraphs += 1;
      break;
    case 'heading':
      acc.headings += 1;
      break;
    default:
      break;
  }
  for (const child of childrenOf(node)) accumulate(child, acc);
}

function countWords(text: string): number {
  const tokens = text.split(/\s+/).filter((token) => token.length > 0);
  return tokens.length;
}

function countSentences(text: string): number {
  return text
    .split(/[.!?]+(\s|$)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;
}

function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Compute writing statistics from a TipTap document JSON value.
 * Tolerates malformed / non-object input by treating it as an empty document.
 */
export function computeWritingStats(docJson: unknown): WritingStats {
  const acc: Accumulator = {
    text: '',
    paragraphs: 0,
    headings: 0,
    citations: 0,
    refIds: new Set<string>(),
  };

  const root = asNode(docJson);
  if (root) accumulate(root, acc);

  const text = acc.text;
  const words = countWords(text);
  const characters = text.length;
  const charactersNoSpaces = text.replace(/\s/g, '').length;
  const citationDensity = roundTo1((acc.citations / Math.max(1, words)) * 1000);
  const readingTimeMin = Math.max(words > 0 ? 1 : 0, Math.round(words / 200));

  return {
    words,
    characters,
    charactersNoSpaces,
    sentences: countSentences(text),
    paragraphs: acc.paragraphs,
    headings: acc.headings,
    citations: acc.citations,
    uniqueCitations: acc.refIds.size,
    citationDensity,
    readingTimeMin,
  };
}
