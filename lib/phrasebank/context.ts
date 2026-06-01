const SECTION_CATEGORY_HINTS: Array<{ section: RegExp; categories: RegExp[] }> = [
  { section: /intro|background|giriş|arka plan/i, categories: [/introduc|background|rationale|aim/i] },
  { section: /method|material|yöntem/i, categories: [/method|procedure|participant|analysis|describing methods/i] },
  { section: /result|finding|bulgu/i, categories: [/result|finding|reporting/i] },
  { section: /discussion|tartışma/i, categories: [/discuss|interpret|cautious|limitation|implication/i] },
  { section: /conclusion|sonuç/i, categories: [/conclud|summar|recommend|future/i] },
];

export function categoryMatchesSection(category: string, section: string | null | undefined): boolean {
  if (!section) return false;
  const rule = SECTION_CATEGORY_HINTS.find((item) => item.section.test(section));
  if (!rule) return false;
  return rule.categories.some((rx) => rx.test(category));
}
