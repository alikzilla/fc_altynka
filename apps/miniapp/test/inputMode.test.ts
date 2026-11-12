import { trackInputMode } from '../src/lib/inputMode';

test('navigation keys switch focus rings on; a tap or typing does not', () => {
  const stop = trackInputMode();
  const root = document.documentElement;
  expect(root.dataset.input).toBeUndefined();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'а' }));
  expect(root.dataset.input).toBeUndefined();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
  expect(root.dataset.input).toBe('keyboard');
  window.dispatchEvent(new Event('pointerdown'));
  expect(root.dataset.input).toBeUndefined();
  stop();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
  expect(root.dataset.input).toBeUndefined();
});
