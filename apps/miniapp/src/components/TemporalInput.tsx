import type { ComponentPropsWithoutRef } from 'react';

type Props = Omit<ComponentPropsWithoutRef<'input'>, 'type'> & { type: 'date' | 'time' };

/** Keep padding off the native control: iOS WebKit mis-sizes 100% date/time inputs with padding. */
export function TemporalInput({ className = '', ...props }: Props) {
  return <span className="temporal-field"><input {...props} className={`temporal-input ${className}`} /></span>;
}
