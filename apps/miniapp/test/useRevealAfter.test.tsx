import { renderHook } from '@testing-library/react';
import { useRevealAfter } from '../src/hooks/useRevealAfter';

test('content ready from the start does not fade', () => {
  const { result } = renderHook(({ ready }) => useRevealAfter(ready), { initialProps: { ready: true } });
  expect(result.current).toBeUndefined();
});

test('content that becomes ready fades until it goes away, and fades again next time', () => {
  const { result, rerender } = renderHook(({ ready }) => useRevealAfter(ready), { initialProps: { ready: false } });
  expect(result.current).toBeUndefined();
  rerender({ ready: true });
  expect(result.current).toBe('reveal');
  rerender({ ready: true });
  expect(result.current).toBe('reveal');
  rerender({ ready: false });
  expect(result.current).toBeUndefined();
  rerender({ ready: true });
  expect(result.current).toBe('reveal');
});
