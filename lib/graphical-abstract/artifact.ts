/**
 * How a generated graphical abstract is stored in a project.
 *
 * Two assets, not one. The PNG is what goes into the manuscript and the export; the spec
 * is what makes the figure editable again later — reopening it in AcademicFlow, switching
 * publisher target, or fixing one number without regenerating from scratch. A PNG alone
 * loses all of that the moment the session ends.
 *
 * They are paired by filename rather than by a new field because `ProjectAsset`
 * (store/types.ts) has no metadata slot, and adding one changes a Dexie-persisted type
 * for every existing project.
 */

export const GA_SPEC_SUFFIX = '.spec.json';
export const GA_SPEC_MIME = 'application/json';

/** Base name shared by the image and its spec, e.g. "graphical-abstract-1". */
export function gaArtifactBaseName(index: number): string {
  return `graphical-abstract-${index}`;
}

export function gaImageFilename(base: string): string {
  return `${base}.png`;
}

export function gaSpecFilename(base: string): string {
  return `${base}${GA_SPEC_SUFFIX}`;
}

/** True for the JSON sidecar rather than the rendered image. */
export function isGaSpecAsset(name: string): boolean {
  return name.endsWith(GA_SPEC_SUFFIX);
}

/** The spec filename that belongs with an image asset, or null if it is not one of ours. */
export function specNameForImage(imageName: string): string | null {
  const m = /^(graphical-abstract-\d+)\.png$/.exec(imageName);
  return m ? gaSpecFilename(m[1]) : null;
}

/**
 * Next free base name given the names already in the project, so regenerating never
 * overwrites an earlier abstract the author may still want.
 */
export function nextGaBaseName(existingNames: readonly string[]): string {
  let n = 1;
  const taken = new Set(existingNames);
  while (taken.has(gaImageFilename(gaArtifactBaseName(n))) || taken.has(gaSpecFilename(gaArtifactBaseName(n)))) {
    n += 1;
  }
  return gaArtifactBaseName(n);
}
