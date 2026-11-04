import type { MemberDto, Role } from '@altynka/core';
import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useMe } from '../state/me';
import { haptic } from '../lib/tg';
import { EmptyState, ErrorNote, Loading, Screen, useToast } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { Avatar } from '../components/Icon';

const ROLE_LABEL: Record<Role, string> = { admin: 'Админ', organizer: 'Организатор', player: 'Игрок' };

function Editor({ m, onSaved }: { m: MemberDto; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(m.displayName);
  const patch = async (body: Partial<Pick<MemberDto, 'level' | 'displayName'>> & { role?: 'organizer' | 'player' }) => {
    try {
      await api.send('PATCH', `/api/members/${m.userId}`, body);
      haptic('success');
    } catch (err) {
      toast(err instanceof ApiError && err.code === 'name_taken' ? 'Это имя уже занято' : 'Не получилось сохранить');
    }
    onSaved();
  };
  return (
    <div className="editor">
      <div className="muted">Уровень</div>
      <div className="levels">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button key={n} type="button" className={`chip-btn ${m.level === n ? 'on' : ''}`} aria-pressed={m.level === n} onClick={() => patch({ level: n })}>
            {n}
          </button>
        ))}
      </div>
      {m.role !== 'admin' && (
        <button type="button" className="btn wide" onClick={() => patch({ role: m.role === 'organizer' ? 'player' : 'organizer' })}>
          {m.role === 'organizer' ? 'Сделать игроком' : 'Сделать организатором'}
        </button>
      )}
      <div className="extra">
        <input aria-label="Имя в списках" maxLength={24} value={name} onChange={e => setName(e.target.value)} />
        <button type="button" className="btn" disabled={!name.trim() || name.trim() === m.displayName} onClick={() => patch({ displayName: name.trim() })}>
          Имя
        </button>
      </div>
    </div>
  );
}

export function Players() {
  const me = useMe();
  const { data, error, loading, reload } = useResource<MemberDto[]>('/api/members');
  const [open, setOpen] = useState<number | null>(null);
  const isAdmin = me.role === 'admin';
  return (
    <Screen title="Игроки" back="/profile">
      {loading && !data && <Loading />}
      {error && <ErrorNote text="Не получилось загрузить игроков" retry={reload} />}
      {data && !data.length && <EmptyState title="В списке пока никого" text="Участники появятся после открытия приложения из группы." />}
      {data && data.length > 0 && (
        <ul className="card list">
          {data.map(m => (
            <li key={m.userId} className="member">
              {isAdmin ? (
                <button type="button" className="btn-plain row between" aria-expanded={open === m.userId} onClick={() => setOpen(open === m.userId ? null : m.userId)}>
                  <span className="member-name"><Avatar name={m.displayName} /><span>{m.displayName}</span></span>
                  <span className="muted">
                    {ROLE_LABEL[m.role]} · уровень {m.level}
                  </span>
                </button>
              ) : (
                <div className="row between member-row">
                  <span className="member-name"><Avatar name={m.displayName} /><span>{m.displayName}</span></span>
                  <span className="muted">
                    {ROLE_LABEL[m.role]} · <span>уровень {m.level}</span>
                  </span>
                </div>
              )}
              {isAdmin && open === m.userId && <Editor m={m} onSaved={reload} />}
            </li>
          ))}
        </ul>
      )}
      <p className="muted">Уровни видят только организаторы. Игроки их не видят ни здесь, ни в группе.</p>
    </Screen>
  );
}
