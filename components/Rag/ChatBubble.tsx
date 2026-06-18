'use client';

import { Fragment, type ReactNode } from 'react';
import { CitationChip } from './CitationChip';

export type ChatCitation = {
  chunkId: string;
  refId?: string;
  pageNo?: number;
  refNumber?: number;
  sourceTitle?: string;
};

type Props = {
  role: 'user' | 'assistant';
  content: string;
  citations?: ChatCitation[];
  onCiteClick?: (refId: string, pageNo?: number) => void;
};

const CHUNK_ID_PATTERN = /\[([a-z0-9-]+)\]/gi;

/**
 * One chat message. User messages are right-aligned teal bubbles; assistant
 * messages are left-aligned bordered cards. Assistant content is scanned for
 * `[chunk_id]` markers (the citation ids emitted by the RAG chat backend) and
 * each one is swapped for a CitationChip bound to the matching entry in
 * `citations`. Markdown bold/italic is supported through simple replacement —
 * the panel deliberately avoids a full markdown renderer.
 */
export function ChatBubble({ role, content, citations, onCiteClick }: Props): JSX.Element {
  const isUser = role === 'user';

  const citationByChunkId = new Map<string, ChatCitation>();
  if (citations) {
    for (const c of citations) citationByChunkId.set(c.chunkId, c);
  }

  const wrapperClass = isUser
    ? 'flex flex-col items-end'
    : 'flex flex-col items-start';

  const bubbleClass = isUser
    ? 'max-w-[88%] rounded-2xl rounded-br-sm bg-teal text-white px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words'
    : 'max-w-[92%] rounded-2xl rounded-bl-sm bg-white border border-border px-3 py-2 text-sm leading-relaxed text-primary break-words';

  return (
    <div className={wrapperClass}>
      <div className={bubbleClass}>
        {isUser ? content : renderAssistant(content, citationByChunkId, onCiteClick)}
      </div>
    </div>
  );
}

function renderAssistant(
  content: string,
  citations: Map<string, ChatCitation>,
  onCiteClick?: (refId: string, pageNo?: number) => void,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  // Reset lastIndex defensively (the literal regex is module-scoped).
  CHUNK_ID_PATTERN.lastIndex = 0;
  let match = CHUNK_ID_PATTERN.exec(content);
  let key = 0;

  while (match !== null) {
    const [full, id] = match;
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={`t-${key++}`}>
          {renderInline(content.slice(lastIndex, match.index))}
        </Fragment>,
      );
    }

    const citation = citations.get(id);
    nodes.push(
      <CitationChip
        key={`c-${key++}`}
        chunkId={id}
        refNumber={citation?.refNumber}
        refId={citation?.refId}
        pageNo={citation?.pageNo}
        sourceTitle={citation?.sourceTitle}
        onClick={
          citation?.refId && onCiteClick
            ? () => onCiteClick(citation.refId!, citation.pageNo)
            : undefined
        }
      />,
    );

    lastIndex = match.index + full.length;
    match = CHUNK_ID_PATTERN.exec(content);
  }

  if (lastIndex < content.length) {
    nodes.push(
      <Fragment key={`t-${key++}`}>{renderInline(content.slice(lastIndex))}</Fragment>,
    );
  }

  return nodes;
}

// Minimal markdown: **bold**, *italic*, _italic_. Runs before chunk ids are
// scanned, so the markers never collide.
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;
  let lastIndex = 0;
  let match = pattern.exec(text);
  let key = 0;

  while (match !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(
        <strong key={key++} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      parts.push(
        <em key={key++} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    lastIndex = match.index + token.length;
    match = pattern.exec(text);
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}
