export interface Token {
  type: 'word' | 'sep';
  value: string;
}

export function incrementRoman(val: string): string {
  const isUpper = val === val.toUpperCase();
  const lower = val.toLowerCase();
  const ROMAN_MAP: Record<string, string> = {
    i: 'ii', ii: 'iii', iii: 'iv', iv: 'v', v: 'vi', vi: 'vii', vii: 'viii', viii: 'ix', ix: 'x', x: 'xi',
    xi: 'xii', xii: 'xiii', xiii: 'xiv', xiv: 'xv', xv: 'xvi', xvi: 'xvii', xvii: 'xviii', xviii: 'xix', xix: 'xx', xx: 'xxi'
  };
  const next = ROMAN_MAP[lower] || (lower + 'i');
  return isUpper ? next.toUpperCase() : next;
}

export function incrementStringPart(part: string): string {
  if (/^\d+$/.test(part)) {
    return String(parseInt(part, 10) + 1);
  }
  if (/^[ivxIVX]+$/.test(part)) {
    return incrementRoman(part);
  }
  if (/^[a-z]$/.test(part)) {
    const code = part.charCodeAt(0);
    if (part === 'z') return 'aa';
    return String.fromCharCode(code + 1);
  }
  if (/^[A-Z]$/.test(part)) {
    const code = part.charCodeAt(0);
    if (part === 'Z') return 'AA';
    return String.fromCharCode(code + 1);
  }
  return part;
}

export function tokenizePrefix(prefixText: string): Token[] {
  const tokens: Token[] = [];
  const regex = /[A-Za-z]+|[0-9]+|[^A-Za-z0-9]+/g;
  let match;
  while ((match = regex.exec(prefixText)) !== null) {
    const val = match[0];
    const isAlphanum = /[A-Za-z0-9]/.test(val);
    tokens.push({
      type: isAlphanum ? 'word' : 'sep',
      value: val
    });
  }
  return tokens;
}

export function isNumberingPrefix(body: string): boolean {
  if (body.length > 8) return false;
  if (/[0-9]/.test(body)) return true;
  if (/^[a-zA-Z]$/.test(body)) return true;
  if (/^(ix|iv|v?i{0,3})$/i.test(body)) return true;
  return false;
}

export function getNextNumbering(headingText: string | null): { next: string; nextSub: string } | null {
  if (!headingText) return null;
  const text = headingText.trim();
  const match = text.match(/^([0-9a-zA-Z]+(?:[\.\-\s\)]+[0-9a-zA-Z]+)*)([\.\-\s\)]+)/);
  if (!match) return null;

  const body = match[1];
  const suffix = match[2];

  if (!isNumberingPrefix(body)) return null;

  const tokens = tokenizePrefix(match[0]);
  let lastWordIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].type === 'word') {
      lastWordIdx = i;
      break;
    }
  }

  let next = '';
  if (lastWordIdx !== -1) {
    const nextTokens = [...tokens];
    nextTokens[lastWordIdx] = {
      ...nextTokens[lastWordIdx],
      value: incrementStringPart(nextTokens[lastWordIdx].value)
    };
    next = nextTokens.map((t) => t.value).join('');
  }

  const nextSub = body + '.' + '1' + suffix;

  return { next, nextSub };
}
