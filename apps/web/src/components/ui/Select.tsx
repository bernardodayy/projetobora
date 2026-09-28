import { forwardRef, type SelectHTMLAttributes } from 'react';

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select = forwardRef<HTMLSelectElement, Props>(({ label, className = '', children, ...props }, ref) => (
  <label className="flex flex-col gap-1.5 text-sm">
    {label && <span className="font-medium text-ink">{label}</span>}
    <select
      ref={ref}
      className={`rounded-lg border border-border bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-brand/40 ${className}`}
      {...props}
    >
      {children}
    </select>
  </label>
));
Select.displayName = 'Select';
