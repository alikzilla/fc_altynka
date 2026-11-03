import { formatKzPhone, normalizeKzPhone } from '@altynka/core';
import { useState } from 'react';
import { api, ApiError } from '../api';
import { useMe, useReloadMe } from '../me';
import { haptic } from '../tg';
import { Screen, useToast } from '../ui';

export function Profile() {
  const me = useMe();
  const reloadMe = useReloadMe();
  const toast = useToast();
  const [name, setName] = useState(me.displayName);
  const [phone, setPhone] = useState(me.kaspiPhone ? formatKzPhone(me.kaspiPhone) : '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const normalized = phone.trim() ? normalizeKzPhone(phone) : null;
    if (phone.trim() && !normalized) return setPhoneError('Проверь номер');
    setPhoneError(null);
    setNameError(null);
    try {
      await api.send('PATCH', '/api/me', { displayName: name.trim(), kaspiPhone: normalized });
      haptic('success');
      toast('Сохранено');
      reloadMe();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'name_taken') setNameError('Это имя уже занято — добавь букву фамилии или номер');
      else if (err instanceof ApiError && err.code === 'receiver_needs_phone') setPhoneError('Тебе переводят по открытому счёту — номер нужен');
      else toast('Не получилось сохранить');
    }
  }
  return (
    <Screen title="Профиль">
      <form className="card form" onSubmit={save}>
        <label>
          Имя в списках
          <input required maxLength={24} value={name} onChange={e => setName(e.target.value)} />
          {nameError && <span className="field-error">{nameError}</span>}
        </label>
        <label>
          Номер Kaspi
          <input inputMode="tel" placeholder="+7 707 123 45 67" value={phone} onChange={e => setPhone(e.target.value)} />
          {phoneError && <span className="field-error">{phoneError}</span>}
        </label>
        <p className="muted">Номер нужен, если ты платишь за поле: его покажут в счёте.</p>
        <button className="btn primary wide" disabled={!name.trim()}>
          Сохранить
        </button>
      </form>
    </Screen>
  );
}
