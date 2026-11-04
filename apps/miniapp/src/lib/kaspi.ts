import { copy, haptic, openLink } from './tg';

/** Ссылка, которая открывает Kaspi; проверить на iOS и Android при деплое (Task 16). */
export const KASPI_OPEN_URL = 'https://kaspi.kz/';

/** Копирует номер получателя и открывает Kaspi: дальше человек вставляет номер и сумму сам. */
export async function transfer(phone: string): Promise<void> {
  await copy(phone);
  haptic('success');
  openLink(KASPI_OPEN_URL);
}
