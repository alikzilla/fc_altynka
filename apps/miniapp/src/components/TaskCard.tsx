import { formatDateRu, formatTenge, type NotificationTaskDto } from '@altynka/core';
import { Link } from 'wouter';
import { Icon } from './Icon';

export function TaskCard({ task, compact = false }: { task: NotificationTaskDto; compact?: boolean }) {
  const payment = task.kind === 'payment';
  const href = task.kind === 'skills' ? '/profile/skills' : task.kind === 'review' ? `/event/${task.eventId}/review` : payment ? `/event/${task.eventId}?tab=bill` : `/event/${task.eventId}/schedule`;
  const title = task.kind === 'skills' ? 'Твои игровые навыки' : task.kind === 'review' ? 'Оценить игру' : payment ? 'Взнос за матч' : 'Назначить игру';
  const description = task.kind === 'skills' ? 'Восемь вопросов для равных команд' : formatDateRu(task.date);
  const icon = payment ? 'receipt' : task.kind === 'skills' || task.kind === 'review' ? 'ball' : 'clock';
  if (compact) return <Link className={`card task-preview ${payment ? 'material-coral' : 'material-blue'}`} href={href}>
    <span className="task-icon"><Icon name={icon} /></span>
    <span className="task-copy"><b>{title}</b><small>{description}</small></span>
    {payment && <strong className="task-preview-amount">{formatTenge(task.due)}</strong>}<Icon name="back" className="chevron-right" />
  </Link>;
  return <article className={`card task-card ${payment ? 'material-coral' : 'material-blue'}`}>
    <h2 className="task-type"><Icon name={icon} />{title}</h2>
    <p className="muted">{description}{task.kind !== 'skills' && task.place ? ` · ${task.place}` : ''}</p>
    {payment ? <><p className="task-amount">{formatTenge(task.due)}</p><p className="muted">Перевести {task.receiverName} за аренду поля</p></> : <p className="muted">{task.kind === 'skills' ? 'Самооценка задаст стартовый рейтинг. Оценки матчей будут его уточнять.' : task.kind === 'review' ? 'Анонимно оцени участников и сам матч. Ответы можно отправить в течение 72 часов после подтверждения игры.' : 'Команда собирается. Нужно указать время и поле.'}</p>}
    <Link className={`btn wide ${payment ? 'primary' : ''}`} href={href}>{task.kind === 'skills' ? 'Заполнить анкету' : task.kind === 'review' ? 'Оценить игру' : payment ? 'Перейти к оплате' : 'Назначить время и поле'}<Icon name="arrow" /></Link>
  </article>;
}
