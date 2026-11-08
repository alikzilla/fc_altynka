import { creatableCommunities, showGroups, useMe } from '../state/me';
import { useNotifications } from '../state/notifications';
import { TaskCard } from '../components/TaskCard';
import { ConnectGroupButton, CONNECT_BOT_TEXT } from '../components/ConnectGroup';
import { Screen, EmptyState, ErrorNote, useReveal } from '../components/ui';
import { TaskListSkeleton } from '../components/skeletons';

export function Notifications() {
  const me = useMe();
  const { data, loading, error, reload } = useNotifications();
  const reveal = useReveal(loading && !data);
  return <Screen title="Задачи" action={data?.tasks.length ? <span className="count" aria-label={`Задач: ${data.tasks.length}`}>{data.tasks.length}</span> : undefined}>
    {loading && !data && <TaskListSkeleton groups={showGroups(me)} />}
    {error && <ErrorNote text="Не получилось обновить задачи" retry={reload} />}
    {data && (data.tasks.length ? <><div className={`task-list ${reveal}`}>{data.tasks.map(task => <TaskCard key={task.id} task={task} />)}</div><p className={`muted center tasks-note ${reveal}`}>Выполненные задачи исчезнут из списка</p></> : <EmptyState className={reveal} title="Новых задач нет" text={me.communities.length === 0 ? CONNECT_BOT_TEXT : creatableCommunities(me).length > 0 ? 'Счета на оплату и матчи без назначенного времени появятся здесь.' : 'Когда появится счёт на оплату, он будет здесь.'} action={me.communities.length === 0 ? <ConnectGroupButton /> : undefined} />)}
  </Screen>;
}
