import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fillTemplateVars, hasTemplateVars } from './fill-template';

describe('fillTemplateVars', () => {
  it('fills supported single and double-brace placeholders case-insensitively', () => {
    const output = fillTemplateVars(
      '{{TITLE}}\n{journal}\n{{corresponding}}\n{{year}}',
      {
        title: 'A Clinical Study',
        journal: 'Journal of Tests',
        corresponding: 'A. Author',
        year: '2026',
      },
    );

    assert.equal(output, 'A Clinical Study\nJournal of Tests\nA. Author\n2026');
  });

  it('leaves unknown and empty placeholders visible for manual completion', () => {
    const output = fillTemplateVars('{{title}} {{unknown}} {{email}}', {
      title: 'Study',
      email: '',
    });

    assert.equal(output, 'Study {{unknown}} {{email}}');
  });

  it('detects supported placeholders only', () => {
    assert.equal(hasTemplateVars('Submit {{journal}} in {{year}}.'), true);
    assert.equal(hasTemplateVars('Submit {{unknown}}.'), false);
  });
});
