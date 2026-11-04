import { formatDateRu, formatTenge, type NotificationTaskDto } from '@altynka/core';
import { Link } from 'wouter';
import { Icon } from './Icon';

export function TaskCard({ task, compact = false }: { task: NotificationTaskDto; compact?: boolean }) {
  const payment = task.kind === 'payment';
  const href = payment ? `/event/${task.eventId}?tab=bill` : `/event/${task.eventId}/schedule`;
  if (compact) return <Link className={`card task-preview ${payment ? 'material-coral' : 'material-blue'}`} href={href}>
    <span className="task-icon"><Icon name={payment ? 'receipt' : 'clock'} /></span>
    <span className="task-copy"><b>{payment ? 'Взнос за матч' : 'Назначить игру'}</b><small>{formatDateRu(task.date)}</small></span>
    {payment && <strong className="task-preview-amount">{formatTenge(task.due)}</strong>}<Icon name="back" className="chevron-right" />
  </Link>;
  return <article className={`card task-card ${payment ? 'material-coral' : 'material-blue'}`}>
    <h2 className="task-type"><Icon name={payment ? 'receipt' : 'clock'} />{payment ? 'Взнос за матч' : 'Назначить игру'}</h2>
    <p className="muted">{formatDateRu(task.date)}{task.place ? ` · ${task.place}` : ''}</p>
    {payment ? <><p className="task-amount">{formatTenge(task.due)}</p><p className="muted">Перевести {task.receiverName} за аренду поля</p></> : <p className="muted">Команда собирается. Нужно указать время и поле.</p>}
    <Link className={`btn wide ${payment ? 'primary' : ''}`} href={href}>{payment ? 'Перейти к оплате' : 'Назначить время и поле'}<Icon name="arrow" /></Link>
  </article>;
}
