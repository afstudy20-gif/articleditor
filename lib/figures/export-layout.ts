export type FigureCaptionPlacement = 'inline' | 'after-bibliography';

export type FigureLegend = {
  number: number;
  caption: string;
};

export function collectFigureLegends(doc: any): FigureLegend[] {
  const legends: FigureLegend[] = [];

  const walk = (node: any): void => {
    if (!node) return;
    if (node.type === 'figure' && node.attrs?.kind !== 'table') {
      legends.push({
        number: legends.length + 1,
        caption: typeof node.attrs?.caption === 'string' ? node.attrs.caption : '',
      });
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };

  walk(doc);
  return legends;
}
