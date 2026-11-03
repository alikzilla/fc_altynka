import type { EventDetailDto, SignupDto } from '@altynka/core';
import { useLocation } from 'wouter';
import { api, ApiError } from '../api';
import { isOpen } from '../labels';
import { canManage, useMe } from '../me';
import { haptic } from '../tg';
import { ConfirmButton, useToast } from '../ui';

type JoinResult = { kind: 'main' | 'reserve' | 'already'; position: number; restored?: boolean; inMain?: boolean };

export function EventList({ ev, reload }: { ev: EventDetailDto; reload: () => void }) {
  const me = useMe();
  const toast = useToast();
  const [, navigate] = useLocation();
  const open = isOpen(ev.status);
  const manage = canManage(me) && open;

  async function run<T>(fn: () => Promise<T>, ok?: (r: T) => string) {
    try {
      const r = await fn();
      haptic('success');
      if (ok) toast(ok(r));
    } catch (e) {
      haptic('error');
      toast(e instanceof ApiError && e.status === 409 ? 'Запись закрыта' : 'Не получилось, попробуй ещё раз');
    }
    reload();
  }

  const join = () =>
    run(
      () => api.send<JoinResult>('POST', `/api/events/${ev.id}/join`),
      r => (r.kind === 'reserve' ? `Мест нет, ты в резерве №${r.position}` : r.kind === 'already' ? `Ты уже в списке, №${r.position}` : `Ты №${r.position} в основе`),
    );
  const leave = () => run(() => api.send('POST', `/api/events/${ev.id}/leave`), () => 'Выписал. Передумаешь в течение 2 минут — место сохранится');
  const remove = (s: SignupDto) => run(() => api.send('DELETE', `/api/signups/${s.id}`), () => `${s.name} убран из списка`);
  const cancel = () => run(() => api.send('POST', `/api/events/${ev.id}/cancel`), () => 'Сбор отменён');

  const canRemove = (s: SignupDto) => open && (canManage(me) || (s.userId === null && s.invitedByUserId === me.userId));

  const row = (s: SignupDto, i: number) => (
    <li key={s.id} className={`person ${s.userId === me.userId ? 'me' : ''}`}>
      <span className="num">{i + 1}</span>
      <span className="name">
        {s.name}
        {s.guestOfName && <span className="muted"> {`(друг: ${s.guestOfName})`}</span>}
      </span>
      {canRemove(s) && <ConfirmButton label="Убрать" confirmLabel="Точно убрать?" onConfirm={() => remove(s)} />}
    </li>
  );

  return (
    <>
      {open && (
        <div className="actions">
          {ev.my ? (
            <button className="btn wide" onClick={leave}>
              Не иду
            </button>
          ) : (
            <button className="btn primary wide" onClick={join}>
              Иду
            </button>
          )}
          <button className="btn wide" onClick={() => navigate(`/event/${ev.id}/guest`)}>
            + Друг
          </button>
        </div>
      )}
      {manage && (
        <button className="btn wide" onClick={() => navigate(`/event/${ev.id}/schedule`)}>
          Назначить игру
        </button>
      )}
      <h2 className="section">
        Основа · {ev.main.length}/{ev.limit}
      </h2>
      <ul className="card list">{ev.main.length ? ev.main.map((s, i) => row(s, i)) : <li className="muted">Пока никого</li>}</ul>
      {ev.reserve.length > 0 && (
        <>
          <h2 className="section">Резерв</h2>
          <ul className="card list">{ev.reserve.map((s, i) => row(s, i))}</ul>
        </>
      )}
      {manage && <ConfirmButton className="btn-text danger-text" label="Отменить сбор" confirmLabel="Точно отменить сбор?" onConfirm={cancel} />}
    </>
  );
}
