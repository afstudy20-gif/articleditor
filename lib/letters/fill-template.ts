/**
 * Placeholder filling for user-saved journal forms.
 *
 * Every journal's copyright/consent form is different — instead of bundling
 * them all, the user pastes the journal's own form text ONCE as a custom
 * template, marks the variable spots with {{placeholders}}, and each project
 * fills them automatically from its metadata.
 *
 * Supported keys (case-insensitive, single or double braces):
 *   {{title}} {{journal}} {{authors}} {{corresponding}} {{email}}
 *   {{address}} {{orcid}} {{date}} {{year}}
 */

export type TemplateVars = {
  title?: string;
  journal?: string;
  authors?: string;
  corresponding?: string;
  email?: string;
  address?: string;
  orcid?: string;
  date?: string;
  year?: string;
};

export const TEMPLATE_VAR_KEYS: ReadonlyArray<keyof TemplateVars> = [
  'title',
  'journal',
  'authors',
  'corresponding',
  'email',
  'address',
  'orcid',
  'date',
  'year',
];

/**
 * Replace {{key}} / {key} placeholders with the provided values.
 * Unknown keys and keys without a value are left untouched so the user can
 * still spot what needs manual attention in the created document.
 */
export function fillTemplateVars(content: string, vars: TemplateVars): string {
  if (!content) return content;
  return content.replace(
    /\{\{?\s*([a-zA-Z]+)\s*\}?\}/g,
    (match, rawKey: string) => {
      const key = rawKey.toLowerCase() as keyof TemplateVars;
      if (!TEMPLATE_VAR_KEYS.includes(key)) return match;
      const value = (vars[key] ?? '').trim();
      return value.length > 0 ? value : match;
    },
  );
}

/** True when the template references at least one supported placeholder. */
export function hasTemplateVars(content: string): boolean {
  const re = /\{\{?\s*([a-zA-Z]+)\s*\}?\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (TEMPLATE_VAR_KEYS.includes(m[1].toLowerCase() as keyof TemplateVars)) return true;
  }
  return false;
}
