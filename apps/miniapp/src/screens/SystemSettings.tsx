import type { AppTheme, MeDto } from '@altynka/core';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useMe, useReloadMe, useUpdateMe } from '../state/me';
import { BOT_USERNAME } from '../lib/bot';
import { openTelegramLink, requestWriteAccess } from '../lib/tg';
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
      else toast('Не получилось изменить уведомления. Попробуй ещё раз.');
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
      toast('Не получилось сохранить тему. Попробуй ещё раз.');
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
    </div>
  </section>;
}
