import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The tr/en dictionaries are module-private, so parse the source text: capture
// every `key:` at the first indent level inside `const tr: Dict = {...}` and
// `const en: Dict = {...}` blocks and compare the two key sets.
function extractKeys(src: string, name: 'tr' | 'en'): Set<string> {
  const start = src.indexOf(`const ${name}: Dict = {`);
  assert.ok(start >= 0, `dictionary "${name}" not found`);
  // Find the matching closing "};" by brace counting.
  let depth = 0;
  let end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  assert.ok(end > start, `dictionary "${name}" not terminated`);
  const body = src.slice(start, end);
  const keys = new Set<string>();
  for (const m of body.matchAll(/^\s{2}(?:'([^']+)'|([A-Za-z0-9_]+)):/gm)) {
    keys.add(m[1] ?? m[2]);
  }
  assert.ok(keys.size > 100, `dictionary "${name}" suspiciously small (${keys.size} keys)`);
  return keys;
}

describe('i18n TR/EN parity', () => {
  const src = readFileSync(join(__dirname, 'index.ts'), 'utf8');
  const tr = extractKeys(src, 'tr');
  const en = extractKeys(src, 'en');

  it('every TR key exists in EN', () => {
    const missing = [...tr].filter((k) => !en.has(k));
    assert.deepEqual(missing, [], `EN is missing: ${missing.join(', ')}`);
  });

  it('every EN key exists in TR', () => {
    const missing = [...en].filter((k) => !tr.has(k));
    assert.deepEqual(missing, [], `TR is missing: ${missing.join(', ')}`);
  });
});
