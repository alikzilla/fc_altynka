import type { AppTheme, MeDto } from '@altynka/core';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useMe, useReloadMe, useUpdateMe } from '../state/me';
import { BOT_USERNAME } from '../lib/bot';
import { addToHomeScreen, canFullscreen, fullscreenPreferred, haptic, openTelegramLink, requestWriteAccess, setFullscreenPreferred } from '../lib/tg';
import { useHomeScreen } from '../hooks/useHomeScreen';
import { Icon } from '../components/Icon';
import { applyTheme, getTheme } from '../lib/theme';
import { useToast } from '../components/ui';

// Ownership survives route unmounts: an obsolete failure must not roll back a newer choice.
let latestThemeOperation = 0;

export function SystemSettings() {
  const me = useMe();
  const reloadMe = useReloadMe();
  const updateMe = useUpdateMe();
  const toast = useToast();
  const [notifications, setNotifications] = useState(me.notifications);
  const [theme, setTheme] = useState<AppTheme>(me.theme ?? getTheme());
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  useEffect(() => setNotifications(me.notifications), [me.notifications]);
  useEffect(() => { if (me.theme) setTheme(me.theme); }, [me.theme]);
  const [fullscreen, setFullscreen] = useState(fullscreenPreferred);
  const homeScreen = useHomeScreen();
  const homeRequested = useRef(false);
  useEffect(() => {
    if (homeScreen !== 'added' || !homeRequested.current) return;
    homeRequested.current = false;
    haptic('success');
    toast('Иконка FC Altynka на главном экране');
  }, [homeScreen, toast]);
  const enabled = notifications?.enabled ?? false;
  const available = notifications?.available ?? false;

  function botSettings() {
    openTelegramLink(`https://t.me/${BOT_USERNAME}?start=settings`);
    toast('Подключи уведомления в личном чате с ботом.');
  }

  async function changeNotifications(nextEnabled: boolean) {
    if (saving.current) return;
    saving.current = true; setBusy(true);
    try {
      if (nextEnabled && !available) {
        const granted = await requestWriteAccess();
        if (granted === null) return botSettings();
        if (!granted) return toast('Разрешение не получено. Настройки не изменились.');
      }
      const updated = await api.send<MeDto>('PATCH', '/api/me', { notificationsEnabled: nextEnabled });
      if (updated?.userId === me.userId) updateMe(current => ({ ...current, notifications: updated.notifications }));
      if (updated.notifications) setNotifications(updated.notifications);
      reloadMe();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'write_access_required') botSettings();
      else toast('Не получилось изменить уведомления. Попробуй ещё раз.', { tone: 'error' });
    } finally { saving.current = false; setBusy(false); }
  }

  async function changeTheme(dark: boolean) {
    if (saving.current) return;
    saving.current = true; setBusy(true);
    const previous = theme;
    const next = dark ? 'dark' : 'light';
    const operation = ++latestThemeOperation;
    setTheme(next); applyTheme(next);
    try {
      const updated = await api.send<MeDto>('PATCH', '/api/me', { theme: next });
      if (operation !== latestThemeOperation) return;
      if (updated?.userId === me.userId) updateMe(current => ({ ...current, theme: updated.theme }));
      reloadMe();
    } catch {
      if (operation !== latestThemeOperation) return;
      setTheme(previous); applyTheme(previous);
      toast('Не получилось сохранить тему. Попробуй ещё раз.', { tone: 'error' });
    } finally { saving.current = false; setBusy(false); }
  }

  return <section className="profile-system-settings" aria-labelledby="system-settings-title">
    <h2 className="section" id="system-settings-title">Системные настройки</h2>
    <div className="card material-graphite system-settings-list" aria-busy={busy}>
      <div className="system-setting-item">
        <label className="system-switch-row">
          <span className="system-switch-copy"><b>Уведомления</b><small id="notification-switch-description">{enabled ? 'Личные уведомления включены' : 'Личные уведомления выключены'}</small></span>
          <input className="system-switch-input" type="checkbox" role="switch" aria-label="Уведомления" aria-describedby="notification-switch-description" checked={enabled} disabled={busy} onChange={e => void changeNotifications(e.target.checked)} />
          <span className="system-switch-control" aria-hidden="true" />
        </label>
        {enabled && !available && <div className="system-setting-recovery"><p className="muted">Бот пока не может писать тебе. Разреши сообщения в Telegram.</p><button type="button" className="btn-text" disabled={busy} onClick={() => void changeNotifications(true)}>Разрешить сообщения</button></div>}
      </div>
      <div className="system-setting-item">
        <label className="system-switch-row">
          <span className="system-switch-copy"><b>Тёмная тема</b><small id="theme-switch-description">{theme === 'dark' ? 'Включена' : 'Светлая тема'}</small></span>
          <input className="system-switch-input" type="checkbox" role="switch" aria-label="Тёмная тема" aria-describedby="theme-switch-description" checked={theme === 'dark'} disabled={busy} onChange={e => void changeTheme(e.target.checked)} />
          <span className="system-switch-control" aria-hidden="true" />
        </label>
      </div>
      {canFullscreen() && <div className="system-setting-item">
        <label className="system-switch-row">
          <span className="system-switch-copy"><b>Во весь экран</b><small id="fullscreen-switch-description">{fullscreen ? 'Приложение занимает весь экран' : 'С верхней панелью Telegram'}</small></span>
          <input className="system-switch-input" type="checkbox" role="switch" aria-label="Во весь экран" aria-describedby="fullscreen-switch-description" checked={fullscreen} onChange={e => { setFullscreen(e.target.checked); setFullscreenPreferred(e.target.checked); }} />
          <span className="system-switch-control" aria-hidden="true" />
        </label>
      </div>}
      {homeScreen && homeScreen !== 'unsupported' && <div className="system-setting-item">
        {homeScreen === 'added'
          ? <div className="system-action-row"><span className="system-switch-copy"><b>Иконка на главном экране</b><small>Уже добавлена: FC Altynka открывается прямо с экрана телефона</small></span><Icon name="check" className="system-action-done" /></div>
          : <button type="button" className="system-action-row" aria-describedby="home-screen-description" onClick={() => { homeRequested.current = true; haptic('light'); addToHomeScreen(); }}>
              <span className="system-switch-copy"><b>Иконка на главном экране</b><small id="home-screen-description">Открывай FC Altynka с экрана телефона, как приложение</small></span>
              <span className="system-action-label">Добавить</span>
            </button>}
      </div>}
    </div>
  </section>;
}
