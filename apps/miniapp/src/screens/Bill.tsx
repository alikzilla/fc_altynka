import { computeBill, formatKzPhone, formatTenge, type BillDto, type EventDetailDto, type Extra, type SignupDto } from '@sbor/core';
import { useMemo, useState } from 'react';
import { api, ApiError } from '../api';
import { transfer } from '../kaspi';
import { canManage, useMe } from '../me';
import { copy, haptic } from '../tg';
import { ConfirmButton, useToast } from '../ui';

type Props = { ev: EventDetailDto; reload: () => void };

const responsible = (s: SignupDto) => s.userId ?? s.invitedByUserId;

function BillForm({ ev, reload, initial, onDone }: Props & { initial?: BillDto; onDone?: () => void }) {
  const me = useMe();
  const toast = useToast();
  const people = useMemo(() => {
    const m = new Map<number, string>([[me.userId, me.displayName]]);
    ev.main.forEach(s => s.userId !== null && m.set(s.userId, s.name));
    return [...m];
  }, [ev.main, me]);
  const [receiver, setReceiver] = useState(initial?.receiver.userId ?? me.userId);
  const [phone, setPhone] = useState(receiver === me.userId ? (me.kaspiPhone ?? '') : '');
  const [field, setField] = useState(initial ? String(initial.fieldAmount) : '');
  const [extras, setExtras] = useState<{ label: string; amount: string }[]>(
    initial?.extras.map(x => ({ label: x.label, amount: String(x.amount) })) ?? [],
  );
  const [picked, setPicked] = useState<Set<number>>(() => new Set(ev.main.map(s => s.id)));
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const extrasClean: Extra[] = extras.filter(x => x.label.trim() && Number(x.amount) > 0).map(x => ({ label: x.label.trim(), amount: Math.round(Number(x.amount)) }));
  const fieldAmount = Math.round(Number(field) || 0);
  const all = [...ev.main, ...ev.reserve];
  const units = new Map<number, number>();
  all.filter(s => picked.has(s.id)).forEach(s => {
    const who = responsible(s);
    if (who !== null) units.set(who, (units.get(who) ?? 0) + 1);
  });
  const preview = units.size && fieldAmount > 0 ? computeBill(fieldAmount, extrasClean, [...units].map(([userId, u]) => ({ userId, units: u }))) : null;

  const toggle = (id: number) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPhoneError(null);
    setBusy(true);
    try {
      await api.send('PUT', `/api/events/${ev.id}/bill`, {
        receiverUserId: receiver,
        receiverKaspiPhone: phone.trim() || undefined,
        fieldAmount,
        extras: extrasClean,
        participantSignupIds: [...picked],
      });
      haptic('success');
      toast('Счёт отправлен в группу');
      onDone?.();
      reload();
    } catch (err) {
      haptic('error');
      if (err instanceof ApiError && err.code === 'bad_phone') setPhoneError('Проверь номер');
      else if (err instanceof ApiError && err.code === 'no_kaspi') setPhoneError('Нужен номер Kaspi получателя');
      else toast('Не получилось выставить счёт');
    }
    setBusy(false);
  }

  const checkbox = (s: SignupDto) => (
    <li key={s.id}>
      <label className="check">
        <input type="checkbox" aria-label={s.name} checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
        <span>
          {s.name}
          {s.guestOfName && <span className="muted"> (друг: {s.guestOfName})</span>}
        </span>
      </label>
    </li>
  );

  return (
    <form className="card form" onSubmit={submit}>
      <label>
        Кто заплатил за поле
        <select
          value={receiver}
          onChange={e => {
            const id = Number(e.target.value);
            setReceiver(id);
            setPhone(id === me.userId ? (me.kaspiPhone ?? '') : '');
          }}
        >
          {people.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Номер Kaspi получателя
        <input inputMode="tel" placeholder="Пусто — если номер уже сохранён" value={phone} onChange={e => setPhone(e.target.value)} />
        {phoneError && <span className="field-error">{phoneError}</span>}
      </label>
      <label>
        Аренда поля, ₸
        <input inputMode="numeric" type="number" min={0} required value={field} onChange={e => setField(e.target.value)} />
      </label>
      {extras.map((x, i) => (
        <div key={i} className="extra">
          <input aria-label={`Расход ${i + 1}`} placeholder="Вода" maxLength={40} value={x.label} onChange={e => setExtras(extras.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
          <input aria-label={`Сумма расхода ${i + 1}`} inputMode="numeric" type="number" min={0} value={x.amount} onChange={e => setExtras(extras.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} />
          <button type="button" className="btn-text danger-text" aria-label={`Убрать расход ${i + 1}`} onClick={() => setExtras(extras.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      {extras.length < 10 && (
        <button type="button" className="btn-text" onClick={() => setExtras([...extras, { label: '', amount: '' }])}>
          + Расход
        </button>
      )}
      <h2 className="section">Кто платит</h2>
      <ul className="list bare">{ev.main.map(checkbox)}</ul>
      {ev.reserve.length > 0 && (
        <details>
          <summary className="muted">Ещё из резерва</summary>
          <ul className="list bare">{ev.reserve.map(checkbox)}</ul>
        </details>
      )}
      {preview && (
        <div className="preview">
          <b>По {formatTenge(preview.share)} с человека</b>
          <span className="muted">Итого {formatTenge(preview.total)}</span>
        </div>
      )}
      <button className="btn primary wide" disabled={busy || !picked.size}>
        Выставить счёт
      </button>
    </form>
  );
}

function MyPayment({ bill, reload }: { bill: BillDto; reload: () => void }) {
  const me = useMe();
  const toast = useToast();
  const line = bill.lines.find(l => l.userId === me.userId);
  if (!line || bill.receiver.userId === me.userId) return null;
  async function paid() {
    try {
      await api.send('POST', `/api/bills/${bill.id}/paid`);
      haptic('success');
      toast('Отметил, спасибо!');
    } catch {
      toast('Не получилось отметить');
    }
    reload();
  }
  if (line.state === 'paid') return <div className="card center">✅ Ты скинул {formatTenge(line.amount)}</div>;
  return (
    <div className="card pay">
      <div className="amount">{line.state === 'underpaid' ? `Доплатить ${formatTenge(line.due)}` : `С тебя ${formatTenge(line.amount)}`}</div>
      <div className="muted">
        {bill.receiver.name} · Kaspi {formatKzPhone(bill.receiver.kaspiPhone)}
      </div>
      <div className="actions">
        <button className="btn primary wide" onClick={() => transfer(bill.receiver.kaspiPhone)}>
          Перевести
        </button>
        <button className="btn wide" onClick={() => copy(String(line.due)).then(() => toast('Сумма скопирована'))}>
          Скопировать сумму
        </button>
      </div>
      <button className="btn wide" onClick={paid}>
        Я скинул
      </button>
    </div>
  );
}

function Lines({ bill, editable, reload }: { bill: BillDto; editable: boolean; reload: () => void }) {
  const toast = useToast();
  const toggle = async (id: number, paid: boolean) => {
    try {
      await api.send('POST', `/api/bill-lines/${id}`, { paid });
    } catch {
      toast('Не получилось обновить');
    }
    reload();
  };
  return (
    <ul className="card list">
      {bill.lines.map(l => (
        <li key={l.id} className="person">
          <span className="name">
            {l.state === 'paid' ? '✅' : l.state === 'underpaid' ? '⚠️' : '⏳'} {l.name}
            {l.units > 1 && <span className="muted"> ×{l.units}</span>}
          </span>
          <span className="muted">{l.state === 'underpaid' ? `доплатить ${formatTenge(l.due)}` : formatTenge(l.amount)}</span>
          {editable && l.userId !== bill.receiver.userId && (
            <input type="checkbox" aria-label={`${l.name} скинул`} checked={l.state === 'paid'} onChange={e => toggle(l.id, e.target.checked)} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function Bill({ ev, reload }: Props) {
  const me = useMe();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const manage = canManage(me);
  const bill = ev.bill;
  const canBill = manage && ev.status !== 'cancelled' && ev.status !== 'closed';
  if (!bill || editing) {
    if (!canBill) return <div className="card muted center">Счёт ещё не выставлен</div>;
    return <BillForm ev={ev} reload={reload} initial={bill ?? undefined} onDone={() => setEditing(false)} />;
  }
  const isReceiver = bill.receiver.userId === me.userId;
  const post = async (path: string, ok: string) => {
    try {
      await api.send('POST', path);
      toast(ok);
    } catch {
      toast('Не получилось');
    }
    reload();
  };
  return (
    <>
      <div className="card">
        <b>
          С каждого по {formatTenge(bill.share)} → {bill.receiver.name}
        </b>
        <span className="muted">
          Kaspi {formatKzPhone(bill.receiver.kaspiPhone)} · итого {formatTenge(bill.total)}
          {bill.status === 'closed' ? ' · закрыт' : ''}
        </span>
      </div>
      <MyPayment bill={bill} reload={reload} />
      <Lines bill={bill} editable={(manage || isReceiver) && bill.status === 'open'} reload={reload} />
      {manage && bill.status === 'open' && (
        <>
          <ConfirmButton className="btn wide" label="Напомнить должникам" confirmLabel="Отправить напоминание в группу?" onConfirm={() => post(`/api/bills/${bill.id}/remind`, 'Напоминание отправлено')} />
          <div className="actions">
            <button className="btn wide" onClick={() => setEditing(true)}>
              Изменить
            </button>
            <ConfirmButton className="btn wide" label="Закрыть счёт" confirmLabel="Точно закрыть?" onConfirm={() => post(`/api/bills/${bill.id}/close`, 'Счёт закрыт')} />
          </div>
        </>
      )}
    </>
  );
}
