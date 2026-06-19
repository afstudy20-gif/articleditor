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
// Copyright transfer / license-to-publish forms
// ---------------------------------------------------------------------------

/**
 * Common legal shapes a journal asks for. Most journal-specific forms are a
 * variant of one of these three; journal-unique wording is handled by saving
 * the journal's own text as a custom template with {{placeholders}}.
 */
export type CopyrightVariant = 'transfer' | 'license' | 'cc-by';

export interface CopyrightTransferInput {
  journalName: string;
  manuscriptTitle: string;
  authors: string[];
  correspondingAuthor?: string;
  /** Pre-filled date string; falls back to a fill-in slot. */
  date?: string;
  variant: CopyrightVariant;
  lang: LetterLang;
}

export function buildCopyrightTransfer(input: CopyrightTransferInput): string {
  return input.lang === 'tr'
    ? buildCopyrightTr(input)
    : buildCopyrightEn(input);
}

function signatureBlock(authors: ReadonlyArray<string>, dateLabel: string, nameLabel: string, signLabel: string, date: string): string {
  const list = cleanAuthorList(authors);
  const rows = (list.length > 0 ? list : [`[${nameLabel}]`]).map(
    (name) =>
      `${nameLabel}: ${name}\n${signLabel}: ____________________\n${dateLabel}: ${date}`,
  );
  return rows.join('\n\n');
}

function buildCopyrightEn(input: CopyrightTransferInput): string {
  const journal = orPlaceholder(input.journalName, '[Journal Name]');
  const title = orPlaceholder(input.manuscriptTitle, '[Manuscript Title]');
  const corr = orPlaceholder(input.correspondingAuthor, '[Corresponding Author]');
  const date = orPlaceholder(input.date, '____ / ____ / ________');
  const authorsLine = cleanAuthorList(input.authors).join(', ') || '[All Author Names]';

  const header =
    input.variant === 'cc-by'
      ? 'OPEN ACCESS LICENSE STATEMENT (CC BY 4.0)'
      : input.variant === 'license'
        ? 'EXCLUSIVE LICENSE TO PUBLISH'
        : 'COPYRIGHT TRANSFER AGREEMENT';

  const identification =
    `Manuscript title: "${title}"\n` +
    `Journal: ${journal}\n` +
    `Author(s): ${authorsLine}\n` +
    `Corresponding author: ${corr}`;

  const grant =
    input.variant === 'cc-by'
      ? 'The author(s) confirm that the article, upon acceptance, will be published ' +
        'open access under the terms of the Creative Commons Attribution (CC BY 4.0) ' +
        'license. The author(s) retain copyright; any third party may reuse the ' +
        'published material provided the original work is properly cited.'
      : input.variant === 'license'
        ? `The undersigned author(s) hereby grant ${journal} an exclusive, ` +
          'irrevocable, worldwide license to publish, reproduce, distribute, and ' +
          'display the above manuscript in all forms, languages, and media now ' +
          'known or later developed. Copyright remains with the author(s).'
        : `The undersigned author(s) hereby transfer and assign to ${journal} all ` +
          'copyright in and to the above manuscript, including the exclusive right ' +
          'to publish, reproduce, distribute, translate, and display the work in ' +
          'all forms, languages, and media now known or later developed, effective ' +
          'upon acceptance for publication.';

  const warranties =
    'The author(s) warrant that the manuscript is original, has not been published ' +
    'previously, is not under consideration elsewhere, contains nothing unlawful or ' +
    'defamatory, does not infringe any third-party rights, and that all listed ' +
    'authors have made substantial contributions, approved the submitted version, ' +
    'and agreed to this statement. Written permission has been obtained for any ' +
    'previously published material reproduced in the manuscript.';

  const retained =
    input.variant === 'transfer'
      ? 'The author(s) retain the right to use the work for non-commercial personal ' +
        'and academic purposes (teaching, theses, institutional repositories, and ' +
        'sharing with colleagues), provided the published source is acknowledged.'
      : '';

  const signatures = signatureBlock(input.authors, 'Date', 'Name', 'Signature', date);

  return joinParagraphs([header, identification, grant, warranties, retained, 'SIGNATURES', signatures]);
}

function buildCopyrightTr(input: CopyrightTransferInput): string {
  const journal = orPlaceholder(input.journalName, '[Dergi Adı]');
  const title = orPlaceholder(input.manuscriptTitle, '[Makale Başlığı]');
  const corr = orPlaceholder(input.correspondingAuthor, '[Sorumlu Yazar]');
  const date = orPlaceholder(input.date, '____ / ____ / ________');
  const authorsLine = cleanAuthorList(input.authors).join(', ') || '[Tüm Yazar Adları]';

  const header =
    input.variant === 'cc-by'
      ? 'AÇIK ERİŞİM LİSANS BEYANI (CC BY 4.0)'
      : input.variant === 'license'
        ? 'MÜNHASIR YAYIN LİSANSI SÖZLEŞMESİ'
        : 'TELİF HAKKI DEVİR SÖZLEŞMESİ';

  const identification =
    `Makale başlığı: "${title}"\n` +
    `Dergi: ${journal}\n` +
    `Yazar(lar): ${authorsLine}\n` +
    `Sorumlu yazar: ${corr}`;

  const grant =
    input.variant === 'cc-by'
      ? 'Yazar(lar), makalenin kabul edilmesi halinde Creative Commons Atıf ' +
        '(CC BY 4.0) lisansı kapsamında açık erişimli olarak yayımlanacağını kabul ' +
        'eder. Telif hakkı yazar(lar)da kalır; yayımlanan içerik, esere usulüne ' +
        'uygun atıf yapılması koşuluyla üçüncü kişilerce yeniden kullanılabilir.'
      : input.variant === 'license'
        ? `Aşağıda imzası bulunan yazar(lar), yukarıda belirtilen makalenin bilinen ` +
          `ve ileride geliştirilecek tüm biçim, dil ve ortamlarda yayımlanması, ` +
          `çoğaltılması, dağıtılması ve görüntülenmesi için ${journal} dergisine ` +
          'münhasır, gayrikabili rücu ve dünya çapında bir yayın lisansı verir. ' +
          'Telif hakkı yazar(lar)da kalır.'
        : `Aşağıda imzası bulunan yazar(lar), yukarıda belirtilen makaleye ilişkin ` +
          `tüm telif haklarını; eserin bilinen ve ileride geliştirilecek tüm biçim, ` +
          `dil ve ortamlarda yayımlanması, çoğaltılması, dağıtılması, çevrilmesi ve ` +
          `görüntülenmesine ilişkin münhasır hakları da kapsayacak şekilde, yayına ` +
          `kabul edildiği andan itibaren geçerli olmak üzere ${journal} dergisine ` +
          'devreder.';

  const warranties =
    'Yazar(lar); makalenin özgün olduğunu, daha önce yayımlanmadığını, başka bir ' +
    'yerde değerlendirme sürecinde bulunmadığını, hukuka aykırı veya hakaret içeren ' +
    'bir unsur taşımadığını, üçüncü kişilerin haklarını ihlal etmediğini; tüm ' +
    'yazarların çalışmaya önemli katkı sağladığını, gönderilen sürümü onayladığını ' +
    've bu beyanı kabul ettiğini taahhüt eder. Makalede yer alan, daha önce ' +
    'yayımlanmış her türlü materyal için yazılı izin alınmıştır.';

  const retained =
    input.variant === 'transfer'
      ? 'Yazar(lar); yayımlanan kaynağa atıf yapılması koşuluyla, eseri ticari ' +
        'olmayan kişisel ve akademik amaçlarla (eğitim, tez, kurumsal arşiv ve ' +
        'meslektaşlarla paylaşım) kullanma hakkını saklı tutar.'
      : '';

  const signatures = signatureBlock(input.authors, 'Tarih', 'Ad Soyad', 'İmza', date);

  return joinParagraphs([header, identification, grant, warranties, retained, 'İMZALAR', signatures]);
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

// ---------------------------------------------------------------------------
// Title Page Template
// ---------------------------------------------------------------------------

export interface TitlePageAuthor {
  name: string;
  email?: string;
  orcid?: string;
  institution?: string;
}

export interface TitlePageInput {
  manuscriptTitle: string;
  runningTitle?: string;
  authorsStr?: string;
  authors?: TitlePageAuthor[];
  correspondingAuthor?: string;
  correspondingEmail?: string;
  correspondingAddress?: string;
  orcid?: string;
  abstractWordCount?: string;
  manuscriptWordCount?: string;
  figuresCount?: string;
  tablesCount?: string;
  conflictOfInterest?: string;
  funding?: string;
  acknowledgements?: string;
  lang: LetterLang;
}

export function buildTitlePage(input: TitlePageInput): string {
  return input.lang === 'tr'
    ? buildTitlePageTr(input)
    : buildTitlePageEn(input);
}

const SUPERSCRIPT_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

/** Render a positive integer as Unicode superscript (1 → ¹, 12 → ¹²). */
function superscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUPERSCRIPT_DIGITS[Number(d)] ?? d)
    .join('');
}

function formatTitlePageAuthors(
  authors: TitlePageAuthor[] | undefined,
  lang: LetterLang,
): string {
  const list = (authors ?? []).filter((a) => a.name.trim().length > 0);
  if (list.length === 0) return '';

  const namesLine = list.map((a, idx) => `${a.name}${superscript(idx + 1)}`).join(', ');

  const affiliations = list
    .map((a, idx) => {
      const parts = [
        a.institution?.trim(),
        a.email?.trim()
          ? lang === 'tr'
            ? `E-posta: ${a.email.trim()}`
            : `Email: ${a.email.trim()}`
          : '',
        a.orcid?.trim() ? `ORCID: ${a.orcid.trim()}` : '',
      ].filter(Boolean);
      const body = parts.length > 0 ? parts.join(', ') : (lang === 'tr' ? '[Kurum]' : '[Institution]');
      return `${idx + 1} ${body}`;
    })
    .join('\n');

  return `${namesLine}\n\n${affiliations}`;
}

function buildTitlePageEn(input: TitlePageInput): string {
  const title = orPlaceholder(input.manuscriptTitle, '[Manuscript Title]');
  const running = orPlaceholder(input.runningTitle, '[Running Title]');
  const authors =
    input.authors && input.authors.some((a) => a.name.trim())
      ? formatTitlePageAuthors(input.authors, 'en')
      : orPlaceholder(input.authorsStr, '[Author Names and Affiliations]');
  const corrAuthor = orPlaceholder(input.correspondingAuthor, '[Corresponding Author Name]');
  const corrEmail = orPlaceholder(input.correspondingEmail, '[Email Address]');
  const corrAddress = orPlaceholder(input.correspondingAddress, '[Full Mailing Address]');
  const orcid = orPlaceholder(input.orcid, '[ORCID]');
  
  const absWords = orPlaceholder(input.abstractWordCount, '[Count]');
  const msWords = orPlaceholder(input.manuscriptWordCount, '[Count]');
  const figs = orPlaceholder(input.figuresCount, '[Count]');
  const tbls = orPlaceholder(input.tablesCount, '[Count]');
  
  const conflict = orPlaceholder(input.conflictOfInterest, 'The authors declare no conflict of interest.');
  const funding = orPlaceholder(input.funding, 'This research received no external funding.');
  const ack = orPlaceholder(input.acknowledgements, 'None.');

  const header = `TITLE PAGE`;
  
  const mainTitleBlock = `Title: ${title}\nRunning Title: ${running}`;
  
  const authorBlock = `Authors:\n${authors}`;
  
  const corrBlock = `Corresponding Author:\nName: ${corrAuthor}\nAddress: ${corrAddress}\nEmail: ${corrEmail}\nORCID: ${orcid}`;
  
  const statsBlock = `Word Counts & Elements:\n- Abstract Word Count: ${absWords}\n- Manuscript Word Count: ${msWords}\n- Number of Figures: ${figs}\n- Number of Tables: ${tbls}`;
  
  const declarations = `Conflict of Interest:\n${conflict}\n\nFunding:\n${funding}\n\nAcknowledgements:\n${ack}`;

  return joinParagraphs([header, mainTitleBlock, authorBlock, corrBlock, statsBlock, declarations]);
}

function buildTitlePageTr(input: TitlePageInput): string {
  const title = orPlaceholder(input.manuscriptTitle, '[Makale Başlığı]');
  const running = orPlaceholder(input.runningTitle, '[Kısa Başlık]');
  const authors =
    input.authors && input.authors.some((a) => a.name.trim())
      ? formatTitlePageAuthors(input.authors, 'tr')
      : orPlaceholder(input.authorsStr, '[Yazar İsimleri ve Kurumları]');
  const corrAuthor = orPlaceholder(input.correspondingAuthor, '[Sorumlu Yazar Adı]');
  const corrEmail = orPlaceholder(input.correspondingEmail, '[E-posta Adresi]');
  const corrAddress = orPlaceholder(input.correspondingAddress, '[Açık Posta Adresi]');
  const orcid = orPlaceholder(input.orcid, '[ORCID]');
  
  const absWords = orPlaceholder(input.abstractWordCount, '[Adet]');
  const msWords = orPlaceholder(input.manuscriptWordCount, '[Adet]');
  const figs = orPlaceholder(input.figuresCount, '[Adet]');
  const tbls = orPlaceholder(input.tablesCount, '[Adet]');
  
  const conflict = orPlaceholder(input.conflictOfInterest, 'Yazarlar herhangi bir çıkar çatışması bulunmadığını beyan eder.');
  const funding = orPlaceholder(input.funding, 'Bu araştırma için herhangi bir dış fon alınmamıştır.');
  const ack = orPlaceholder(input.acknowledgements, 'Bulunmamaktadır.');

  const header = `BAŞLIK SAYFASI`;
  
  const mainTitleBlock = `Başlık: ${title}\nKısa Başlık: ${running}`;
  
  const authorBlock = `Yazarlar:\n${authors}`;
  
  const corrBlock = `Sorumlu Yazar:\nİsim: ${corrAuthor}\nAdres: ${corrAddress}\nE-posta: ${corrEmail}\nORCID: ${orcid}`;
  
  const statsBlock = `Kelime Sayıları ve Unsurlar:\n- Özet Kelime Sayısı: ${absWords}\n- Ana Metin Kelime Sayısı: ${msWords}\n- Şekil Sayısı: ${figs}\n- Tablo Sayısı: ${tbls}`;
  
  const declarations = `Çıkar Çatışması:\n${conflict}\n\nFinansal Destek:\n${funding}\n\nTeşekkür:\n${ack}`;

  return joinParagraphs([header, mainTitleBlock, authorBlock, corrBlock, statsBlock, declarations]);
}
