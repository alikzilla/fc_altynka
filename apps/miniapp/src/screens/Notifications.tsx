import { canManage, useMe } from '../state/me';
import { useNotifications } from '../state/notifications';
import { TaskCard } from '../components/TaskCard';
import { Screen, EmptyState, ErrorNote, Loading } from '../components/ui';

export function Notifications() {
  const me = useMe();
  const { data, loading, error, reload } = useNotifications();
  return <Screen title="Уведомления" action={data?.tasks.length ? <span className="count" aria-label={`Задач: ${data.tasks.length}`}>{data.tasks.length}</span> : undefined}>
    {loading && !data && <Loading />}
    {error && <ErrorNote text="Не получилось обновить задачи" retry={reload} />}
    {data && (data.tasks.length ? <><div className="task-list">{data.tasks.map(task => <TaskCard key={task.id} task={task} />)}</div><p className="muted center tasks-note">Выполненные задачи исчезнут из списка</p></> : <EmptyState title="Новых задач нет" text={canManage(me) ? 'Счета на оплату и игры без назначенного времени появятся здесь.' : 'Когда появится счёт на оплату, он будет здесь.'} />)}
  </Screen>;
}
