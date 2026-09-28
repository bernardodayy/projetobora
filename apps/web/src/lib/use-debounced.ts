import { useEffect, useState } from 'react';

// Valor que só "assenta" depois de `ms` sem mudar — evita uma busca a cada tecla digitada.
export function useDebounced<T>(value: T, ms = 400): T {
  const [debounced, setDebounced] = useState(value);
  const key = JSON.stringify(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
    // key (não value): objeto novo a cada render não pode reiniciar o timer sozinho
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms]);
  return debounced;
}
