export type Lang = 'tr' | 'en';

export const APP_NAME = 'Article Editor';
export const APP_VERSION = '1.0.0';
export const APP_YEAR = '2026';
export const APP_AUTHOR = 'Dr. Yusuf Hoşoğlu';

type Dict = Record<string, string>;

const tr: Dict = {
  // Nav
  nav_workspace: 'Çalışma Alanı',
  nav_about: 'Hakkında',
  nav_privacy: 'Gizlilik',
  nav_tutorial: 'Eğitim',

  // Landing
  hero_title: 'Akademik makale yazımı ve EndNote dönüştürücü',
  hero_desc:
    'Düz metin numaralı atıfları aktif EndNote alan kodlarına dönüştür. Tarayıcı tabanlı editörle yaz, kaynakçanı yönet, Vancouver/APA/AMA/IEEE stillerinde dışa aktar.',
  hero_cta: 'Çalışma Alanını Aç',

  features_title: 'Özellikler',
  feat_convert: 'Word belgesi yükle veya metin yapıştır, kaynakça otomatik algılansın.',
  feat_lookup: 'CrossRef, OpenAlex ve PubMed taraması ile DOI, PMID ve özetleri zenginleştir.',
  feat_editor: 'TipTap tabanlı online editör, canlı atıf numaralandırma, multi-cite desteği.',
  feat_styles: 'Vancouver, APA, AMA, IEEE stilleri arasında geçiş, aktif EndNote .docx çıktısı.',
  feat_latex: 'LaTeX (.tex + .bib) bundle ile Overleaf/TeXLive uyumlu çıktı.',
  feat_endnote: 'EndNote XML, RIS, .enw, BibTeX import. Tarayıcı tabanlı, hızlı.',

  ecosystem_title: 'DrTR Tools Ekosistemi',
  ecosystem_desc: 'Dr. Yusuf Hoşoğlu tarafından geliştirilen ücretsiz klinik ve akademik araçlar.',

  // About
  about_title: 'Hakkında',
  about_version: 'Sürüm',
  about_author: 'Geliştirici',
  about_stack: 'Teknoloji',
  about_license: 'Lisans',
  about_license_value: 'Şahsi / klinik / akademik kullanım için ücretsiz',

  // Privacy
  privacy_title: 'Gizlilik',
  privacy_intro:
    'Article Editor tarayıcıda çalışan tek-kullanıcı bir uygulamadır. Verileriniz cihazınızdadır.',
  privacy_local_title: 'Tüm veriler yerel',
  privacy_local_desc:
    'Projeler, makale metinleri ve kaynakça kütüphaneniz tarayıcınızın IndexedDB veritabanında saklanır. Sunucumuza yüklenmez.',
  privacy_lookup_title: 'DOI / PubMed / OpenAlex aramaları',
  privacy_lookup_desc:
    'Bir referansın DOI bilgisini taradığınızda yalnızca başlık, yazar adı ve yıl bilgisi public CrossRef/OpenAlex/PubMed API uç noktalarına gönderilir. Tam metin asla gönderilmez. Yanıtlar sunucumuzdan geçmeden tarayıcıya döner.',
  privacy_ai_title: 'Opsiyonel AI özelliği',
  privacy_ai_desc:
    'AI ile metin genişletme, kısaltma veya stil dönüştürme özelliği etkinleştirilirse kendi Anthropic veya OpenAI API anahtarınızı kullanırsınız. Seçili metin doğrudan o sağlayıcıya gider. Anahtar tarayıcınızda saklanır, sunucumuza yüklenmez.',
  privacy_export_title: 'Çıktılar',
  privacy_export_desc:
    'Tüm dışa aktarma (.docx, .ris, LaTeX, JSON yedek) tarayıcınızda oluşturulur ve indirilir.',
  privacy_no_tracking: 'Çerez, takip veya analitik kullanılmaz.',

  // Tutorial
  tutorial_title: 'Eğitim',
  tutorial_step1_title: '1. Belgenizi yükleyin veya yapıştırın',
  tutorial_step1_desc:
    "Çalışma Alanında 'Yükle' veya 'Yapıştır' sekmesinden başlayın. Kaynakça otomatik algılanır.",
  tutorial_step2_title: '2. DOI taraması yapın',
  tutorial_step2_desc:
    "'Tümünü DOI tara' butonu CrossRef ve PubMed üzerinden eksik DOI, PMID ve özetleri doldurur.",
  tutorial_step3_title: '3. Editörde yazın',
  tutorial_step3_desc:
    'Atıf kütüphanesinden referansları sürükle/tıkla. Multi-cite için checkbox ile çoklu seçim yap.',
  tutorial_step4_title: '4. Stil seçin',
  tutorial_step4_desc:
    'Vancouver, APA, AMA veya IEEE stilleri arasında geçiş yapın. Atıflar ve kaynakça canlı yenilenir.',
  tutorial_step5_title: '5. Dışa aktarın',
  tutorial_step5_desc:
    'Aktif EndNote .docx, placeholder .docx, .ris veya LaTeX (.zip) çıktısı alın. Word + EndNote CWYW açıldığında atıflar canlı.',

  // Common
  copyright: 'Dr. Yusuf Hoşoğlu',
  back_home: '← Ana sayfa',
  refresh_app: 'Uygulamayı güncelle',
  refresh_app_desc: 'Önbelleği temizler ve uygulamayı yeniden yükler. Projeleriniz korunur.',
  refresh_app_confirm:
    'Uygulamanın önbelleği temizlensin ve yeniden yüklensin mi? Tüm projeleriniz, kaynakçanız ve notlarınız tarayıcınızda korunacak.',
  theme_toggle: 'Tema',
  theme_light: 'Aydınlık',
  theme_dark: 'Karanlık',
  lang_label: 'Dil',
};

const en: Dict = {
  nav_workspace: 'Workspace',
  nav_about: 'About',
  nav_privacy: 'Privacy',
  nav_tutorial: 'Tutorial',

  hero_title: 'Academic writing & EndNote converter',
  hero_desc:
    'Convert plain-text numbered citations into active EndNote field codes. Write in the browser-based editor, manage your bibliography, export in Vancouver/APA/AMA/IEEE styles.',
  hero_cta: 'Open Workspace',

  features_title: 'Features',
  feat_convert: 'Upload a Word document or paste text; bibliography auto-detected.',
  feat_lookup: 'Enrich DOI, PMID and abstracts via CrossRef, OpenAlex and PubMed.',
  feat_editor: 'TipTap-based online editor with live citation numbering and multi-cite support.',
  feat_styles: 'Switch between Vancouver, APA, AMA, IEEE styles. Active EndNote .docx export.',
  feat_latex: 'LaTeX (.tex + .bib) bundle compatible with Overleaf / TeXLive.',
  feat_endnote: 'Import EndNote XML, RIS, .enw, BibTeX. Browser-based, fast.',

  ecosystem_title: 'DrTR Tools Ecosystem',
  ecosystem_desc: 'Free clinical and academic tools developed by Dr. Yusuf Hoşoğlu.',

  about_title: 'About',
  about_version: 'Version',
  about_author: 'Developer',
  about_stack: 'Tech stack',
  about_license: 'License',
  about_license_value: 'Free for personal / clinical / academic use',

  privacy_title: 'Privacy',
  privacy_intro:
    'Article Editor is a single-user browser application. Your data stays on your device.',
  privacy_local_title: 'All data local',
  privacy_local_desc:
    'Projects, article text and your reference library are stored in your browser’s IndexedDB. Nothing is uploaded to our server.',
  privacy_lookup_title: 'DOI / PubMed / OpenAlex lookups',
  privacy_lookup_desc:
    'When you scan a reference for DOI, only its title, first author and year are sent to the public CrossRef / OpenAlex / PubMed API endpoints. The full text is never sent. Responses come back to your browser without our server storing them.',
  privacy_ai_title: 'Optional AI features',
  privacy_ai_desc:
    'If enabled, AI features (expand, shorten, rewrite) use your own Anthropic or OpenAI API key. Selected text goes directly to that provider. Your key is stored in your browser only.',
  privacy_export_title: 'Exports',
  privacy_export_desc:
    'All exports (.docx, .ris, LaTeX, JSON backup) are generated in your browser and downloaded directly.',
  privacy_no_tracking: 'No cookies, tracking or analytics.',

  tutorial_title: 'Tutorial',
  tutorial_step1_title: '1. Upload or paste your document',
  tutorial_step1_desc:
    "In Workspace use the 'Upload' or 'Paste' tab. Bibliography is auto-detected.",
  tutorial_step2_title: '2. Run DOI lookup',
  tutorial_step2_desc:
    "'Scan all for DOI' enriches missing DOI, PMID and abstracts via CrossRef and PubMed.",
  tutorial_step3_title: '3. Write in the editor',
  tutorial_step3_desc:
    'Click or drag refs from the citation library. Use checkboxes for multi-cite (combined citation).',
  tutorial_step4_title: '4. Pick a style',
  tutorial_step4_desc:
    'Switch between Vancouver, APA, AMA and IEEE styles. Citations and bibliography refresh live.',
  tutorial_step5_title: '5. Export',
  tutorial_step5_desc:
    'Active EndNote .docx, placeholder .docx, .ris or LaTeX (.zip). Open in Word + EndNote CWYW for live citations.',

  copyright: 'Dr. Yusuf Hoşoğlu',
  back_home: '← Home',
  refresh_app: 'Refresh app',
  refresh_app_desc: 'Clears the cache and reloads the app. Your projects are preserved.',
  refresh_app_confirm:
    'Clear the app cache and reload? All your projects, library and notes are kept in your browser.',
  theme_toggle: 'Theme',
  theme_light: 'Light',
  theme_dark: 'Dark',
  lang_label: 'Language',
};

const dicts: Record<Lang, Dict> = { tr, en };

export function detectLang(): Lang {
  if (typeof window === 'undefined') return 'tr';
  const stored = localStorage.getItem('article-editor-lang');
  if (stored === 'tr' || stored === 'en') return stored;
  const nav = (navigator.language || 'en').toLowerCase();
  return nav.startsWith('tr') ? 'tr' : 'en';
}

export function setLang(lang: Lang): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('article-editor-lang', lang);
}

export function t(key: keyof typeof tr, lang: Lang = 'tr'): string {
  return dicts[lang][key] ?? key;
}

export const DRTR_TOOLS = [
  { name: 'DrTR Tools', url: 'https://drtr.uk/', desc: { tr: 'Klinik & akademik araçlar', en: 'Clinical & academic tools' } },
  { name: 'uSTAT', url: 'https://ustat.drtr.uk/', desc: { tr: 'İstatistik platformu', en: 'Statistics platform' } },
  { name: 'ECG Cal', url: 'https://ecgcal.drtr.uk/', desc: { tr: 'EKG hesaplayıcı', en: 'ECG calculator' } },
  { name: 'NeoDW', url: 'https://neodw.drtr.uk/', desc: { tr: 'Neonatal hesaplayıcı', en: 'Neonatal calculator' } },
  { name: 'PDF Translator', url: 'https://pdftranslator.drtr.uk/', desc: { tr: 'Belge çevirmen', en: 'Document translator' } },
  { name: 'Veri Düzelt', url: 'https://veriduzelt.drtr.uk/', desc: { tr: 'Excel eşleştirici', en: 'Excel matcher' } },
  { name: 'Nöbet', url: 'https://nobet.drtr.uk/', desc: { tr: 'Nöbet çizelgesi', en: 'Shift schedule' } },
  { name: 'Kelime', url: 'https://kelime.drtr.uk/', desc: { tr: 'Türkçe kelime oyunu', en: 'Turkish word game' } },
];
