import { describe, expect, it } from 'vitest';
import { findProblems } from '../../scripts/check-public-terms.mjs';
import { scriptsInHtml } from '../../scripts/check-bundle-size.mjs';

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

describe('bundle-size check', () => {
  it('finds a script tag, a javascript link and an inline handler', () => {
    expect(scriptsInHtml('<p>hello</p>')).toEqual([]);
    expect(scriptsInHtml('<script src="/a.js"></script>')).toEqual(['a <script> tag']);
    expect(scriptsInHtml('<a href="javascript:void(0)">x</a>')).toEqual(['a javascript: link']);
    expect(scriptsInHtml('<button onclick="go()">x</button>')).toEqual(['an inline event handler']);
  });
});
