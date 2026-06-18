export type Vector = Float32Array;

type ScoredCandidate<T extends { vector: Vector }> = T & { score: number };

type HeapItem<T extends { vector: Vector }> = {
  candidate: T;
  index: number;
  score: number;
};

export function cosineSimilarity(a: Vector, b: Vector): number {
  if (a.length !== b.length) {
    throw new RangeError('Vectors must have the same dimension');
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const aValue = a[index] ?? 0;
    const bValue = b[index] ?? 0;

    dot += aValue * bValue;
    normA += aValue * aValue;
    normB += bValue * bValue;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  const score = dot / denominator;
  return Number.isFinite(score) ? score : 0;
}

export function topK<T extends { vector: Vector }>(
  query: Vector,
  candidates: T[],
  k: number,
): Array<ScoredCandidate<T>> {
  if (k <= 0 || candidates.length === 0) {
    return [];
  }

  const limit = Math.min(k, candidates.length);
  const heap: Array<HeapItem<T>> = [];

  candidates.forEach((candidate, index) => {
    const item: HeapItem<T> = {
      candidate,
      index,
      score: cosineSimilarity(query, candidate.vector),
    };

    if (heap.length < limit) {
      heapPush(heap, item);
      return;
    }

    const root = heap[0];
    if (root !== undefined && isBetter(item, root)) {
      heap[0] = item;
      heapifyDown(heap, 0);
    }
  });

  return heap
    .sort(compareBestFirst)
    .map((item) => ({ ...item.candidate, score: item.score }));
}

export function mmrReRank<T extends { vector: Vector }>(
  query: Vector,
  candidates: Array<ScoredCandidate<T>>,
  k: number,
  lambda = 0.5,
): Array<ScoredCandidate<T>> {
  if (k <= 0 || candidates.length === 0) {
    return [];
  }

  const boundedLambda = Math.min(1, Math.max(0, lambda));
  const selected: Array<{ item: ScoredCandidate<T>; index: number }> = [];
  const remaining = candidates.map((item, index) => ({ item, index }));
  const limit = Math.min(k, candidates.length);

  while (selected.length < limit && remaining.length > 0) {
    let bestRemainingIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      if (candidate === undefined) {
        continue;
      }

      const diversityPenalty = maxSelectedSimilarity(candidate.item.vector, selected);
      const mmrScore =
        boundedLambda * candidate.item.score - (1 - boundedLambda) * diversityPenalty;

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestRemainingIndex = index;
      }
    }

    const [next] = remaining.splice(bestRemainingIndex, 1);
    if (next !== undefined) {
      selected.push(next);
    }
  }

  return selected.map((candidate) => candidate.item);
}

function maxSelectedSimilarity<T extends { vector: Vector }>(
  vector: Vector,
  selected: Array<{ item: ScoredCandidate<T>; index: number }>,
): number {
  let maxSimilarity = 0;

  for (const selectedCandidate of selected) {
    maxSimilarity = Math.max(
      maxSimilarity,
      cosineSimilarity(vector, selectedCandidate.item.vector),
    );
  }

  return maxSimilarity;
}

function compareBestFirst<T extends { vector: Vector }>(
  a: HeapItem<T>,
  b: HeapItem<T>,
): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }

  return a.index - b.index;
}

function isBetter<T extends { vector: Vector }>(
  a: HeapItem<T>,
  b: HeapItem<T>,
): boolean {
  if (a.score !== b.score) {
    return a.score > b.score;
  }

  return a.index < b.index;
}

function isWorse<T extends { vector: Vector }>(
  a: HeapItem<T>,
  b: HeapItem<T>,
): boolean {
  if (a.score !== b.score) {
    return a.score < b.score;
  }

  return a.index > b.index;
}

function heapPush<T extends { vector: Vector }>(
  heap: Array<HeapItem<T>>,
  item: HeapItem<T>,
): void {
  heap.push(item);
  heapifyUp(heap, heap.length - 1);
}

function heapifyUp<T extends { vector: Vector }>(
  heap: Array<HeapItem<T>>,
  startIndex: number,
): void {
  let index = startIndex;

  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    const item = heap[index];
    const parent = heap[parentIndex];

    if (item === undefined || parent === undefined || !isWorse(item, parent)) {
      return;
    }

    heap[index] = parent;
    heap[parentIndex] = item;
    index = parentIndex;
  }
}

function heapifyDown<T extends { vector: Vector }>(
  heap: Array<HeapItem<T>>,
  startIndex: number,
): void {
  let index = startIndex;

  while (true) {
    const leftIndex = index * 2 + 1;
    const rightIndex = leftIndex + 1;
    let worstIndex = index;

    const left = heap[leftIndex];
    const currentWorst = heap[worstIndex];
    if (left !== undefined && currentWorst !== undefined && isWorse(left, currentWorst)) {
      worstIndex = leftIndex;
    }

    const right = heap[rightIndex];
    const worst = heap[worstIndex];
    if (right !== undefined && worst !== undefined && isWorse(right, worst)) {
      worstIndex = rightIndex;
    }

    if (worstIndex === index) {
      return;
    }

    const item = heap[index];
    const worstItem = heap[worstIndex];
    if (item === undefined || worstItem === undefined) {
      return;
    }

    heap[index] = worstItem;
    heap[worstIndex] = item;
    index = worstIndex;
  }
}
