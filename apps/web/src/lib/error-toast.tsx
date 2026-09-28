import { useEffect, useState } from 'react';

const listeners = new Set<(message: string) => void>();

export function notifyError(error: unknown) {
  const raw = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  const message = Array.isArray(raw) ? raw.join(' · ') : raw ?? 'Algo deu errado. Tente novamente.';
  listeners.forEach((listener) => listener(message));
}

// Aviso flutuante para erro de ação (mutation) que a tela não trata sozinha — antes
// muita ação (avançar/atribuir/cancelar corrida, bloquear, salvar…) falhava em silêncio.
export function ErrorToast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    listeners.add(setMessage);
    return () => {
      listeners.delete(setMessage);
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;
  return (
    <div role="alert" className="fixed bottom-6 right-6 z-[100] max-w-sm rounded-lg border border-danger/40 bg-surface px-4 py-3 text-sm text-danger shadow-lg">
      {message}
    </div>
  );
}
