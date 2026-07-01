/**
 * Detects whether a paragraph is a manuscript author byline / affiliation
 * block rather than body text. When true, superscript affiliation numbers
 * must NOT be treated as citation markers during import.
 *
 * Used by both the docx parser (lib/docx/parse.ts → citationText) and the
 * rich-text importer (lib/editor/import-rich.ts → buildDocWithCitations) so
 * that affiliation superscripts like "Fatih Akkaya¹, Nihan Bahadır¹" are
 * preserved as plain text instead of being wrapped into "[1]" citation
 * markers.
 *
 * Signals (any one is sufficient):
 *  1. Paragraph style matches author/affiliation keywords
 *     (MDPI13authornames, MDPI16affiliation, "Authors", "Byline", …).
 *  2. Text begins with a department/institution affiliation line, e.g.
 *     "1 Cardiology, Ordu University, …".
 *  3. Text matches a multi-author byline structure: at least two
 *     "Name <superscript-number>" groups separated by commas / "and".
 */
export function looksLikeAuthorByline(text: string, style?: string): boolean {
  const lcStyle = (style ?? '').toLowerCase();
  if (/(authornames|affiliation|authors?\b|byline|correspondence)/.test(lcStyle)) {
    return true;
  }
  const t = text.trim();
  // Affiliation line: leading institution-number + department/institution.
  if (
    /^\d+\s+(?:Department|Faculty|Cardiology|Medicine|University|Hospital|Institute|School|Clinic)/i.test(t)
  ) {
    return true;
  }
  // Multi-author byline: at least two "Name <superscript-number>" groups.
  // Splits on ", " / " and " / " & " and counts groups whose tail is a
  // short superscript-affiliation marker (¹²³⁴ or [1] or a lone digit).
  const groups = t.split(/\s*(?:,\s*(?![^(]*\))|\s+and\s+|\s*&\s*)\s*/i);
  const bylineGroups = groups.filter((g) =>
    /[A-Za-zÇĞİÖŞÜçğıöşü]{2,}\s*[\[]?\d[\d,\s*–—-]*\]?$/.test(g.trim()),
  );
  return bylineGroups.length >= 2;
}
