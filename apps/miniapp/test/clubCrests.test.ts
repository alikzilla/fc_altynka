/// <reference types="vite/client" />
import { CLUBS } from '@altynka/core';
import { describe, expect, it } from 'vitest';

// Файлы читаются как сырой текст через Vite, чтобы тест не требовал типов Node.
const files = import.meta.glob<string>('../public/clubs/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const crest = (id: string): string | undefined => files[`../public/clubs/${id}.svg`];
const bytes = (text: string) => new TextEncoder().encode(text).length;

describe('club crests', () => {
  it('every catalog club has a crest file under 30 KB', () => {
    for (const c of CLUBS) {
      const text = crest(c.id);
      expect(text, `${c.id}: file`).toBeDefined();
      expect(bytes(text!), `${c.id}: size`).toBeLessThanOrEqual(30 * 1024);
      expect(text!.trimStart().replace(/^<\?xml[^>]*\?>\s*/, ''), `${c.id}: starts with <svg`).toMatch(/^<svg/);
      expect(text!, `${c.id}: viewBox`).toContain('viewBox');
    }
  });

  it('crest files contain no scripts or external references', () => {
    for (const c of CLUBS) {
      const text = crest(c.id);
      expect(text, `${c.id}: file`).toBeDefined();
      expect(text!, `${c.id}: script`).not.toMatch(/<script/i);
      expect(text!, `${c.id}: handler`).not.toMatch(/[\s"']on[a-z]+\s*=/i);
      expect(text!, `${c.id}: external href`).not.toMatch(/href\s*=\s*["']\s*(https?:)?\/\//i);
      expect(text!, `${c.id}: external url()`).not.toMatch(/url\(\s*["']?(https?:)?\/\//i);
      expect(text!, `${c.id}: raster`).not.toMatch(/<image/i);
    }
  });
});
