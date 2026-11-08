import { formatKzPhone, normalizeKzPhone, type MeDto, type PlayerProfileDto, type Role } from '@altynka/core';
import { useRef, useState } from 'react';
import { Link } from 'wouter';
import { Icon } from '../components/Icon';
import { api, ApiError } from '../lib/api';
import { creatableCommunities, useMe, useReloadMe, useUpdateMe } from '../state/me';
import { haptic } from '../lib/tg';
import { ErrorNote, Screen, useToast } from '../components/ui';
import { PlayerAchievements, PlayerSportsCard } from '../components/PlayerSports';
import { PlayerGameHistory } from '../components/PlayerGameHistory';
import { useResource } from '../hooks/useResource';
import { SystemSettings } from './SystemSettings';

/** Only the role: group names can be long. With several groups, the highest role. */
function roleLine(me: MeDto) {
  if (!me.communities.length) return 'player';
  const rank = { admin: 2, organizer: 1, player: 0 } as const;
  return me.communities.reduce((best, c) => rank[c.role] > rank[best] ? c.role : best, 'player' as Role);
}

export function Profile() {
  const me = useMe();
  const sportingProfile = useResource<PlayerProfileDto>(`/api/players/${me.userId}`);
  const telegramName = me.telegram ? [me.telegram.firstName, me.telegram.lastName].filter(Boolean).join(' ') : me.displayName;
  const reloadMe = useReloadMe();
  const updateMe = useUpdateMe();
  const toast = useToast();
  const [name, setName] = useState(me.displayName);
  const [phone, setPhone] = useState(me.kaspiPhone ? formatKzPhone(me.kaspiPhone) : '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [setupSaved, setSetupSaved] = useState(false);
  const completed = setupSaved || (me.profileCompleted ?? !!me.kaspiPhone);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving.current) return;
    const normalized = phone.trim() ? normalizeKzPhone(phone) : null;
    if (phone.trim() && !normalized) return setPhoneError('Проверь номер');
    setPhoneError(null);
    setNameError(null);
    saving.current = true;
    setBusy(true);
    try {
      const updated = await api.send<MeDto>('PATCH', '/api/me', { displayName: name.trim(), kaspiPhone: normalized, profileCompleted: true });
      if (updated?.userId === me.userId) updateMe(current => ({ ...current, displayName: updated.displayName, kaspiPhone: updated.kaspiPhone, profileCompleted: updated.profileCompleted }));
      setSetupSaved(true);
      haptic('success');
      toast('Сохранено');
      reloadMe();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'name_taken') setNameError('Это имя уже занято — добавь букву фамилии или номер');
      else if (err instanceof ApiError && err.code === 'receiver_needs_phone') setPhoneError('Тебе переводят по открытому счёту — номер нужен');
      else toast('Не получилось сохранить');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen title="Профиль">
      <PlayerSportsCard name={telegramName || me.displayName} username={me.telegram?.username} photoUrl={me.telegram?.photoUrl}
        role={roleLine(me)} playingPosition={me.playingPosition} dominantFoot={me.dominantFoot} rating={me.rating} statistics={sportingProfile.data?.statistics}/>
      {me.rating && !me.rating.selfAssessment && <Link className="btn primary wide" href="/profile/skills">Оценить свои навыки</Link>}
      {sportingProfile.error && <ErrorNote text="Не получилось загрузить статистику" retry={sportingProfile.reload}/>}
      {sportingProfile.data?.statistics && <PlayerAchievements statistics={sportingProfile.data.statistics}/>}
      {sportingProfile.data && <PlayerGameHistory profile={sportingProfile.data}/>}
      {!completed && <><h2 className="section">В команде</h2>
      <form className="card material-blue form profile-form" onSubmit={save} aria-busy={busy}>
        <fieldset className="form-fields" disabled={busy}>
        <label>
          Имя в списках
          <input required disabled={busy} autoComplete="nickname" maxLength={24} value={name} aria-invalid={!!nameError} aria-describedby={nameError ? 'name-error' : undefined} onChange={e => setName(e.target.value)} />
          {nameError && <span id="name-error" className="field-error" role="alert">{nameError}</span>}
        </label>
        <label>
          Номер Kaspi
          <input disabled={busy} type="tel" autoComplete="tel" inputMode="tel" placeholder="+7 707 123 45 67" value={phone} aria-invalid={!!phoneError} aria-describedby={phoneError ? 'phone-error' : undefined} onChange={e => setPhone(e.target.value)} />
          {phoneError && <span id="phone-error" className="field-error" role="alert">{phoneError}</span>}
        </label>
        <p className="muted">Номер нужен, если ты платишь за поле: его покажут в счёте.</p>
        </fieldset>
        <button className="btn primary wide" disabled={busy || !name.trim()}>
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </form></>}
      <h2 className="section" id="profile-editing">Настройка профиля</h2>
      <nav className="profile-management" aria-labelledby="profile-editing">
        <Link className="card task-preview material-graphite" href="/profile/settings/name"><span className="task-icon"><Icon name="user" /></span><span className="task-copy"><b>Изменить имя</b><small>{me.displayName}</small></span><Icon name="back" className="chevron-right" /></Link>
        <Link className="card task-preview material-graphite" href="/profile/settings/payment"><span className="task-icon"><Icon name="receipt" /></span><span className="task-copy"><b>Изменить оплату</b><small>Номер Kaspi для переводов</small></span><Icon name="back" className="chevron-right" /></Link>
        <Link className="card task-preview material-graphite" href="/profile/settings/football"><span className="task-icon"><Icon name="ball" /></span><span className="task-copy"><b>Изменить футбольные данные</b><small>Позиция на поле и рабочая нога</small></span><Icon name="back" className="chevron-right" /></Link>
      </nav>
      <SystemSettings />
      <h2 className="section" id="profile-team">{creatableCommunities(me).length > 0 ? 'Управление' : 'Игроки'}</h2>
      <nav className="profile-management" aria-labelledby="profile-team"><Link className="card task-preview material-graphite" href="/players"><span className="task-icon"><Icon name="people" /></span><span className="task-copy"><b>Игроки</b><small>Профили, характеристики и рейтинг</small></span><Icon name="back" className="chevron-right" /></Link></nav>
    </Screen>
  );
}
