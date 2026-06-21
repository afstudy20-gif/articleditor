declare module 'nspell' {
  interface Dictionary {
    aff: string;
    dic: string;
  }

  interface NSpell {
    correct(word: string): boolean;
    suggest(word: string): string[];
    add(word: string): void;
    remove(word: string): void;
    wordCharacters(): string | null;
    dictionary(dict: Dictionary | string): this;
    personal(personal: string): this;
  }

  function nspell(dict: Dictionary | Dictionary[] | string | string[]): NSpell;
  namespace nspell {}
  export = nspell;
}
