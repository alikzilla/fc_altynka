import { formatKzPhone, formatTenge } from '@altynka/core';
import { transfer } from '../lib/kaspi';
import { copy } from '../lib/tg';
import { Icon } from './Icon';
import { useToast } from './ui';

/** Amount to copy, who receives it and, while the debt is open, the Kaspi transfer button. */
export function KaspiPay({ amount, receiverName, kaspiPhone, payable, showPhone = false, onTransfer }: {
  amount: number; receiverName: string; kaspiPhone: string; payable: boolean; showPhone?: boolean; onTransfer?: () => void;
}) {
  const toast = useToast();
  return <>
    <button className="payment-amount" aria-label={`Скопировать сумму ${formatTenge(amount)}`} onClick={() => copy(String(amount)).then(ok => toast(ok ? 'Сумма скопирована' : 'Не получилось скопировать. Сумма указана выше.'))}>{formatTenge(amount)}<Icon name="copy" /></button>
    <p className="payment-person"><span className="payment-person-label">Получатель</span> {receiverName}</p>
    {showPhone && kaspiPhone && <p className="muted">Kaspi {formatKzPhone(kaspiPhone)}</p>}
    {payable && kaspiPhone && <button className="btn primary wide" onClick={() => { onTransfer?.(); void transfer(kaspiPhone); }}>Перевести в Kaspi<Icon name="arrow" /></button>}
  </>;
}
