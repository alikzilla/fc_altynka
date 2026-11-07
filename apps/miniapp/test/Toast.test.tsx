import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ToastProvider, useToast } from '../src/components/ui';

afterEach(() => vi.useRealTimers());

function Example({ onUndo }: { onUndo: () => void }) {
  const toast = useToast();
  return <>
    <button onClick={() => toast('Игроки поменялись командами', { action: { label: 'Отменить', onClick: onUndo } })}>Обменять</button>
    <button onClick={() => toast('Составы опубликованы')}>Опубликовать</button>
    <button onClick={() => toast(null)}>Закрыть уведомление</button>
  </>;
}

test('the application notification exposes an undo action without changing ordinary messages', () => {
  const onUndo = vi.fn();
  render(<ToastProvider><Example onUndo={onUndo} /></ToastProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Обменять' }));
  const notification = screen.getByRole('status');
  expect(within(notification).getByText('Игроки поменялись командами')).toBeVisible();
  fireEvent.click(within(notification).getByRole('button', { name: 'Отменить' }));
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('status')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
  expect(screen.getByRole('status')).toHaveTextContent('Составы опубликованы');
  expect(within(screen.getByRole('status')).queryByRole('button')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомление' }));
  expect(screen.queryByRole('status')).toBeNull();
});

test('undo remains available for eight seconds while ordinary notifications keep their existing timeout', () => {
  vi.useFakeTimers();
  render(<ToastProvider><Example onUndo={() => {}} /></ToastProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Обменять' }));
  act(() => vi.advanceTimersByTime(3000));
  expect(within(screen.getByRole('status')).getByRole('button', { name: 'Отменить' })).toBeVisible();
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.queryByRole('status')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
  act(() => vi.advanceTimersByTime(2500));
  expect(screen.queryByRole('status')).toBeNull();
});

test('an action may replace its notification with feedback', () => {
  function Feedback() {
    const toast = useToast();
    return <button onClick={() => toast('Обмен выполнен', { action: { label: 'Отменить', onClick: () => toast('Обмен отменён') } })}>Обменять</button>;
  }
  render(<ToastProvider><Feedback /></ToastProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Обменять' }));
  fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Отменить' }));
  expect(screen.getByRole('status')).toHaveTextContent('Обмен отменён');
  expect(within(screen.getByRole('status')).queryByRole('button')).toBeNull();
});
