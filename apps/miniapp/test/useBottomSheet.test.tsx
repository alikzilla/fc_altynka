import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionSheet } from '../src/components/ActionSheet';

/** A visual viewport we can move: the keyboard takes the bottom of the window, iOS may pan it (offsetTop). */
class FakeVisualViewport extends EventTarget {
  height = 844;
  offsetTop = 0;
}
let visual: FakeVisualViewport;
const saved: [object, string, PropertyDescriptor | undefined][] = [];
function define(target: object, key: string, descriptor: PropertyDescriptor) {
  saved.push([target, key, Object.getOwnPropertyDescriptor(target, key)]);
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
}

beforeEach(() => {
  visual = new FakeVisualViewport();
  define(window, 'visualViewport', { get: () => visual });
  define(window, 'innerHeight', { get: () => 844 });
});

afterEach(() => {
  for (const [target, key, original] of saved.reverse()) {
    if (original) Object.defineProperty(target, key, original);
    else delete (target as Record<string, unknown>)[key];
  }
  saved.length = 0;
  Reflect.deleteProperty(window, 'Telegram');
});

const frame = () => act(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
const sheet = () => screen.getByRole('dialog', { hidden: true });
const keyboard = () => sheet().style.getPropertyValue('--sheet-keyboard');

async function moveViewport(height: number, offsetTop = 0, event: 'resize' | 'scroll' = 'resize') {
  visual.height = height;
  visual.offsetTop = offsetTop;
  visual.dispatchEvent(new Event(event));
  await frame();
}

/** happy-dom's TransitionEvent drops propertyName; build the event the browser sends when a transition ends. */
function transitionEnd(propertyName: string) {
  const event = new Event('transitionend', { bubbles: true });
  Object.defineProperty(event, 'propertyName', { value: propertyName });
  sheet().dispatchEvent(event);
}

function Sheet() {
  return <ActionSheet title="Сообщить о проблеме" onClose={() => {}} footer={<button type="button">Отправить</button>}>
    <label>Что случилось?<textarea /></label>
  </ActionSheet>;
}

describe('a sheet and the keyboard', () => {
  it('stays on the bottom of the screen and pads its content by the keyboard height', async () => {
    render(<Sheet />);
    await frame();
    expect(keyboard()).toBe('0px');
    await moveViewport(544);
    expect(keyboard()).toBe('300px');
    expect(sheet().style.getPropertyValue('--sheet-viewport')).toBe('544px');
    // The sheet is never lifted any more: nothing moves its bottom edge off the screen's bottom.
    expect(sheet().style.getPropertyValue('--sheet-bottom')).toBe('');
  });

  it('counts a panned visual viewport (offsetTop) out of the keyboard height', async () => {
    render(<Sheet />);
    // 844 − 444 − 100: what lies under the panned visual viewport, not 400.
    await moveViewport(444, 100, 'scroll');
    expect(keyboard()).toBe('300px');
  });

  it('goes back to 0 when the keyboard closes even if offsetTop does not (iOS 26)', async () => {
    render(<Sheet />);
    await moveViewport(444, 100);
    expect(keyboard()).toBe('300px');
    await moveViewport(844, 100);
    expect(keyboard()).toBe('0px');
  });

  it('measures again when a field loses focus, without waiting for a viewport event', async () => {
    render(<Sheet />);
    await moveViewport(544);
    const field = screen.getByRole('textbox', { hidden: true });
    visual.height = 844;
    fireEvent.focusOut(field);
    await frame();
    expect(keyboard()).toBe('0px');
  });

  it('several viewport events in one frame are applied once, in the next animation frame', async () => {
    render(<Sheet />);
    await frame();
    const set = vi.spyOn(sheet().style, 'setProperty');
    visual.height = 600; visual.dispatchEvent(new Event('resize'));
    visual.height = 544; visual.dispatchEvent(new Event('resize'));
    visual.dispatchEvent(new Event('scroll'));
    expect(set).not.toHaveBeenCalledWith('--sheet-keyboard', expect.anything());
    await frame();
    expect(set.mock.calls.filter(([name]) => name === '--sheet-keyboard')).toEqual([['--sheet-keyboard', '300px']]);
  });

  it('follows Telegram viewportChanged and takes the value once the state is stable', async () => {
    const listeners = new Map<string, (event?: { isStateStable?: boolean }) => void>();
    const app = { onEvent: (name: string, callback: () => void) => listeners.set(name, callback), offEvent: (name: string) => listeners.delete(name) };
    Object.defineProperty(window, 'Telegram', { configurable: true, value: { WebApp: app } });
    const { unmount } = render(<Sheet />);
    await frame();
    expect(listeners.has('viewportChanged')).toBe(true);
    // Android: the client itself makes the web view shorter; the keyboard height stays 0, only the viewport changes.
    define(window, 'innerHeight', { get: () => 500 });
    visual.height = 500;
    listeners.get('viewportChanged')!({ isStateStable: false });
    await frame();
    expect(sheet().style.getPropertyValue('--sheet-viewport')).toBe('844px');
    listeners.get('viewportChanged')!({ isStateStable: true });
    await frame();
    expect(sheet().style.getPropertyValue('--sheet-viewport')).toBe('500px');
    expect(keyboard()).toBe('0px');
    unmount();
    expect(listeners.has('viewportChanged')).toBe(false);
  });

  it('scrolls the focused field into the visible part of the sheet content, never the page', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<Sheet />);
    const content = sheet().querySelector<HTMLElement>('.sheet-content')!;
    const field = screen.getByRole('textbox', { hidden: true });
    // The content shows 100..300 on screen; the field sits below it, at 350..400 before any scrolling.
    content.getBoundingClientRect = () => ({ top: 100, bottom: 300, height: 200, left: 0, right: 390, width: 390, x: 0, y: 100, toJSON() {} });
    field.getBoundingClientRect = () => {
      const top = 350 - content.scrollTop;
      return { top, bottom: top + 50, height: 50, left: 0, right: 390, width: 390, x: 0, y: top, toJSON() {} };
    };
    field.focus();
    await frame();
    expect(content.scrollTop).toBe(112);
    // The keyboard padding finishes its transition: the field is brought back into view again.
    content.scrollTop = 0;
    transitionEnd('--sheet-pad');
    await frame();
    expect(content.scrollTop).toBe(112);
    // Already visible: nothing moves.
    transitionEnd('--sheet-pad');
    await frame();
    expect(content.scrollTop).toBe(112);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  /** The content shows 100..300; the field is `height` tall and starts at `top` before any scrolling. */
  function placeField(top: number, height: number) {
    const content = sheet().querySelector<HTMLElement>('.sheet-content')!;
    const field = screen.getByRole('textbox', { hidden: true });
    content.getBoundingClientRect = () => ({ top: 100, bottom: 300, height: 200, left: 0, right: 390, width: 390, x: 0, y: 100, toJSON() {} });
    field.getBoundingClientRect = () => {
      const y = top - content.scrollTop;
      return { top: y, bottom: y + height, height, left: 0, right: 390, width: 390, x: 0, y, toJSON() {} };
    };
    return { content, field };
  }

  it('a field that fits and is only cut at the bottom moves up by its bottom edge', async () => {
    render(<Sheet />);
    const { content, field } = placeField(250, 70);
    field.focus();
    await frame();
    expect(content.scrollTop).toBe(32);
  });

  it('a field taller than the view stays put while any of it is on screen (the caret is not scrolled away)', async () => {
    render(<Sheet />);
    // Top above the view, bottom inside it: the person is typing at the bottom of a long textarea.
    const { content, field } = placeField(40, 240);
    field.focus();
    await frame();
    expect(content.scrollTop).toBe(0);
    // Covering the whole view: nothing moves either.
    transitionEnd('--sheet-pad');
    await frame();
    expect(content.scrollTop).toBe(0);
  });

  it('a field taller than the view that is wholly below it comes in by its top edge', async () => {
    render(<Sheet />);
    const { content, field } = placeField(400, 240);
    field.focus();
    await frame();
    expect(content.scrollTop).toBe(288);
  });
});
