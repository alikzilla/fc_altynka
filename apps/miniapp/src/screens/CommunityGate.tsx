import type { CommunitiesDto, CommunityDto, MeDto } from '@altynka/core';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { api, ApiError } from '../lib/api';
import { contextForStartParam } from '../lib/startParam';
import { queryClient } from '../lib/queryClient';
import { startParam } from '../lib/tg';
import { setCommunityId } from '../state/community';
import { EmptyState, ErrorNote, Loading, Screen } from '../components/ui';
import { Icon } from '../components/Icon';
import { useResource } from '../hooks/useResource';

function CommunityHeader({ title, onChoose }: { title: string; onChoose: () => void }) {
  const { data: me } = useResource<MeDto>('/api/me');
  return <div className="community-bar"><button className="community-switch" type="button" onClick={onChoose} aria-label="Сменить команду">
    <Icon name="people" /><span>{me?.community?.title ?? title}</span><span className="community-switch-action">Сменить</span>
  </button></div>;
}

export function CommunityGate({ children }: { children: (community: CommunityDto) => ReactNode }) {
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState<CommunityDto | null>(null);
  const [choices, setChoices] = useState<CommunityDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<'entry' | 'choices'>('entry');

  const enter = useCallback((community: CommunityDto) => {
    setCommunityId(community.id);
    setSelected(community);
    setError(null);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const options = { communityId: null, signal: controller.signal };
    setLoading(true);
    setError(null);
    const load = async () => {
      try {
        const context = contextForStartParam(mode === 'entry' ? startParam() : undefined);
        const eventId = context.eventId ?? (mode === 'entry' ? Number(/^\/event\/([1-9]\d*)/.exec(window.location.pathname)?.[1] ?? 0) : 0);
        if (eventId) {
          const result = await api.get<{ community: CommunityDto }>(`/api/context?eventId=${eventId}`, options);
          if (!controller.signal.aborted) enter(result.community);
        } else if (context.communityId) {
          // The next /me request validates actual membership before any team data is shown.
          if (!controller.signal.aborted) enter({ id: context.communityId, title: 'Команда' });
        } else {
          const result = await api.get<CommunitiesDto>('/api/communities', options);
          if (controller.signal.aborted) return;
          setChoices(result.communities);
          if (mode === 'entry' && result.communities.length === 1) enter(result.communities[0]);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof ApiError ? e : new ApiError(0, 'network'));
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [attempt, enter, mode]);

  const choose = () => {
    void queryClient.cancelQueries({ queryKey: ['api'] });
    setCommunityId(null);
    setSelected(null);
    setMode('choices');
    setAttempt(n => n + 1);
    navigate('/matches', { replace: true });
  };

  if (selected) return <>
    <CommunityHeader key={selected.id} title={selected.title} onChoose={choose} />
    {children(selected)}
  </>;
  return <Screen title="Твои команды">
    {loading ? <Loading /> : error ? <ErrorNote text={error.status === 401 ? 'Открой приложение из Telegram' : error.status === 403 ? 'Эта команда доступна только участникам её группы' : 'Не получилось открыть команды'} retry={() => setAttempt(n => n + 1)} /> : choices.length ? <>
      <p className="muted">Выбери команду. Матчи, составы и оплаты у каждой свои.</p>
      <div className="profile-management">{choices.map(c => <button key={c.id} className="card task-preview material-graphite community-choice" type="button" onClick={() => enter(c)}>
        <span className="task-icon"><Icon name="people" /></span><span className="task-copy"><b>{c.title}</b><small>Открыть команду</small></span><Icon name="back" className="chevron-right" />
      </button>)}</div>
    </> : <EmptyState title="Подключи свою команду" text="Добавь бота в Telegram-группу, назначь его администратором с правом закреплять сообщения и отправь /bind. Если команда уже подключена, открой приложение по кнопке в её группе." />}
  </Screen>;
}
