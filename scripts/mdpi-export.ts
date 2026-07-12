/**
 * Headless "backend": takes a manuscript draft (.docx) and produces an
 * MDPI/JCM-formatted .docx — same pipeline the browser UI runs
 * (DocImportModal → EditorClient.previewDocx/applyImportPreviewData →
 * exportDocxTemplate), invoked from Node instead of a browser tab. No
 * server, no upload — this just runs ARTED's own lib/ code directly.
 *
 * Usage:
 *   npx tsx scripts/mdpi-export.ts <input.docx> <output.docx> [title]
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Ref } from '@/store/types';
import { parseDocx } from '@/lib/docx/parse';
import { splitBodyAndBiblio, parseBiblioLines, isBibliographyHeadingText } from '@/lib/refs/parse-biblio';
import { splitAbstractMetadataFromParagraphs } from '@/lib/editor/abstract';
import { extractProjectTables } from '@/lib/tables/project-tables';
import { buildDocWithCitations } from '@/lib/editor/import-rich';
import { buildTemplateDocx, getDocxTemplate } from '@/lib/docx/template-docx';
import { newId } from '@/lib/id';

export type MdpiExportResult = {
  outputPath: string;
  title: string;
  refCount: number;
  markerCount: number;
  abstractFound: boolean;
  keywordCount: number;
  tableCount: number;
};

export async function exportDocxAsMdpi(
  inputPath: string,
  outputPath: string,
  opts: { title?: string; templateId?: string } = {},
): Promise<MdpiExportResult> {
  const inputBytes = await readFile(inputPath);
  const filename = inputPath.split('/').pop() ?? 'manuscript.docx';

  // 1. Parse the .docx into paragraphs + plain text (same as parseDocx call
  //    in EditorClient.previewDocx).
  const { paragraphs, plainText } = await parseDocx(inputBytes);

  // 2. Split body vs. bibliography, parse the reference list.
  const split = splitBodyAndBiblio(plainText);
  const { refs: parsedRefs } = parseBiblioLines(split.refLines);

  // 3. Find where the References section starts in the paragraph list, so
  //    everything before it is candidate manuscript body.
  let referencesStartIndex = paragraphs.length;
  for (let i = 0; i < paragraphs.length; i += 1) {
    if (isBibliographyHeadingText(paragraphs[i].text)) {
      referencesStartIndex = i;
      break;
    }
  }

  // 4. Pull out Abstract/Keywords, then tables, from the manuscript body.
  const { bodyParagraphs, abstractText, keywords } = splitAbstractMetadataFromParagraphs(
    paragraphs.slice(0, referencesStartIndex),
  );
  const { paragraphs: rawManuscriptParagraphs, tables } = extractProjectTables(bodyParagraphs, filename);

  const title = opts.title ?? filename.replace(/\.docx$/i, '');

  // 4b. Word manuscripts frequently have the title as a plain first
  // paragraph (no "Heading 1" style applied) — build-rich.ts's title-block
  // detection only recognizes an actual H1, so an un-styled title survives
  // as ordinary body text and would otherwise appear twice (once as the
  // MDPI title paragraph from `title` above, once again as body text).
  // Since this script takes `title` as an explicit input, drop a leading
  // paragraph that's just that same text.
  const normalize = (s: string): string => s.trim().toLowerCase().replace(/[.:]+$/, '');
  const manuscriptParagraphs =
    rawManuscriptParagraphs.length > 0 && normalize(rawManuscriptParagraphs[0].text) === normalize(title)
      ? rawManuscriptParagraphs.slice(1)
      : rawManuscriptParagraphs;

  // 5. Assign fresh ids to parsed refs (mirrors applyImportPreviewData's
  //    `{ ...incomingRef, id: newRefId() }" — array order = citation order).
  const refs: Ref[] = parsedRefs.map((r) => ({ ...r, id: newId('ref') }));

  // 6. Build the TipTap doc with citation nodes at [N]/[N,M]/[N-M] marker
  //    positions. selectedRefNumbers = identity (1..refs.length) since every
  //    parsed reference is kept, in its original order.
  const doc = buildDocWithCitations(
    manuscriptParagraphs,
    refs,
    refs.map((_, i) => i + 1),
  );

  // 7. Load the MDPI/JCM template and render — same call as
  //    EditorClient.exportDocxTemplate.
  const templateId = opts.templateId ?? 'jcm';
  const template = getDocxTemplate(templateId);
  if (!template) throw new Error(`Unknown docx template: ${templateId}`);
  const templatePath = join(process.cwd(), 'public', template.file.replace(/^\//, ''));
  const templateBytes = await readFile(templatePath);

  const refsById = new Map(refs.map((r) => [r.id, r]));
  const refOrder = new Map(refs.map((r, i) => [r.id, i + 1]));

  const blob = await buildTemplateDocx(templateBytes, template, {
    doc,
    refsById,
    refOrder,
    style: template.citationStyle ?? 'vancouver',
    mode: 'active',
    title,
    abstractText,
    keywords,
    figureCaptionPlacement: 'inline',
    lineNumbers: false,
  });

  await writeFile(outputPath, Buffer.from(await blob.arrayBuffer()));

  return {
    outputPath,
    title,
    refCount: refs.length,
    markerCount: split.refLines.length > 0 ? refs.length : 0,
    abstractFound: Boolean(abstractText?.trim()),
    keywordCount: keywords?.length ?? 0,
    tableCount: tables.length,
  };
}

async function main(): Promise<void> {
  const [, , inputPath, outputPath, title] = process.argv;
  if (!inputPath || !outputPath) {
    console.error('Usage: npx tsx scripts/mdpi-export.ts <input.docx> <output.docx> [title]');
    process.exitCode = 1;
    return;
  }
  const result = await exportDocxAsMdpi(inputPath, outputPath, { title });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exitCode = 1;
  });
}
