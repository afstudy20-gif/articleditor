/**
 * Reporting-guideline checklists (CONSORT 2010 for randomized trials, STROBE
 * for observational studies). Each item carries the standard short descriptor
 * in English and Turkish plus a few lowercase keyword tokens used only as a
 * heuristic hint for "looks addressed" — never as a hard claim.
 *
 * Item texts are condensed paraphrases of the published checklists, intended as
 * an authoring aid; authors remain responsible for the official wording.
 */

export type GuidelineId = 'consort' | 'strobe';

export interface ChecklistItem {
  /** Stable id, e.g. "1a" / "13". */
  id: string;
  /** Section grouping label key (en/tr resolved in the item's section field). */
  section: string;
  en: string;
  tr: string;
  /** Lowercase tokens; any match in the manuscript text flags the item as likely addressed. */
  keywords: string[];
}

export interface Guideline {
  id: GuidelineId;
  name: string;
  description: { en: string; tr: string };
  sections: { key: string; en: string; tr: string }[];
  items: ChecklistItem[];
}

const CONSORT: Guideline = {
  id: 'consort',
  name: 'CONSORT 2010',
  description: {
    en: 'Reporting checklist for randomized controlled trials.',
    tr: 'Randomize kontrollü çalışmalar için raporlama kontrol listesi.',
  },
  sections: [
    { key: 'title', en: 'Title and abstract', tr: 'Başlık ve özet' },
    { key: 'intro', en: 'Introduction', tr: 'Giriş' },
    { key: 'methods', en: 'Methods', tr: 'Yöntem' },
    { key: 'results', en: 'Results', tr: 'Bulgular' },
    { key: 'discussion', en: 'Discussion', tr: 'Tartışma' },
    { key: 'other', en: 'Other information', tr: 'Diğer bilgiler' },
  ],
  items: [
    { id: '1a', section: 'title', en: 'Identification as a randomized trial in the title.', tr: 'Başlıkta randomize çalışma olarak tanımlama.', keywords: ['randomiz', 'randomize'] },
    { id: '1b', section: 'title', en: 'Structured summary of trial design, methods, results, and conclusions.', tr: 'Tasarım, yöntem, bulgular ve sonuçların yapılandırılmış özeti.', keywords: ['abstract', 'özet', 'structured'] },
    { id: '2a', section: 'intro', en: 'Scientific background and rationale.', tr: 'Bilimsel arka plan ve gerekçe.', keywords: ['background', 'rationale', 'arka plan', 'gerekçe'] },
    { id: '2b', section: 'intro', en: 'Specific objectives or hypotheses.', tr: 'Belirli amaçlar veya hipotezler.', keywords: ['objective', 'hypothes', 'amaç', 'hipotez'] },
    { id: '3a', section: 'methods', en: 'Description of trial design (e.g. parallel, factorial) including allocation ratio.', tr: 'Çalışma tasarımı (paralel, faktöriyel vb.) ve dağılım oranı.', keywords: ['trial design', 'parallel', 'allocation ratio', 'tasarım'] },
    { id: '3b', section: 'methods', en: 'Important changes to methods after trial commencement, with reasons.', tr: 'Çalışma başladıktan sonra yöntemlerdeki önemli değişiklikler ve nedenleri.', keywords: ['amendment', 'changes to methods', 'protocol change'] },
    { id: '4a', section: 'methods', en: 'Eligibility criteria for participants.', tr: 'Katılımcılar için uygunluk ölçütleri.', keywords: ['eligibility', 'inclusion', 'exclusion', 'uygunluk', 'dahil', 'dışlama'] },
    { id: '4b', section: 'methods', en: 'Settings and locations where the data were collected.', tr: 'Verilerin toplandığı yer ve ortamlar.', keywords: ['setting', 'centre', 'center', 'hospital', 'merkez', 'hastane'] },
    { id: '5', section: 'methods', en: 'Interventions for each group with sufficient detail to allow replication.', tr: 'Her grup için tekrar edilebilirliği sağlayacak ayrıntıda girişimler.', keywords: ['intervention', 'treatment', 'dose', 'girişim', 'tedavi', 'doz'] },
    { id: '6a', section: 'methods', en: 'Completely defined pre-specified primary and secondary outcome measures.', tr: 'Önceden tanımlanmış birincil ve ikincil sonuç ölçütleri.', keywords: ['primary outcome', 'secondary outcome', 'endpoint', 'sonlanım', 'birincil'] },
    { id: '6b', section: 'methods', en: 'Any changes to outcomes after the trial commenced, with reasons.', tr: 'Çalışma başladıktan sonra sonuç ölçütlerindeki değişiklikler ve nedenleri.', keywords: ['outcome change', 'changed outcome'] },
    { id: '7a', section: 'methods', en: 'How sample size was determined.', tr: 'Örneklem büyüklüğünün nasıl belirlendiği.', keywords: ['sample size', 'power', 'örneklem', 'güç analiz'] },
    { id: '7b', section: 'methods', en: 'Explanation of any interim analyses and stopping guidelines.', tr: 'Ara analizler ve durdurma kuralları.', keywords: ['interim', 'stopping', 'ara analiz'] },
    { id: '8a', section: 'methods', en: 'Method used to generate the random allocation sequence.', tr: 'Rastgele atama dizisinin oluşturulma yöntemi.', keywords: ['random sequence', 'computer-generated', 'random number', 'atama dizisi'] },
    { id: '8b', section: 'methods', en: 'Type of randomization; details of any restriction (e.g. blocking).', tr: 'Randomizasyon türü; kısıtlama (örn. bloklama) ayrıntıları.', keywords: ['block', 'stratif', 'bloklama', 'tabakal'] },
    { id: '9', section: 'methods', en: 'Mechanism used to implement the random allocation sequence (concealment).', tr: 'Atama gizliliğini sağlayan mekanizma.', keywords: ['allocation concealment', 'concealed', 'sealed envelope', 'gizlilik'] },
    { id: '10', section: 'methods', en: 'Who generated the sequence, enrolled participants, and assigned them.', tr: 'Diziyi oluşturan, katılımcıları kaydeden ve atayanlar.', keywords: ['enrol', 'assigned', 'kayıt', 'atadı'] },
    { id: '11a', section: 'methods', en: 'Blinding — who was blinded after assignment and how.', tr: 'Körleme — atamadan sonra kimlerin nasıl körlendiği.', keywords: ['blind', 'mask', 'körle', 'kör'] },
    { id: '11b', section: 'methods', en: 'If relevant, description of the similarity of interventions.', tr: 'Gerekliyse girişimlerin benzerliğinin tanımı.', keywords: ['placebo', 'identical', 'benzer', 'plasebo'] },
    { id: '12a', section: 'methods', en: 'Statistical methods used to compare groups for primary and secondary outcomes.', tr: 'Birincil ve ikincil sonuçlar için istatistiksel karşılaştırma yöntemleri.', keywords: ['statistical', 'analysis', 'regression', 'test', 'istatistik', 'analiz'] },
    { id: '12b', section: 'methods', en: 'Methods for additional analyses (subgroup, adjusted).', tr: 'Ek analizler (alt grup, düzeltilmiş) için yöntemler.', keywords: ['subgroup', 'adjusted', 'alt grup', 'düzeltilmiş'] },
    { id: '13a', section: 'results', en: 'Numbers of participants randomized, receiving treatment, and analyzed (flow).', tr: 'Randomize edilen, tedavi alan ve analiz edilen katılımcı sayıları (akış).', keywords: ['flow diagram', 'consort diagram', 'randomized', 'akış'] },
    { id: '13b', section: 'results', en: 'Losses and exclusions after randomization, with reasons.', tr: 'Randomizasyon sonrası kayıplar ve dışlamalar, nedenleriyle.', keywords: ['lost to follow', 'excluded', 'withdraw', 'kayıp', 'takipten'] },
    { id: '14a', section: 'results', en: 'Dates defining the periods of recruitment and follow-up.', tr: 'Katılım ve izlem dönemlerini tanımlayan tarihler.', keywords: ['recruitment', 'follow-up period', 'between', 'izlem', 'tarih'] },
    { id: '14b', section: 'results', en: 'Why the trial ended or was stopped.', tr: 'Çalışmanın neden sona erdiği veya durdurulduğu.', keywords: ['trial ended', 'stopped', 'terminated', 'sonland'] },
    { id: '15', section: 'results', en: 'A table showing baseline demographic and clinical characteristics for each group.', tr: 'Her grup için başlangıç demografik ve klinik özellik tablosu.', keywords: ['baseline', 'characteristics', 'table 1', 'başlangıç', 'demografik'] },
    { id: '16', section: 'results', en: 'Number of participants (denominator) in each group included in each analysis.', tr: 'Her analizde her grupta yer alan katılımcı sayısı.', keywords: ['analyzed', 'intention-to-treat', 'per protocol', 'analiz edilen'] },
    { id: '17a', section: 'results', en: 'For each outcome, results for each group and the estimated effect size and precision (e.g. 95% CI).', tr: 'Her sonuç için grup sonuçları, etki büyüklüğü ve kesinlik (örn. %95 GA).', keywords: ['confidence interval', '95%', 'effect size', 'güven aralığı'] },
    { id: '17b', section: 'results', en: 'For binary outcomes, both absolute and relative effect sizes are recommended.', tr: 'İkili sonuçlar için hem mutlak hem göreli etki büyüklükleri önerilir.', keywords: ['relative risk', 'odds ratio', 'absolute', 'rölatif', 'oran'] },
    { id: '18', section: 'results', en: 'Results of any other analyses performed, distinguishing pre-specified from exploratory.', tr: 'Yapılan diğer analizlerin sonuçları; önceden belirlenmiş ile keşfedici ayrımı.', keywords: ['exploratory', 'sensitivity analysis', 'duyarlılık', 'keşfedici'] },
    { id: '19', section: 'results', en: 'All important harms or unintended effects in each group.', tr: 'Her grupta önemli zararlar veya istenmeyen etkiler.', keywords: ['adverse', 'harm', 'side effect', 'safety', 'yan etki', 'advers'] },
    { id: '20', section: 'discussion', en: 'Trial limitations, addressing sources of potential bias and imprecision.', tr: 'Çalışma kısıtlılıkları; olası yanlılık ve kesinlik kaynakları.', keywords: ['limitation', 'bias', 'kısıtlıl', 'yanlıl'] },
    { id: '21', section: 'discussion', en: 'Generalizability (external validity) of the trial findings.', tr: 'Bulguların genellenebilirliği (dış geçerlilik).', keywords: ['generaliz', 'external validity', 'genellenebilir'] },
    { id: '22', section: 'discussion', en: 'Interpretation consistent with results, balancing benefits and harms.', tr: 'Sonuçlarla tutarlı, yarar ve zararı dengeleyen yorum.', keywords: ['interpretation', 'in conclusion', 'yorum', 'sonuç olarak'] },
    { id: '23', section: 'other', en: 'Registration number and name of trial registry.', tr: 'Çalışma kayıt numarası ve kayıt sistemi adı.', keywords: ['registration', 'nct', 'clinicaltrials', 'registry', 'kayıt numar'] },
    { id: '24', section: 'other', en: 'Where the full trial protocol can be accessed, if available.', tr: 'Tam protokole erişim yeri (varsa).', keywords: ['protocol', 'available', 'protokol'] },
    { id: '25', section: 'other', en: 'Sources of funding and other support; role of funders.', tr: 'Fon kaynakları ve diğer destekler; fon sağlayıcıların rolü.', keywords: ['funding', 'supported by', 'grant', 'fon', 'destekl'] },
  ],
};

const STROBE: Guideline = {
  id: 'strobe',
  name: 'STROBE',
  description: {
    en: 'Reporting checklist for observational studies (cohort, case-control, cross-sectional).',
    tr: 'Gözlemsel çalışmalar (kohort, olgu-kontrol, kesitsel) için raporlama kontrol listesi.',
  },
  sections: [
    { key: 'title', en: 'Title and abstract', tr: 'Başlık ve özet' },
    { key: 'intro', en: 'Introduction', tr: 'Giriş' },
    { key: 'methods', en: 'Methods', tr: 'Yöntem' },
    { key: 'results', en: 'Results', tr: 'Bulgular' },
    { key: 'discussion', en: 'Discussion', tr: 'Tartışma' },
    { key: 'other', en: 'Other information', tr: 'Diğer bilgiler' },
  ],
  items: [
    { id: '1a', section: 'title', en: 'Indicate the study design with a commonly used term in the title or abstract.', tr: 'Başlık veya özette çalışma tasarımını yaygın bir terimle belirtin.', keywords: ['cohort', 'case-control', 'cross-sectional', 'kohort', 'olgu-kontrol', 'kesitsel'] },
    { id: '1b', section: 'title', en: 'Provide in the abstract an informative and balanced summary.', tr: 'Özette bilgilendirici ve dengeli bir özet sunun.', keywords: ['abstract', 'özet', 'summary'] },
    { id: '2', section: 'intro', en: 'Explain the scientific background and rationale for the investigation.', tr: 'Araştırmanın bilimsel arka planı ve gerekçesi.', keywords: ['background', 'rationale', 'arka plan', 'gerekçe'] },
    { id: '3', section: 'intro', en: 'State specific objectives, including any prespecified hypotheses.', tr: 'Belirli amaçlar ve önceden tanımlanmış hipotezler.', keywords: ['objective', 'hypothes', 'aim', 'amaç', 'hipotez'] },
    { id: '4', section: 'methods', en: 'Present key elements of study design early in the paper.', tr: 'Çalışma tasarımının temel öğelerini erken sunun.', keywords: ['study design', 'tasarım'] },
    { id: '5', section: 'methods', en: 'Describe the setting, locations, and relevant dates (recruitment, exposure, follow-up).', tr: 'Ortam, yer ve ilgili tarihler (katılım, maruziyet, izlem).', keywords: ['setting', 'recruitment', 'between', 'follow-up', 'merkez', 'izlem', 'tarih'] },
    { id: '6', section: 'methods', en: 'Eligibility criteria, sources, and methods of selection of participants.', tr: 'Uygunluk ölçütleri, kaynaklar ve katılımcı seçim yöntemleri.', keywords: ['eligibility', 'inclusion', 'exclusion', 'participants', 'uygunluk', 'dahil', 'dışlama'] },
    { id: '7', section: 'methods', en: 'Clearly define all outcomes, exposures, predictors, confounders, and effect modifiers.', tr: 'Sonuçlar, maruziyetler, öngörücüler, karıştırıcılar ve etki değiştiricileri tanımlayın.', keywords: ['outcome', 'exposure', 'confounder', 'predictor', 'sonuç', 'maruziyet', 'karıştırıcı'] },
    { id: '8', section: 'methods', en: 'For each variable, give sources of data and details of assessment methods.', tr: 'Her değişken için veri kaynakları ve ölçüm yöntemleri.', keywords: ['data source', 'measurement', 'assessment', 'veri kaynağı', 'ölçüm'] },
    { id: '9', section: 'methods', en: 'Describe any efforts to address potential sources of bias.', tr: 'Olası yanlılık kaynaklarını ele alma çabaları.', keywords: ['bias', 'yanlıl'] },
    { id: '10', section: 'methods', en: 'Explain how the study size was arrived at.', tr: 'Çalışma büyüklüğünün nasıl belirlendiği.', keywords: ['study size', 'sample size', 'power', 'örneklem', 'güç'] },
    { id: '11', section: 'methods', en: 'Explain how quantitative variables were handled (groupings, why).', tr: 'Nicel değişkenlerin nasıl ele alındığı (gruplamalar ve nedenleri).', keywords: ['quantitative', 'categoriz', 'grouping', 'nicel', 'kategor'] },
    { id: '12', section: 'methods', en: 'Describe all statistical methods, including those used to control for confounding.', tr: 'Karıştırıcı kontrolü dahil tüm istatistiksel yöntemler.', keywords: ['statistical', 'regression', 'adjusted', 'model', 'istatistik', 'düzeltilmiş'] },
    { id: '13', section: 'results', en: 'Report numbers at each stage (eligible, examined, included, analyzed) — participants.', tr: 'Her aşamadaki sayılar (uygun, incelenen, dahil, analiz) — katılımcılar.', keywords: ['eligible', 'included', 'flow', 'participants', 'dahil edilen', 'akış'] },
    { id: '14', section: 'results', en: 'Give characteristics of study participants and information on exposures/confounders.', tr: 'Katılımcı özellikleri ve maruziyet/karıştırıcı bilgileri.', keywords: ['baseline', 'characteristics', 'table 1', 'başlangıç', 'demografik'] },
    { id: '15', section: 'results', en: 'Report numbers of outcome events or summary measures over time.', tr: 'Sonuç olay sayıları veya zaman içindeki özet ölçütler.', keywords: ['outcome', 'events', 'incidence', 'olay', 'insidans'] },
    { id: '16', section: 'results', en: 'Give unadjusted and confounder-adjusted estimates with precision (e.g. 95% CI).', tr: 'Düzeltilmemiş ve karıştırıcı düzeltilmiş tahminler, kesinlikle (örn. %95 GA).', keywords: ['confidence interval', '95%', 'adjusted', 'odds ratio', 'hazard', 'güven aralığı'] },
    { id: '17', section: 'results', en: 'Report other analyses done (subgroups, interactions, sensitivity).', tr: 'Yapılan diğer analizler (alt grup, etkileşim, duyarlılık).', keywords: ['subgroup', 'interaction', 'sensitivity', 'alt grup', 'duyarlılık'] },
    { id: '18', section: 'discussion', en: 'Summarize key results with reference to study objectives.', tr: 'Çalışma amaçlarına atıfla temel sonuçları özetleyin.', keywords: ['key results', 'main finding', 'temel sonuç', 'ana bulgu'] },
    { id: '19', section: 'discussion', en: 'Discuss limitations, sources of potential bias or imprecision.', tr: 'Kısıtlılıklar, olası yanlılık veya kesinlik kaynakları.', keywords: ['limitation', 'bias', 'kısıtlıl', 'yanlıl'] },
    { id: '20', section: 'discussion', en: 'Give a cautious overall interpretation considering objectives and other evidence.', tr: 'Amaçlar ve diğer kanıtları dikkate alan temkinli yorum.', keywords: ['interpretation', 'in conclusion', 'yorum', 'sonuç olarak'] },
    { id: '21', section: 'discussion', en: 'Discuss the generalizability (external validity) of the study results.', tr: 'Sonuçların genellenebilirliği (dış geçerlilik).', keywords: ['generaliz', 'external validity', 'genellenebilir'] },
    { id: '22', section: 'other', en: 'Give the source of funding and the role of the funders.', tr: 'Fon kaynağı ve fon sağlayıcıların rolü.', keywords: ['funding', 'grant', 'supported by', 'fon', 'destekl'] },
  ],
};

export const GUIDELINES: readonly Guideline[] = [CONSORT, STROBE];

export function getGuideline(id: GuidelineId): Guideline | undefined {
  return GUIDELINES.find((g) => g.id === id);
}
