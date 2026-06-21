export type MedicalStatisticIssueCode =
  | 'p-zero'
  | 'p-range'
  | 'p-leading-zero'
  | 'effect-ci'
  | 'percent-denominator';

export interface MedicalStatisticIssue {
  code: MedicalStatisticIssueCode;
  severity: 'low' | 'med' | 'high';
  quote: string;
  start: number;
  end: number;
  message: { tr: string; en: string };
  replacement?: string;
}

interface Sentence {
  text: string;
  start: number;
}

export function scanMedicalStatistics(text: string): MedicalStatisticIssue[] {
  const issues: MedicalStatisticIssue[] = [];
  const sentences = splitSentences(text);

  addRegexIssues(
    issues,
    text,
    /\bp\s*=\s*0?\.0{3,}\b/gi,
    (match, start) => ({
      code: 'p-zero',
      severity: 'high',
      quote: match,
      start,
      end: start + match.length,
      message: {
        tr: 'p değeri 0 olarak raporlanmamalı; yazılımın hassasiyet sınırı kullanılmalı.',
        en: 'A p value should not be reported as zero; report the software precision limit.',
      },
      replacement: 'p < 0.001',
    }),
  );

  addRegexIssues(
    issues,
    text,
    /\bp\s*=\s*(?:1\.\d*[1-9]\d*|(?:[2-9]\d*|\d{2,})(?:\.\d+)?)\b/gi,
    (match, start) => ({
      code: 'p-range',
      severity: 'high',
      quote: match,
      start,
      end: start + match.length,
      message: {
        tr: 'p değeri 0 ile 1 arasında olmalıdır; analiz çıktısını kontrol edin.',
        en: 'A p value must be between 0 and 1; verify the statistical output.',
      },
    }),
  );

  addRegexIssues(
    issues,
    text,
    /\bp\s*=\s*\.\d+\b/gi,
    (match, start) => {
      // Insert a leading zero before the decimal: "P = .005" → "P = 0.005".
      // Preserve the original letter case and the exact spacing around "=".
      const replacement = match.replace(/\.\d/, '0$&');
      return {
        code: 'p-leading-zero',
        severity: 'low',
        quote: match,
        start,
        end: start + match.length,
        message: {
          tr: 'Dergi stili aksini istemiyorsa p değerinde baştaki sıfırı kullanın.',
          en: 'Use a leading zero for the p value unless the journal style specifies otherwise.',
        },
        replacement,
      };
    },
  );

  for (const sentence of sentences) {
    const effect = sentence.text.match(/\b(?:a?OR|a?HR|RR|IRR)\s*[=:]?\s*\d+(?:\.\d+)?\b/i);
    if (effect && !/\b(?:90|95|99)%?\s*(?:CI|confidence interval)\b/i.test(sentence.text)) {
      const start = sentence.start + (effect.index ?? 0);
      issues.push({
        code: 'effect-ci',
        severity: 'med',
        quote: effect[0],
        start,
        end: start + effect[0].length,
        message: {
          tr: 'Etki tahmini mümkünse güven aralığıyla birlikte raporlanmalıdır.',
          en: 'Report the effect estimate with its confidence interval when available.',
        },
      });
    }

    const percentages = Array.from(sentence.text.matchAll(/\b\d+(?:\.\d+)?%/g));
    const hasCount =
      /\(\s*n\s*=\s*\d+\s*\)/i.test(sentence.text) ||
      /\b\d+\s*\/\s*\d+\b/.test(sentence.text);
    for (const percentage of percentages) {
      if (hasCount || /^95%$/i.test(percentage[0]) && /\bCI\b/i.test(sentence.text)) continue;
      const start = sentence.start + (percentage.index ?? 0);
      issues.push({
        code: 'percent-denominator',
        severity: 'low',
        quote: percentage[0],
        start,
        end: start + percentage[0].length,
        message: {
          tr: 'Tıbbi sonuçlarda yüzdeyi mümkünse pay ve payda ile birlikte verin.',
          en: 'In medical results, accompany the percentage with numerator and denominator when possible.',
        },
      });
    }
  }

  return dedupeIssues(issues);
}

function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  const boundary = /[.!?](?=\s+[A-Z]|\s*$)|\n+/g;
  let start = 0;
  for (const match of text.matchAll(boundary)) {
    const end = (match.index ?? 0) + match[0].length;
    const raw = text.slice(start, end);
    const leading = raw.length - raw.trimStart().length;
    const sentence = raw.trim();
    if (sentence) sentences.push({ text: sentence, start: start + leading });
    start = end;
  }
  const tail = text.slice(start);
  const leading = tail.length - tail.trimStart().length;
  if (tail.trim()) sentences.push({ text: tail.trim(), start: start + leading });
  return sentences;
}

function addRegexIssues(
  target: MedicalStatisticIssue[],
  text: string,
  regex: RegExp,
  build: (match: string, start: number) => MedicalStatisticIssue,
): void {
  for (const match of text.matchAll(regex)) {
    target.push(build(match[0], match.index ?? 0));
  }
}

function dedupeIssues(issues: ReadonlyArray<MedicalStatisticIssue>): MedicalStatisticIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.start}:${issue.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
