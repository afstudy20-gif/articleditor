export async function extractPdfText(file: File): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('PDF parsing is available only in the browser.');
  }

  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.js',
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let current = '';
    let lastY: number | null = null;

    for (const item of content.items as Array<{ str?: string; transform?: number[]; hasEOL?: boolean }>) {
      const str = (item.str ?? '').trim();
      if (!str) continue;
      const y = item.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 4 && current.trim()) {
        lines.push(current.trim());
        current = '';
      }
      current += current ? ` ${str}` : str;
      if (item.hasEOL && current.trim()) {
        lines.push(current.trim());
        current = '';
      }
      lastY = y;
    }

    if (current.trim()) lines.push(current.trim());
    pages.push(lines.join('\n'));
  }

  await pdf.destroy();
  return pages.join('\n\n');
}
