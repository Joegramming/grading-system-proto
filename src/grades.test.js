import { describe, it, expect } from 'vitest';
import { parseScoreInput } from './grades.js';

describe('parseScoreInput', () => {
  it('parses a plain number', () => {
    expect(parseScoreInput('8.5')).toBe(8.5);
  });

  it('treats blank / whitespace as not graded', () => {
    expect(parseScoreInput('')).toBeNull();
    expect(parseScoreInput('   ')).toBeNull();
  });

  it('treats non-numeric junk as not graded (no NaN leaks into the math)', () => {
    expect(parseScoreInput('abc')).toBeNull();
    expect(parseScoreInput('--')).toBeNull();
  });

  it('clamps negatives to zero', () => {
    expect(parseScoreInput('-3')).toBe(0);
  });

  it('keeps values above an assignment max (extra credit is allowed)', () => {
    expect(parseScoreInput('120')).toBe(120);
  });

  it('accepts a genuine zero', () => {
    expect(parseScoreInput('0')).toBe(0);
  });
});
