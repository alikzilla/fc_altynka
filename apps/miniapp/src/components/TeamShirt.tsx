/** A shirt filled with the surrounding team's kit colour (`--kit`). */
export function TeamShirt({ className = '' }: { className?: string }) {
  return <svg className={`team-shirt ${className}`} viewBox="0 0 32 32" aria-hidden="true"><path d="M11 4 4 8l3 6 3-1.5V28h12V12.5l3 1.5 3-6-7-4c-.6 2-2.6 3.4-5 3.4S11.6 6 11 4z" /></svg>;
}
