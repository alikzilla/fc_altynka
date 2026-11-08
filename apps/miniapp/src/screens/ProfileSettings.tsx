import {
  DOMINANT_FEET, PLAYING_POSITIONS, dominantFootLabel, formatKzPhone, normalizeKzPhone, playingPositionLabel,
  type DominantFoot, type PlayingPosition, type MeDto,
} from '@altynka/core';
import { useId, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useMe, useReloadMe, useUpdateMe } from '../state/me';
import { haptic } from '../lib/tg';
import { useToast } from '../components/ui';
import { ActionSheet } from '../components/ActionSheet';

export type SettingsSection = 'payment' | 'name' | 'football';
const sections: { id: SettingsSection; title: string }[] = [
  { id: 'payment', title: 'Оплата' },
  { id: 'name', title: 'Изменить имя' },
  { id: 'football', title: 'Футбольные данные' },
];

export const isSettingsSection = (value: string | undefined): value is SettingsSection => sections.some(item => item.id === value);

/** Name, Kaspi number and football data are edited in a bottom sheet over the profile. */
export function ProfileSettingsSheet({ section, onClose }: { section: SettingsSection; onClose: () => void }) {
  const selected = sections.find(item => item.id === section)!;
  return <SettingsForm key={selected.id} section={selected.id} title={selected.title} onClose={onClose} />;
}

function SettingsForm({ section, title, onClose }: { section: SettingsSection; title: string; onClose: () => void }) {
  const formId = useId();
  const me = useMe();
  const reloadMe = useReloadMe();
  const updateMe = useUpdateMe();
  const toast = useToast();
  const [name, setName] = useState(me.displayName);
  const [phone, setPhone] = useState(me.kaspiPhone ? formatKzPhone(me.kaspiPhone) : '');
  const [position, setPosition] = useState<PlayingPosition | ''>(me.playingPosition ?? '');
  const [foot, setFoot] = useState<DominantFoot | ''>(me.dominantFoot ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    const normalized = phone.trim() ? normalizeKzPhone(phone) : null;
    if (section === 'payment' && phone.trim() && !normalized) return setError('Проверь номер');
    if (section === 'name' && !name.trim()) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    const body = section === 'payment' ? { kaspiPhone: normalized }
      : section === 'name' ? { displayName: name.trim() }
      : { playingPosition: position || null, dominantFoot: foot || null };
    try {
      const updated = await api.send<MeDto>('PATCH', '/api/me', body);
      if (updated?.userId === me.userId) updateMe(current => ({ ...current,
        ...(section === 'payment' ? { kaspiPhone: updated.kaspiPhone, profileCompleted: updated.profileCompleted }
          : section === 'name' ? { displayName: updated.displayName }
          : { playingPosition: updated.playingPosition, dominantFoot: updated.dominantFoot }),
      }));
      haptic('success');
      toast('Сохранено');
      reloadMe();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'name_taken') setError('Это имя уже занято — добавь букву фамилии или номер');
      else if (err instanceof ApiError && err.code === 'receiver_needs_phone') setError('Тебе переводят по открытому счёту — номер нужен');
      else setError('Не получилось сохранить. Попробуй ещё раз.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return <ActionSheet title={title} onClose={onClose} busy={busy} footer={<button type="submit" form={formId} className="btn primary wide" disabled={busy || (section === 'name' && !name.trim())}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>}>
    <form id={formId} className="form profile-form profile-settings-form" onSubmit={save} aria-busy={busy}>
      <fieldset className="form-fields" disabled={busy}>
        {section === 'payment' && <>
          <label>Номер Kaspi<input type="tel" autoComplete="tel" inputMode="tel" placeholder="+7 707 123 45 67" value={phone} aria-invalid={!!error} aria-describedby={error ? 'profile-settings-error' : undefined} onChange={event => setPhone(event.target.value)} /></label>
          <p className="muted">Номер нужен, если ты платишь за поле: его покажут в счёте. В остальных случаях его можно не указывать.</p>
        </>}
        {section === 'name' && <label>Имя в списках<input required autoComplete="nickname" maxLength={24} value={name} aria-invalid={!!error} aria-describedby={error ? 'profile-settings-error' : undefined} onChange={event => setName(event.target.value)} /></label>}
        {section === 'football' && <>
          <label>Позиция на поле<select value={position} onChange={event => setPosition(event.target.value as PlayingPosition | '')}>
            <option value="">Не указана</option>{PLAYING_POSITIONS.map(value => <option key={value} value={value}>{playingPositionLabel[value]}</option>)}
          </select></label>
          <label>Рабочая нога<select value={foot} onChange={event => setFoot(event.target.value as DominantFoot | '')}>
            <option value="">Не указана</option>{DOMINANT_FEET.map(value => <option key={value} value={value}>{dominantFootLabel[value]}</option>)}
          </select></label>
          <p className="muted">Выбери основную позицию. Оба поля можно оставить пустыми.</p>
        </>}
      </fieldset>
      {error && <p id="profile-settings-error" className="field-error" role="alert">{error}</p>}
    </form>
  </ActionSheet>;
}
