type Tone = 'neutral' | 'success' | 'danger' | 'warning' | 'brand';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-surface-hover text-muted',
  success: 'bg-success/10 text-success',
  danger: 'bg-danger/10 text-danger',
  warning: 'bg-warning/10 text-warning',
  brand: 'bg-brand/10 text-brand',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
