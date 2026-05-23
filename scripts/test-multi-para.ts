import { detectMarkers } from '../lib/markers/detect';

const paragraphs = [
  'Title without citations',
  'Revised manuscript',
  'Introduction',
  'Acute coronary syndrome (ACS) [1]. Lower admission [2, 12]. After lower [3]. Comparable [4].',
  'Several mechanisms [1, 5]. CONUT [13].',
];

console.log('Test: detectMarkers called per-paragraph (regression case)');
for (let i = 0; i < paragraphs.length; i++) {
  const markers = detectMarkers(paragraphs[i]);
  console.log(`Para ${i}: "${paragraphs[i].slice(0, 50)}..."`);
  console.log(`  -> ${markers.length} markers:`, markers.map((m) => m.raw));
}
