import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { useDebounced } from '../../lib/use-debounced';
import { paymentWarning } from '../../lib/payment';
import { PAYMENT_METHOD_LABEL, PaymentMethod } from './types';

const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Quote {
  pricing: { distanceKm: number; durationMin: number; price: number } | null;
  discount: number;
  finalPrice: number | null;
  couponCode: string | null;
  couponError: string | null;
}

const EMPTY_FORM = {
  customerId: '',
  driverId: '',
  originAddress: '',
  originLat: '',
  originLng: '',
  destinationAddress: '',
  destinationLat: '',
  destinationLng: '',
  scheduledAt: '',
  paymentMethod: 'CASH' as PaymentMethod,
  couponCode: '',
};

export function RideFormModal({ open, onClose, defaultScheduled }: { open: boolean; onClose: () => void; defaultScheduled?: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // Cliente por busca (nome ou CPF), não pela lista inteira: a lista era cortada em 200 e quem passava
  // disso não aparecia para ser escolhido.
  const [customerSearch, setCustomerSearch] = useState('');
  const debouncedSearch = useDebounced(customerSearch.trim(), 300);
  const [pickedCustomer, setPickedCustomer] = useState<{ id: string; name: string; walletBalance: number } | null>(null);
  const customersQuery = useQuery<{ id: string; name: string; cpf: string; walletBalance: string }[]>({
    queryKey: ['customers', 'select', debouncedSearch],
    queryFn: () =>
      api
        .get('/customers', { params: { ...(/^\d+$/.test(debouncedSearch) ? { cpf: debouncedSearch } : debouncedSearch ? { name: debouncedSearch } : {}), pageSize: 20 } })
        .then((r) => r.data),
    enabled: open,
  });
  const driversQuery = useQuery({
    queryKey: ['drivers', { status: 'APPROVED' }, 'select'],
    queryFn: () => api.get('/drivers', { params: { status: 'APPROVED', pageSize: 1000 } }).then((r) => r.data),
    enabled: open,
  });

  // Estimativa (preço + cupom) pelo mesmo cálculo do servidor: o operador vê quanto a corrida vai custar
  // e se o cupom vale antes de salvar. Só depois que as 4 coordenadas estão preenchidas.
  const quoteInput = useDebounced(
    {
      customerId: form.customerId || undefined,
      originLat: form.originLat, originLng: form.originLng,
      destinationLat: form.destinationLat, destinationLng: form.destinationLng,
      couponCode: form.couponCode.trim() || undefined,
      scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
    },
    500,
  );
  const coordsFilled = [quoteInput.originLat, quoteInput.originLng, quoteInput.destinationLat, quoteInput.destinationLng].every((v) => v !== '' && Number.isFinite(Number(v)));
  const quoteQuery = useQuery<Quote>({
    queryKey: ['ride-quote', quoteInput],
    queryFn: () =>
      api
        .post('/rides/quote', {
          ...quoteInput,
          originLat: Number(quoteInput.originLat), originLng: Number(quoteInput.originLng),
          destinationLat: Number(quoteInput.destinationLat), destinationLng: Number(quoteInput.destinationLng),
        })
        .then((r) => r.data),
    enabled: open && coordsFilled,
    retry: false,
  });
  const quote = coordsFilled ? quoteQuery.data : undefined;
  const walletShort =
    form.paymentMethod === 'WALLET' && !!pickedCustomer && quote?.finalPrice != null && pickedCustomer.walletBalance < quote.finalPrice;

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/rides', {
        customerId: form.customerId,
        driverId: form.driverId || undefined,
        originAddress: form.originAddress,
        originLat: Number(form.originLat),
        originLng: Number(form.originLng),
        destinationAddress: form.destinationAddress,
        destinationLat: Number(form.destinationLat),
        destinationLng: Number(form.destinationLng),
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
        paymentMethod: form.paymentMethod,
        couponCode: form.couponCode.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rides'] });
      setForm(EMPTY_FORM);
      setCustomerSearch('');
      setPickedCustomer(null);
      onClose();
    },
    onError: (error: any) => setFormError(error?.response?.data?.message ?? 'Não foi possível criar a corrida.'),
  });

  return (
    <Modal open={open} onClose={onClose} title={defaultScheduled ? 'Nova corrida agendada' : 'Nova corrida'} size="lg">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setFormError(null);
          createMutation.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Input label="Buscar cliente (nome ou CPF)" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
            <Select
              label="Cliente"
              required
              value={form.customerId}
              onChange={(e) => {
                const found = (customersQuery.data ?? []).find((c) => c.id === e.target.value);
                if (found) setPickedCustomer({ id: found.id, name: found.name, walletBalance: Number(found.walletBalance) });
                setForm({ ...form, customerId: e.target.value });
              }}
            >
              <option value="" disabled>Selecione um cliente</option>
              {/* O escolhido continua na lista mesmo depois de a busca mudar */}
              {pickedCustomer && !(customersQuery.data ?? []).some((c) => c.id === pickedCustomer.id) && (
                <option value={pickedCustomer.id}>{pickedCustomer.name}</option>
              )}
              {(customersQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <Select label="Motorista (opcional)" value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
            <option value="">Despacho automático (motorista mais próximo)</option>
            {(driversQuery.data ?? []).map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {paymentWarning(form.paymentMethod, d) ? ` ⚠ ${paymentWarning(form.paymentMethod, d)}` : ''}
              </option>
            ))}
          </Select>
        </div>

        <p className="text-sm font-medium">Origem</p>
        <div className="grid grid-cols-3 gap-4">
          <Input label="Endereço" required value={form.originAddress} onChange={(e) => setForm({ ...form, originAddress: e.target.value })} />
          <Input label="Latitude" required type="number" step="any" value={form.originLat} onChange={(e) => setForm({ ...form, originLat: e.target.value })} />
          <Input label="Longitude" required type="number" step="any" value={form.originLng} onChange={(e) => setForm({ ...form, originLng: e.target.value })} />
        </div>

        <p className="text-sm font-medium">Destino</p>
        <div className="grid grid-cols-3 gap-4">
          <Input label="Endereço" required value={form.destinationAddress} onChange={(e) => setForm({ ...form, destinationAddress: e.target.value })} />
          <Input label="Latitude" required type="number" step="any" value={form.destinationLat} onChange={(e) => setForm({ ...form, destinationLat: e.target.value })} />
          <Input label="Longitude" required type="number" step="any" value={form.destinationLng} onChange={(e) => setForm({ ...form, destinationLng: e.target.value })} />
        </div>

        <Input
          label={defaultScheduled ? 'Agendar para' : 'Agendar para (opcional)'}
          type="datetime-local"
          required={defaultScheduled}
          value={form.scheduledAt}
          onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
        />

        <div className="grid grid-cols-2 gap-4">
          <Select label="Forma de pagamento" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}>
            {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((method) => (
              <option key={method} value={method}>{PAYMENT_METHOD_LABEL[method]}</option>
            ))}
          </Select>
          <Input label="Cupom (opcional)" value={form.couponCode} onChange={(e) => setForm({ ...form, couponCode: e.target.value.toUpperCase() })} />
        </div>

        {coordsFilled && (
          <div className="rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm">
            {!quote ? (
              <p className="text-muted">Calculando estimativa…</p>
            ) : !quote.pricing ? (
              <p className="text-muted">Sem tarifa configurada — o preço fica pendente.</p>
            ) : (
              <>
                <p>
                  <span className="font-medium">Estimativa: {brl(quote.finalPrice ?? quote.pricing.price)}</span>
                  <span className="text-muted"> · {quote.pricing.distanceKm} km · {Math.round(quote.pricing.durationMin)} min</span>
                </p>
                {quote.couponCode && (
                  <p className="text-brand">Cupom {quote.couponCode}: −{brl(quote.discount)} (de {brl(quote.pricing.price)})</p>
                )}
                {quote.couponError && <p className="text-danger">{quote.couponError}</p>}
              </>
            )}
            {form.paymentMethod === 'WALLET' && pickedCustomer && (
              <p className={walletShort ? 'text-danger' : 'text-muted'}>
                Saldo da carteira: {brl(pickedCustomer.walletBalance)}
                {walletShort && ' — insuficiente para esta corrida'}
              </p>
            )}
          </div>
        )}

        {formError && <p className="text-sm text-danger">{formError}</p>}
        <Button type="submit" disabled={createMutation.isPending || !!quote?.couponError || walletShort} className="mt-1">
          {createMutation.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </form>
    </Modal>
  );
}
