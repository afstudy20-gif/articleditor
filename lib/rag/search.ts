import { mmrReRank, topK } from './cosine';
import { embedTexts } from './embed-client';
import { getProjectChunksAndEmbeddings } from '@/store/db';
import type { PdfChunk } from '@/store/types';

export type SearchHit = PdfChunk & { score: number };

export async function searchProjectChunks(opts: {
  projectId: string;
  query: string;
  k?: number;
  mmrLambda?: number;
}): Promise<SearchHit[]> {
  const { projectId, query, k = 8, mmrLambda = 0.5 } = opts;

  const { vectors } = await embedTexts({ texts: [query] });
  const queryVector = vectors[0];
  if (!queryVector) {
    return [];
  }

  const candidates = await getProjectChunksAndEmbeddings(projectId);
  if (candidates.length === 0) {
    return [];
  }

  const prefiltered = topK(queryVector, candidates, k * 3);
  const ranked = mmrReRank(queryVector, prefiltered, k, mmrLambda);

  return ranked.map(({ vector: _vector, ...hit }) => hit);
}
