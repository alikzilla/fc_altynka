import { creatableCommunities, useMe } from '../state/me';
import { useNotifications } from '../state/notifications';
import { TaskCard } from '../components/TaskCard';
import { ConnectGroupButton, CONNECT_BOT_TEXT } from '../components/ConnectGroup';
import { Screen, EmptyState, ErrorNote, Loading } from '../components/ui';

export function Notifications() {
  const me = useMe();
  const { data, loading, error, reload } = useNotifications();
  return <Screen title="Уведомления" action={data?.tasks.length ? <span className="count" aria-label={`Задач: ${data.tasks.length}`}>{data.tasks.length}</span> : undefined}>
    {loading && !data && <Loading />}
    {error && <ErrorNote text="Не получилось обновить задачи" retry={reload} />}
    {data && (data.tasks.length ? <><div className="task-list">{data.tasks.map(task => <TaskCard key={task.id} task={task} />)}</div><p className="muted center tasks-note">Выполненные задачи исчезнут из списка</p></> : <EmptyState title="Новых задач нет" text={me.communities.length === 0 ? CONNECT_BOT_TEXT : creatableCommunities(me).length > 0 ? 'Счета на оплату и игры без назначенного времени появятся здесь.' : 'Когда появится счёт на оплату, он будет здесь.'} action={me.communities.length === 0 ? <ConnectGroupButton /> : undefined} />)}
  </Screen>;
}
