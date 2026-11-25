import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionSheet } from '../src/components/ActionSheet';
import { SheetPlaceholder } from '../src/components/SheetPlaceholder';

/**
 * happy-dom has no layout. A tiny model of the sheet's flex column stands in for it:
 * the box is the natural height (chrome + content), held at least at min(--sheet-min, max)
 * and at most at max, the way `.create-sheet` lays out in a browser.
 */
const layout = { chrome: 100, content: 400, max: 900 };
let observers: { callback: ResizeObserverCallback; observer: ResizeObserver }[] = [];

function sheetHeight(node: HTMLElement): number {
  const remembered = parseFloat(node.style.getPropertyValue('--sheet-min')) || 0;
  const natural = layout.chrome + layout.content;
  return Math.min(Math.max(natural, Math.min(remembered, layout.max)), layout.max);
}
const dialogOf = (el: Element) => el.closest<HTMLElement>('.create-sheet')!;
const contentBox = (el: HTMLElement) => sheetHeight(dialogOf(el)) - layout.chrome;

const patched: [object, string, PropertyDescriptor | undefined][] = [];
function patch(target: object, key: string, descriptor: PropertyDescriptor) {
  patched.push([target, key, Object.getOwnPropertyDescriptor(target, key)]);
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
}

beforeEach(() => {
  Object.assign(layout, { chrome: 100, content: 400, max: 900 });
  observers = [];
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { observers.push({ callback, observer: this as unknown as ResizeObserver }); }
    observe() {}
    unobserve() {}
    disconnect() { observers = observers.filter(entry => entry.observer !== (this as unknown as ResizeObserver)); }
  });
  const getRect = HTMLElement.prototype.getBoundingClientRect;
  patch(HTMLElement.prototype, 'getBoundingClientRect', { value: function (this: HTMLElement) {
    if (!this.matches('.create-sheet')) return getRect.call(this);
    const height = sheetHeight(this);
    return { x: 0, y: 0, top: 0, left: 0, right: 390, bottom: height, width: 390, height, toJSON() {} } as DOMRect;
  } });
  patch(HTMLElement.prototype, 'clientHeight', { get(this: HTMLElement) { return this.matches('.sheet-content') ? contentBox(this) : 0; } });
  patch(HTMLElement.prototype, 'scrollHeight', { get(this: HTMLElement) { return this.matches('.sheet-content') ? Math.max(layout.content, contentBox(this)) : 0; } });
  patch(HTMLElement.prototype, 'offsetHeight', { get(this: HTMLElement) { return this.matches('.create-sheet') ? sheetHeight(this) : 0; } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [target, key, original] of patched.reverse()) {
    if (original) Object.defineProperty(target, key, original);
    else delete (target as Record<string, unknown>)[key];
  }
  patched.length = 0;
});

/** The content or the window changed size: deliver it to every observer, like a browser frame would. */
function resize(change: Partial<typeof layout>) {
  Object.assign(layout, change);
  act(() => { for (const { callback, observer } of [...observers]) callback([], observer); });
}

const sheet = () => screen.getByRole('dialog', { hidden: true });
const minimum = () => sheet().style.getPropertyValue('--sheet-min');

function Sheet({ step }: { step?: string }) {
  return <ActionSheet title="Шторка" onClose={() => {}} step={step}><p>Содержимое</p></ActionSheet>;
}

describe('ActionSheet height', () => {
  it('height never shrinks while open', () => {
    render(<Sheet />);
    resize({ content: 400 });
    expect(minimum()).toBe('500px');
    resize({ content: 200 });
    expect(minimum()).toBe('500px');
    expect(sheet().getBoundingClientRect().height).toBe(500);
  });

  it('grows with content', () => {
    layout.content = 200;
    render(<Sheet />);
    expect(minimum()).toBe('300px');
    resize({ content: 400 });
    expect(minimum()).toBe('500px');
  });

  it('a height squeezed by the keyboard never lowers the remembered one', () => {
    render(<Sheet />);
    expect(minimum()).toBe('500px');
    // The keyboard takes half the screen: the sheet is capped and its content scrolls.
    resize({ max: 300 });
    expect(minimum()).toBe('500px');
    expect(sheet().getBoundingClientRect().height).toBe(300);
    resize({ content: 450 });
    expect(minimum()).toBe('500px');
    // Back to full height: the sheet returns to its largest natural height, not the squeezed one.
    resize({ max: 900 });
    expect(minimum()).toBe('550px');
  });

  it('opening under the keyboard keeps the squeezed box, then grows to the natural height', () => {
    layout.max = 300;
    render(<Sheet />);
    expect(minimum()).toBe('300px');
    resize({ max: 900 });
    expect(minimum()).toBe('500px');
  });

  it('a list that hits the cap and gets shorter keeps the sheet at the cap', () => {
    render(<Sheet />);
    expect(minimum()).toBe('500px');
    resize({ content: 1200 });
    expect(sheet().getBoundingClientRect().height).toBe(900);
    expect(minimum()).toBe('900px');
    resize({ content: 500 });
    expect(sheet().getBoundingClientRect().height).toBe(900);
    expect(minimum()).toBe('900px');
  });

  it('step change resets', () => {
    const { rerender } = render(<Sheet step="list" />);
    expect(minimum()).toBe('500px');
    layout.content = 100;
    rerender(<Sheet step="list" />);
    resize({});
    expect(minimum()).toBe('500px');
    rerender(<Sheet step="add" />);
    expect(minimum()).toBe('200px');
  });

  it('reopen starts fresh', () => {
    const { unmount } = render(<Sheet />);
    resize({ content: 600 });
    expect(minimum()).toBe('700px');
    unmount();
    expect(observers).toHaveLength(0);
    layout.content = 200;
    render(<Sheet />);
    expect(minimum()).toBe('300px');
  });
});

describe('SheetPlaceholder', () => {
  it('shows a readable hint over invisible content of the same size', () => {
    render(<SheetPlaceholder hint="Выбери «Могу» — здесь появится выбор времени"><button type="button">19:00</button></SheetPlaceholder>);
    expect(screen.getByText('Выбери «Могу» — здесь появится выбор времени')).toBeVisible();
    expect(screen.queryByRole('button', { name: '19:00' })).toBeNull();
    const button = screen.getByText('19:00');
    const ghost = button.closest('[aria-hidden="true"]')!;
    expect(ghost).not.toBeNull();
    expect(ghost).toHaveAttribute('inert');
    expect(button.closest('[inert]')).toBe(ghost);
    expect(ghost.parentElement).toHaveClass('sheet-placeholder');
  });

  it('leaves its invisible controls out of the sheet focus loop', () => {
    patch(HTMLElement.prototype, 'getClientRects', { value: () => [{ width: 1, height: 1 }] });
    render(<ActionSheet title="Шторка" onClose={() => {}}>
      <button type="button">Могу</button>
      <SheetPlaceholder hint="Выбери «Могу» — здесь появится выбор времени"><button type="button">19:00</button></SheetPlaceholder>
    </ActionSheet>);
    const real = screen.getByRole('button', { name: 'Могу', hidden: true });
    real.focus();
    fireEvent.keyDown(real, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Закрыть', hidden: true })).toHaveFocus();
  });

  it('keeps its own class next to the shared one', () => {
    const { container } = render(<SheetPlaceholder hint="Подсказка" className="availability-placeholder"><p>Время</p></SheetPlaceholder>);
    expect(container.firstElementChild).toHaveClass('sheet-placeholder', 'availability-placeholder');
  });
});
