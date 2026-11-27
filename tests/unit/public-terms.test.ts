import { describe, expect, it } from 'vitest';
import { findProblems } from '../../scripts/check-public-terms.mjs';
import { BUDGET, checkScripts, scriptsInHtml } from '../../scripts/check-bundle-size.mjs';

// The sample strings are built from parts so this file does not trip the guard it tests.
const decisionId = 'D' + '-abc12';
const cardRef = 'card ' + '1234';
const vaultPath = 'Initiatives' + '/active/something';
const homePath = '/Users' + '/someone/Code';
const emDash = String.fromCharCode(0x2014);

describe('public-terms guard', () => {
  it('passes plain text', () => {
    expect(findProblems('Foothold is a free pack of notes and AI skills.')).toEqual([]);
  });
  it('refuses a decision-log id', () => {
    expect(findProblems(`see ${decisionId} for why`)).toEqual(['a decision-log id']);
  });
  it('does not mistake a longer word for a decision-log id', () => {
    expect(findProblems('D-Day and D-abcdef')).toEqual([]);
  });
  it('refuses a card-number reference', () => {
    expect(findProblems(`built under ${cardRef}`)).toEqual(['a card-number reference']);
    expect(findProblems('card=' + '7777')).toEqual(['a card-number reference']);
  });
  it('allows the word card without a number', () => {
    expect(findProblems('one card at a time')).toEqual([]);
  });
  it('refuses a private vault path', () => {
    expect(findProblems(`kept in ${vaultPath}`)).toEqual(['a private vault path']);
  });
  it('refuses an absolute home path', () => {
    expect(findProblems(`cd ${homePath}`)).toEqual(['an absolute home path']);
  });
  it('refuses an em-dash in repository text but not in built output', () => {
    expect(findProblems(`a ${emDash} b`)).toEqual(['an em-dash']);
    expect(findProblems(`a ${emDash} b`, { built: true })).toEqual([]);
  });
});

// Acceptance test 14 (the rule): the script-size check and its 300 KB budget.
describe('bundle-size check', () => {
  const bundled = '<script type="module" src="/_astro/map.Ab12Cd.js"></script>';

  it('allows a bundled module script from this site', () => {
    expect(scriptsInHtml('<p>hello</p>')).toEqual([]);
    expect(scriptsInHtml(bundled)).toEqual([]);
  });

  it('finds inline script, script from elsewhere, a javascript link and an inline handler', () => {
    expect(scriptsInHtml('<script>alert(1)</script>')).toEqual(['an inline script']);
    expect(scriptsInHtml('<script type="module">import "/x.js"</script>')).toEqual(['an inline script']);
    expect(scriptsInHtml('<script src="https://cdn.example.com/a.js"></script>')).toEqual(['a script from outside the bundle: https://cdn.example.com/a.js']);
    expect(scriptsInHtml('<script src="/a.js"></script>')).toEqual(['a script from outside the bundle: /a.js']);
    // an end tag a browser accepts but a strict pattern would miss, and a script never closed
    expect(scriptsInHtml('<script>alert(1)</script\t\n bar>')).toEqual(['an inline script']);
    expect(scriptsInHtml('<script>alert(1)</SCRIPT >')).toEqual(['an inline script']);
    expect(scriptsInHtml('<script>alert(1)')).toEqual(['an inline script']);
    expect(scriptsInHtml('<a href="javascript:void(0)">x</a>')).toEqual(['a javascript: link']);
    expect(scriptsInHtml('<button onclick="go()">x</button>')).toEqual(['an inline event handler']);
  });

  it('has a budget of 300 KB compressed', () => {
    expect(BUDGET).toBe(300 * 1000);
  });

  it('passes bundled script under the budget and fails it over the budget', () => {
    const html = [{ path: 'map/index.html', text: bundled }];
    expect(checkScripts({ html, scripts: [{ path: '_astro/map.Ab12Cd.js', compressed: BUDGET }] }).problems).toEqual([]);
    const over = checkScripts({ html, scripts: [{ path: '_astro/map.Ab12Cd.js', compressed: BUDGET - 10 }, { path: '_astro/chunk.js', compressed: 11 }] });
    expect(over.total).toBe(BUDGET + 1);
    expect(over.problems).toEqual([`scripts total ${BUDGET + 1} bytes compressed, over the budget of ${BUDGET}`]);
  });

  it('fails a script file outside the bundle folder', () => {
    const result = checkScripts({ html: [], scripts: [{ path: 'stray.js', compressed: 10 }] });
    expect(result.problems).toEqual(['stray.js: a script file outside _astro/']);
  });
});
