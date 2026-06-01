// Deterministic template-text builders for academic submission letters.
//
// These produce STARTING-POINT prose (cover letters, response-to-reviewers,
// author-contribution + conflict-of-interest scaffolds) that the editor UI
// offers as a draft. AI refinement is wired separately — nothing here calls
// any model, performs I/O, or mutates its inputs. Pure string assembly only.

export type LetterLang = 'tr' | 'en';

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/** Trim and collapse internal runs of whitespace to single spaces. */
function tidy(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Trim trailing sentence punctuation/whitespace so we can re-add our own. */
function stripTrailingPunctuation(value: string): string {
  return value.replace(/[\s.;:,]+$/u, '');
}

/** Join non-empty paragraph blocks with a blank line between them. */
function joinParagraphs(blocks: ReadonlyArray<string>): string {
  return blocks.map((b) => b.trim()).filter((b) => b.length > 0).join('\n\n');
}

/** Fallback to a placeholder when a free-text field is missing/blank. */
function orPlaceholder(value: string | undefined, placeholder: string): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : placeholder;
}

// ---------------------------------------------------------------------------
// Cover letter
// ---------------------------------------------------------------------------

export interface CoverLetterInput {
  journalName: string;
  manuscriptTitle: string;
  correspondingAuthor: string;
  authors?: string; // "A. Smith, B. Lee"
  manuscriptType?: string; // "Original Article"
  keyFinding?: string;
  lang: LetterLang;
}

export function buildCoverLetter(input: CoverLetterInput): string {
  return input.lang === 'tr'
    ? buildCoverLetterTr(input)
    : buildCoverLetterEn(input);
}

function buildCoverLetterEn(input: CoverLetterInput): string {
  const journal = orPlaceholder(input.journalName, '[Journal Name]');
  const title = orPlaceholder(input.manuscriptTitle, '[Manuscript Title]');
  const author = orPlaceholder(input.correspondingAuthor, '[Corresponding Author]');
  const type = orPlaceholder(input.manuscriptType, 'Original Article').toLowerCase();
  const authors = (input.authors ?? '').trim();

  const salutation = 'Dear Editor-in-Chief,';

  const submission =
    `On behalf of ${authors.length > 0 ? `my co-authors (${authors})` : 'my co-authors'} and myself, ` +
    `I am pleased to submit our manuscript entitled "${title}" for consideration as ` +
    `${articleFor(type)} ${type} in ${journal}.`;

  const significance = coverSignificanceEn(input.keyFinding);

  const statements =
    'We confirm that this manuscript is original, has not been published previously, ' +
    'and is not under consideration for publication elsewhere. All authors have read ' +
    'and approved the submitted version, agree to its submission to this journal, and ' +
    'declare no conflict of interest. The work complies with the ethical standards of ' +
    'the journal, and all sources have been appropriately cited.';

  const closing =
    `Thank you for your consideration of our work. We look forward to the reviewers' ` +
    `feedback and remain available to provide any further information you may require.`;

  const signoff = `Sincerely,\n${author}\nCorresponding Author`;

  return joinParagraphs([salutation, submission, significance, statements, closing, signoff]);
}

function buildCoverLetterTr(input: CoverLetterInput): string {
  const journal = orPlaceholder(input.journalName, '[Dergi Adı]');
  const title = orPlaceholder(input.manuscriptTitle, '[Makale Başlığı]');
  const author = orPlaceholder(input.correspondingAuthor, '[Sorumlu Yazar]');
  const type = orPlaceholder(input.manuscriptType, 'Özgün Araştırma Makalesi');
  const authors = (input.authors ?? '').trim();

  const salutation = 'Sayın Baş Editör,';

  const submission =
    `${authors.length > 0 ? `Diğer yazarlar (${authors}) ve kendi adıma, ` : 'Tüm yazarlar adına, '}` +
    `"${title}" başlıklı çalışmamızı ${journal} dergisinde bir ${type} olarak ` +
    `değerlendirilmek üzere sunmaktan memnuniyet duyuyorum.`;

  const significance = coverSignificanceTr(input.keyFinding);

  const statements =
    'Bu çalışmanın özgün olduğunu, daha önce hiçbir yerde yayımlanmadığını ve ' +
    'başka bir dergide değerlendirme sürecinde bulunmadığını beyan ederiz. Tüm ' +
    'yazarlar gönderilen sürümü okuyup onaylamış, dergiye sunulmasını kabul etmiş ' +
    've herhangi bir çıkar çatışması bulunmadığını bildirmiştir. Çalışma derginin ' +
    'etik ilkelerine uygun olarak hazırlanmış ve tüm kaynaklara usulüne uygun ' +
    'şekilde atıfta bulunulmuştur.';

  const closing =
    'Çalışmamızı değerlendirmeye aldığınız için teşekkür ederiz. Hakem ' +
    'görüşlerini beklemekte olup, ihtiyaç duyabileceğiniz her türlü ek bilgiyi ' +
    'sağlamaktan memnuniyet duyarız.';

  const signoff = `Saygılarımla,\n${author}\nSorumlu Yazar`;

  return joinParagraphs([salutation, submission, significance, statements, closing, signoff]);
}

function coverSignificanceEn(keyFinding: string | undefined): string {
  const finding = (keyFinding ?? '').trim();
  if (finding.length === 0) {
    return (
      'We believe this work will be of interest to your readership, as it addresses ' +
      'an important question in the field and offers findings with both scientific ' +
      'and practical relevance.'
    );
  }
  const sentence = `${stripTrailingPunctuation(tidy(finding))}.`;
  return (
    `The central contribution of our study is as follows: ${sentence} ` +
    'We believe these findings make a timely and meaningful contribution to the field ' +
    'and will be of interest to your readership.'
  );
}

function coverSignificanceTr(keyFinding: string | undefined): string {
  const finding = (keyFinding ?? '').trim();
  if (finding.length === 0) {
    return (
      'Bu çalışmanın, alandaki önemli bir soruyu ele alması ve hem bilimsel hem de ' +
      'uygulamaya yönelik değer taşıyan bulgular sunması nedeniyle okuyucularınızın ' +
      'ilgisini çekeceğine inanıyoruz.'
    );
  }
  const sentence = `${stripTrailingPunctuation(tidy(finding))}.`;
  return (
    `Çalışmamızın temel katkısı şu şekildedir: ${sentence} ` +
    'Bu bulguların alana güncel ve anlamlı bir katkı sunduğuna ve okuyucularınızın ' +
    'ilgisini çekeceğine inanıyoruz.'
  );
}

/** Pick "an"/"a" for English article-type phrasing based on the leading sound. */
function articleFor(word: string): string {
  return /^[aeiou]/i.test(word.trim()) ? 'an' : 'a';
}

// ---------------------------------------------------------------------------
// Response to reviewers
// ---------------------------------------------------------------------------

export interface ReviewerPoint {
  id: number;
  comment: string;
}

export interface ResponseLetterInput {
  journalName?: string;
  manuscriptTitle?: string;
  points: ReviewerPoint[]; // reviewer comments to scaffold responses for
  lang: LetterLang;
}

export function buildResponseToReviewers(input: ResponseLetterInput): string {
  return input.lang === 'tr'
    ? buildResponseTr(input)
    : buildResponseEn(input);
}

function buildResponseEn(input: ResponseLetterInput): string {
  const title = (input.manuscriptTitle ?? '').trim();
  const titleClause = title.length > 0 ? ` for our manuscript "${title}"` : '';

  const intro =
    `We thank the editor and the reviewers for their careful reading and constructive ` +
    `comments${titleClause}. We have revised the manuscript accordingly and respond to ` +
    `each point below. All changes are highlighted in the revised manuscript for ease of review.`;

  const body =
    input.points.length > 0
      ? input.points
          .map((p) => {
            const comment = orPlaceholder(p.comment, '[Reviewer comment]');
            return (
              `**Comment ${p.id}:** ${comment}\n\n` +
              `**Response:** [TODO author response]`
            );
          })
          .join('\n\n')
      : '**Comment 1:** [Paste reviewer comment]\n\n**Response:** [TODO author response]';

  return joinParagraphs([intro, body]);
}

function buildResponseTr(input: ResponseLetterInput): string {
  const title = (input.manuscriptTitle ?? '').trim();
  const titleClause = title.length > 0 ? ` "${title}" başlıklı makalemize ilişkin` : '';

  const intro =
    `Editöre ve hakemlere${titleClause} yaptıkları özenli inceleme ve yapıcı ` +
    `yorumlar için teşekkür ederiz. Makaleyi bu doğrultuda revize ettik ve her bir ` +
    `noktaya aşağıda yanıt verdik. Yapılan tüm değişiklikler, incelemeyi kolaylaştırmak ` +
    `amacıyla revize edilmiş makalede vurgulanmıştır.`;

  const body =
    input.points.length > 0
      ? input.points
          .map((p) => {
            const comment = orPlaceholder(p.comment, '[Hakem yorumu]');
            return (
              `**Yorum ${p.id}:** ${comment}\n\n` +
              `**Yanıt:** [TODO yazar yanıtı]`
            );
          })
          .join('\n\n')
      : '**Yorum 1:** [Hakem yorumunu yapıştırın]\n\n**Yanıt:** [TODO yazar yanıtı]';

  return joinParagraphs([intro, body]);
}

// ---------------------------------------------------------------------------
// Author contributions (CRediT-style)
// ---------------------------------------------------------------------------

export interface ContributionInput {
  authors: string[];
  lang: LetterLang;
}

export function buildAuthorContributions(input: ContributionInput): string {
  return input.lang === 'tr'
    ? buildContributionsTr(input)
    : buildContributionsEn(input);
}

function cleanAuthorList(authors: ReadonlyArray<string>): string[] {
  return authors.map((a) => a.trim()).filter((a) => a.length > 0);
}

const CREDIT_ROLES_EN =
  'Conceptualization, Methodology, Software, Validation, Formal analysis, ' +
  'Investigation, Resources, Data curation, Writing – original draft, ' +
  'Writing – review & editing, Visualization, Supervision, Project administration, ' +
  'Funding acquisition';

const CREDIT_ROLES_TR =
  'Kavramsallaştırma, Metodoloji, Yazılım, Doğrulama, Biçimsel analiz, ' +
  'Araştırma, Kaynaklar, Veri düzenleme, Yazım – ilk taslak, ' +
  'Yazım – inceleme ve düzenleme, Görselleştirme, Süpervizyon, Proje yönetimi, ' +
  'Fon temini';

function buildContributionsEn(input: ContributionInput): string {
  const authors = cleanAuthorList(input.authors);

  const intro =
    'Author contributions are described below following the CRediT (Contributor ' +
    `Roles Taxonomy) framework. The recognized roles are: ${CREDIT_ROLES_EN}.`;

  if (authors.length === 0) {
    return joinParagraphs([
      intro,
      '[Author Name]: [TODO assign CRediT roles, e.g. Conceptualization; Methodology; Writing – original draft].',
    ]);
  }

  const lines = authors
    .map((name) => `${name}: [TODO assign CRediT roles, e.g. Conceptualization; Methodology].`)
    .join('\n');

  return joinParagraphs([intro, lines]);
}

function buildContributionsTr(input: ContributionInput): string {
  const authors = cleanAuthorList(input.authors);

  const intro =
    'Yazar katkıları, CRediT (Katkı Sağlayan Rolleri Taksonomisi) çerçevesine göre ' +
    `aşağıda belirtilmiştir. Tanımlı roller şunlardır: ${CREDIT_ROLES_TR}.`;

  if (authors.length === 0) {
    return joinParagraphs([
      intro,
      '[Yazar Adı]: [TODO CRediT rollerini atayın, örn. Kavramsallaştırma; Metodoloji; Yazım – ilk taslak].',
    ]);
  }

  const lines = authors
    .map((name) => `${name}: [TODO CRediT rollerini atayın, örn. Kavramsallaştırma; Metodoloji].`)
    .join('\n');

  return joinParagraphs([intro, lines]);
}

// ---------------------------------------------------------------------------
// Conflict of interest
// ---------------------------------------------------------------------------

export interface ConflictOfInterestInput {
  authors?: string[];
  hasConflict: boolean;
  lang: LetterLang;
}

export function buildConflictOfInterest(input: ConflictOfInterestInput): string {
  return input.lang === 'tr'
    ? buildConflictTr(input)
    : buildConflictEn(input);
}

function authorSubjectEn(authors: ReadonlyArray<string> | undefined): string {
  const list = cleanAuthorList(authors ?? []);
  if (list.length === 0) return 'The authors';
  if (list.length === 1) return `The author (${list[0]})`;
  return `The authors (${list.join(', ')})`;
}

function authorSubjectTr(authors: ReadonlyArray<string> | undefined): string {
  const list = cleanAuthorList(authors ?? []);
  if (list.length === 0) return 'Yazarlar';
  if (list.length === 1) return `Yazar (${list[0]})`;
  return `Yazarlar (${list.join(', ')})`;
}

function buildConflictEn(input: ConflictOfInterestInput): string {
  const subject = authorSubjectEn(input.authors);
  if (!input.hasConflict) {
    return `${subject} declare no conflict of interest.`;
  }
  return `${subject} declare the following conflicts of interest: [TODO describe the relevant financial or personal relationships].`;
}

function buildConflictTr(input: ConflictOfInterestInput): string {
  const subject = authorSubjectTr(input.authors);
  if (!input.hasConflict) {
    return `${subject} herhangi bir çıkar çatışması bulunmadığını beyan eder.`;
  }
  return `${subject} aşağıdaki çıkar çatışmalarını beyan eder: [TODO ilgili finansal veya kişisel ilişkileri açıklayın].`;
}

// ---------------------------------------------------------------------------
// Parsing pasted reviewer text into numbered points
// ---------------------------------------------------------------------------

/**
 * Split a pasted reviewer block into sequential numbered points.
 *
 * Recognized point boundaries:
 *  - a line beginning with a number + separator: "1.", "1)", "(1)", "1 -", "1:"
 *  - a labelled comment header: "Comment 3:", "Reviewer 1, point 2:", "Point 4 -"
 *  - otherwise, paragraphs separated by one or more blank lines
 *
 * IDs are always re-sequenced from 1 regardless of the source numbering, and
 * empty fragments are dropped. Robust to messy / inconsistent input.
 */
export function parseReviewerComments(raw: string): ReviewerPoint[] {
  const normalized = (raw ?? '').replace(/\r\n?/g, '\n').trim();
  if (normalized.length === 0) return [];

  const headerLine = headerLineMatcher();
  const lines = normalized.split('\n');
  const hasExplicitMarkers = lines.some((line) => headerLine.test(line.trim()));

  const fragments = hasExplicitMarkers
    ? splitByMarkers(lines)
    : splitByBlankLines(normalized);

  return fragments
    .map((fragment) => tidy(stripLeadingMarker(fragment)))
    .filter((fragment) => fragment.length > 0)
    .map((comment, index) => ({ id: index + 1, comment }));
}

/** Matches a marker at the START of a (trimmed) line. */
function headerLineMatcher(): RegExp {
  return /^(?:\(?\d{1,3}\)?[.):\-–—]|comment\b|reviewer\b|point\b)/i;
}

/** Matches a leading marker we strip from the front of a captured fragment. */
function leadingMarkerMatcher(): RegExp {
  // e.g. "1.", "1)", "(1)", "1 -", "Comment 2:", "Reviewer 1, point 3 -", "Point 4:"
  return /^\s*(?:\(?\d{1,3}\)?[.):\-–—]+\s*|(?:comment|point)\s*\d{0,3}\s*[.):\-–—]*\s*|reviewer\s*\d{0,3}\s*(?:,\s*point\s*\d{0,3}\s*)?[.):\-–—]*\s*)/i;
}

function stripLeadingMarker(fragment: string): string {
  return fragment.replace(leadingMarkerMatcher(), '');
}

/** Group lines into fragments, starting a new fragment at each header line. */
function splitByMarkers(lines: ReadonlyArray<string>): string[] {
  const headerLine = headerLineMatcher();
  const fragments: string[] = [];
  let current: string[] = [];

  const flush = (): void => {
    if (current.length > 0) {
      fragments.push(current.join(' '));
      current = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) {
      flush();
      continue;
    }
    if (headerLine.test(line)) {
      flush();
    }
    current.push(line);
  }
  flush();
  return fragments;
}

/** Split on runs of one or more blank lines. */
function splitByBlankLines(text: string): string[] {
  return text.split(/\n\s*\n+/);
}
