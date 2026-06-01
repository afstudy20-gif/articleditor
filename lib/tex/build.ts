import type { Ref } from '@/store/types';
import { buildCitationKeyMap, generateBibtex } from '@/lib/refs/bibtex-out';
import type { CitationStyle, StyleId } from '@/lib/refs/styles';

type Json = any;

export type TexBuildInput = {
  doc: Json;
  refs: Ref[];
  title?: string;
  style: StyleId;
};

export type TexBuildOutput = {
  tex: string;
  bib: string;
  bibFilename: string;
};

const STYLE_PACKAGE: Record<CitationStyle, { biblatex?: string; natbib?: string }> = {
  vancouver: { biblatex: 'vancouver', natbib: 'unsrt' },
  ama: { biblatex: 'numeric-comp', natbib: 'unsrtnat' },
  ieee: { biblatex: 'ieee', natbib: 'IEEEtran' },
  apa: { biblatex: 'apa', natbib: 'apalike' },
};

export function buildLatex(input: TexBuildInput): TexBuildOutput {
  const bibFilename = 'refs.bib';
  const keyMap = buildCitationKeyMap(input.refs);
  const bib = generateBibtex(input.refs);
  const pkg = STYLE_PACKAGE[input.style as CitationStyle] ?? STYLE_PACKAGE.vancouver;
  const tex = buildTexSource({
    title: input.title ?? 'Untitled',
    body: renderBody(input.doc, keyMap),
    biblatexStyle: pkg.biblatex ?? 'numeric-comp',
    bibFilename: 'refs',
  });
  return { tex, bib, bibFilename };
}

function buildTexSource(o: {
  title: string;
  body: string;
  biblatexStyle: string;
  bibFilename: string;
}): string {
  return `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[turkish,english]{babel}
\\usepackage{lmodern}
\\usepackage{microtype}
\\usepackage{csquotes}
\\usepackage[backend=biber,style=${o.biblatexStyle},sorting=none]{biblatex}
\\usepackage{hyperref}
\\addbibresource{${o.bibFilename}.bib}

\\title{${escapeTex(o.title)}}
\\author{}
\\date{}

\\begin{document}
\\maketitle

${o.body}

\\printbibliography

\\end{document}
`;
}

function renderBody(doc: Json, keyMap: Map<string, string>): string {
  const out: string[] = [];
  const walk = (n: any): void => {
    if (!n) return;
    if (n.type === 'text') {
      out.push(applyMarks(n.text ?? '', n.marks ?? []));
      return;
    }
    if (n.type === 'paragraph') {
      const inner: string[] = [];
      if (Array.isArray(n.content)) for (const c of n.content) inner.push(renderInline(c, keyMap));
      out.push(inner.join('') + '\n\n');
      return;
    }
    if (n.type === 'heading') {
      const level = n.attrs?.level ?? 2;
      const cmd = level === 1 ? 'section' : level === 2 ? 'section' : level === 3 ? 'subsection' : 'subsubsection';
      const inner: string[] = [];
      if (Array.isArray(n.content)) for (const c of n.content) inner.push(renderInline(c, keyMap));
      out.push(`\\${cmd}{${inner.join('')}}\n\n`);
      return;
    }
    if (n.type === 'bulletList') {
      const items: string[] = [];
      if (Array.isArray(n.content)) {
        for (const item of n.content) {
          if (item.type === 'listItem' && Array.isArray(item.content)) {
            const inner = item.content.map((c: any) => renderInline(c, keyMap)).join('');
            items.push(`  \\item ${inner.replace(/\\n+$/g, '').trim()}`);
          }
        }
      }
      out.push(`\\begin{itemize}\n${items.join('\n')}\n\\end{itemize}\n\n`);
      return;
    }
    if (n.type === 'orderedList') {
      const items: string[] = [];
      if (Array.isArray(n.content)) {
        for (const item of n.content) {
          if (item.type === 'listItem' && Array.isArray(item.content)) {
            const inner = item.content.map((c: any) => renderInline(c, keyMap)).join('');
            items.push(`  \\item ${inner.replace(/\\n+$/g, '').trim()}`);
          }
        }
      }
      out.push(`\\begin{enumerate}\n${items.join('\n')}\n\\end{enumerate}\n\n`);
      return;
    }
    if (n.type === 'blockquote') {
      const inner: string[] = [];
      if (Array.isArray(n.content)) for (const c of n.content) inner.push(renderInline(c, keyMap));
      out.push(`\\begin{quote}\n${inner.join('')}\n\\end{quote}\n\n`);
      return;
    }
    if (n.type === 'hardBreak') {
      out.push(' \\\\ ');
      return;
    }
    if (Array.isArray(n.content)) for (const c of n.content) walk(c);
  };
  walk(doc);
  return out.join('').trim();
}

function renderInline(n: any, keyMap: Map<string, string>): string {
  if (!n) return '';
  if (n.type === 'text') return applyMarks(n.text ?? '', n.marks ?? []);
  if (n.type === 'citation') {
    const ids: string[] = n.attrs?.refIds ?? [];
    const keys = ids.map((id) => keyMap.get(id)).filter((k): k is string => Boolean(k));
    if (keys.length === 0) return '[?]';
    return `\\cite{${keys.join(',')}}`;
  }
  if (n.type === 'hardBreak') return ' \\\\ ';
  if (Array.isArray(n.content)) {
    return n.content.map((c: any) => renderInline(c, keyMap)).join('');
  }
  return '';
}

function applyMarks(text: string, marks: Array<{ type: string; attrs?: any }>): string {
  let s = escapeTex(text);
  for (const m of marks) {
    if (m.type === 'bold') s = `\\textbf{${s}}`;
    else if (m.type === 'italic') s = `\\textit{${s}}`;
    else if (m.type === 'code') s = `\\texttt{${s}}`;
    else if (m.type === 'link') {
      const href = m.attrs?.href ? escapeTexUrl(m.attrs.href) : '';
      s = `\\href{${href}}{${s}}`;
    }
  }
  return s;
}

function escapeTex(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/—/g, '---')
    .replace(/–/g, '--');
}

function escapeTexUrl(s: string): string {
  return s.replace(/%/g, '\\%').replace(/#/g, '\\#');
}
