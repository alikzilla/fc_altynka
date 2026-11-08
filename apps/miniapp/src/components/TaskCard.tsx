import { formatDateRu, formatTenge, type NotificationTaskDto } from '@altynka/core';
import { Link } from 'wouter';
import { queryClient, resourceKey } from '../lib/queryClient';
import { isMyGroup, useMe } from '../state/me';
import { GroupTag } from './GroupTag';
import { Icon } from './Icon';
import { KaspiPay } from './KaspiPay';
import { PaymentMark, useReturnFromKaspi } from './PaymentMark';

type PaymentTask = Extract<NotificationTaskDto, { kind: 'payment' }>;

/** A debt in a group the person has left: its match page is gone, so it is paid right from the card. */
function LeftGroupPayment({ task }: { task: PaymentTask }) {
  const kaspi = useReturnFromKaspi();
  return <article className="card task-card material-coral pay">
    <GroupTag community={task.community} />
    <h2 className="task-type"><Icon name="receipt" />Взнос за матч</h2>
    <p className="muted">{formatDateRu(task.date)}{task.place ? ` · ${task.place}` : ''}</p>
    <KaspiPay amount={task.due} receiverName={task.receiverName} kaspiPhone={task.receiverKaspiPhone} payable showPhone onTransfer={kaspi.onTransfer} />
    {/* Someone who left the group may only mark the debt paid, so there is nothing to undo here. */}
    <PaymentMark billId={task.billId} returnedFromKaspi={kaspi.returned} canUndo={false} onChanged={() => void queryClient.invalidateQueries({ queryKey: resourceKey('/api/notifications') })} />
  </article>;
}

export function TaskCard({ task, compact = false }: { task: NotificationTaskDto; compact?: boolean }) {
  const me = useMe();
  const payment = task.kind === 'payment';
  const leftGroup = payment && !isMyGroup(me, task.community.id);
  const href = task.kind === 'skills' ? '/profile/skills' : task.kind === 'review' ? `/event/${task.eventId}/review` : leftGroup ? '/notifications' : payment ? `/event/${task.eventId}?tab=bill` : `/event/${task.eventId}/schedule`;
  const title = task.kind === 'skills' ? 'Твои игровые навыки' : task.kind === 'review' ? 'Оценить матч' : payment ? 'Взнос за матч' : 'Назначить матч';
  const description = task.kind === 'skills' ? 'Восемь вопросов для равных команд' : formatDateRu(task.date);
  const icon = payment ? 'receipt' : task.kind === 'skills' || task.kind === 'review' ? 'ball' : 'clock';
  if (compact) return <Link className={`card task-preview ${payment ? 'material-coral' : 'material-blue'}`} href={href}>
    <span className="task-icon"><Icon name={icon} /></span>
    <span className="task-copy">{task.kind !== 'skills' && <GroupTag community={task.community} />}<b>{title}</b><small>{description}</small></span>
    {payment && <strong className="task-preview-amount">{formatTenge(task.due)}</strong>}<Icon name="back" className="chevron-right" />
  </Link>;
  if (leftGroup) return <LeftGroupPayment task={task} />;
  return <article className={`card task-card ${payment ? 'material-coral' : 'material-blue'}`}>
    {task.kind !== 'skills' && <GroupTag community={task.community} />}
    <h2 className="task-type"><Icon name={icon} />{title}</h2>
    <p className="muted">{description}{task.kind !== 'skills' && task.place ? ` · ${task.place}` : ''}</p>
    {payment ? <><p className="task-amount">{formatTenge(task.due)}</p><p className="muted">Получатель — {task.receiverName} · аренда поля</p></> : <p className="muted">{task.kind === 'skills' ? 'Самооценка задаст стартовый рейтинг. Оценки матчей будут его уточнять.' : task.kind === 'review' ? 'Анонимно оцени участников и сам матч. Ответы можно отправить в течение 72 часов после завершения матча.' : 'Команда собирается. Нужно указать время и поле.'}</p>}
    <Link className={`btn wide ${payment ? 'primary' : ''}`} href={href}>{task.kind === 'skills' ? 'Заполнить анкету' : task.kind === 'review' ? 'Оценить матч' : payment ? 'Перейти к оплате' : 'Назначить время и поле'}<Icon name="arrow" /></Link>
  </article>;
}
