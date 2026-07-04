export const MDPI_EDITOR_GUIDANCE = [
  'MDPI editorial checks to apply when relevant:',
  '- Title: flag redundant article-type words such as extra "Article" when they appear in the manuscript title.',
  '- Author metadata: check author names, initials/abbreviations, affiliations, email addresses, postcodes, and funding details for visible inconsistency.',
  '- Affiliations: prefer a consistent "Department/Faculty/School of ..." pattern; keep country naming consistent and avoid mixed Turkey/Turkiye/Türkiye variants.',
  '- Materials, devices, instruments, software, samples, and commercial resources: first mention should include manufacturer/company, city, state abbreviation for USA/Canada when applicable, country, and software version when software is named.',
  '- Scientific variables: flag visible variables such as n and p when they should be italicized in text, tables, or figure labels.',
  '- Dates and numbers: require consistent date format; use commas only for numbers with five or more digits, not four-digit numbers.',
  '- Ethics/funding/admin sections: distinguish Institutional Review Board vs Ethics Committee wording; flag missing funder/funding number when funding is mentioned; omit empty Acknowledgments sections.',
  '- Case and stray characters: flag inconsistent capitalization and obvious extra letters or duplicate characters.',
  'Do not invent missing metadata. If the text lacks enough evidence, phrase the item as a checklist warning rather than a correction.',
].join('\n');

export const MDPI_REWRITE_GUIDANCE =
  'Follow MDPI-style mechanics when directly rewriting visible text: consistent date format, correct number comma usage, consistent capitalization, and italic variable notation when represented in plain text. Preserve author names, affiliations, emails, citations, technical terms, and factual metadata unless the user explicitly asks to change them.';
