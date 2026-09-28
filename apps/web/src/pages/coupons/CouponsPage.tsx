import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../features/auth/auth-context';
import { Coupon, CouponDiscountType } from './types';

const EMPTY_FORM = {
  code: '',
  discountType: 'PERCENTAGE' as CouponDiscountType,
  discountValue: '',
  maxUses: '',
  maxUsesPerCustomer: '',
  expiresAt: '',
};

export function CouponsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const listQuery = useQuery<Coupon[]>({ queryKey: ['coupons'], queryFn: () => api.get('/coupons').then((r) => r.data) });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/coupons', {
        code: form.code.toUpperCase(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
        maxUsesPerCustomer: form.maxUsesPerCustomer ? Number(form.maxUsesPerCustomer) : undefined,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      setModalOpen(false);
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Não foi possível criar o cupom.'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ code, active }: { code: string; active: boolean }) => api.patch(`/coupons/${code}/active`, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coupons'] }),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  }

  const coupons = listQuery.data ?? [];
  const canManage = hasPermission('cupons.editar');

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cupons</h1>
          <p className="text-sm text-muted">Códigos de desconto que o cliente aplica no app antes de pedir a corrida.</p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus size={16} /> Novo cupom
          </Button>
        )}
      </div>

      {listQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : coupons.length === 0 ? (
        <Card>
          <EmptyState title="Nenhum cupom cadastrado" description="Crie um código como 'BEMVINDO10' para dar desconto na primeira corrida." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {coupons.map((coupon) => {
            const expired = coupon.expiresAt ? new Date(coupon.expiresAt) < new Date() : false;
            const exhausted = coupon.maxUses != null && coupon.usesCount >= coupon.maxUses;
            return (
              <Card key={coupon.code}>
                <CardBody>
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <p className="font-mono font-medium">{coupon.code}</p>
                      <p className="text-xs text-muted">
                        {coupon.discountType === 'PERCENTAGE' ? `${coupon.discountValue}% de desconto` : `R$ ${coupon.discountValue} de desconto`}
                      </p>
                    </div>
                    <Badge tone={coupon.active && !expired && !exhausted ? 'success' : 'neutral'}>
                      {!coupon.active ? 'Inativo' : expired ? 'Expirado' : exhausted ? 'Esgotado' : 'Ativo'}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="neutral">
                      {coupon.usesCount} uso{coupon.usesCount === 1 ? '' : 's'}
                      {coupon.maxUses != null ? ` / ${coupon.maxUses}` : ''}
                    </Badge>
                    {coupon.maxUsesPerCustomer != null && (
                      <Badge tone="neutral">
                        até {coupon.maxUsesPerCustomer}/cliente
                      </Badge>
                    )}
                    {coupon.expiresAt && <Badge tone="warning">até {new Date(coupon.expiresAt).toLocaleDateString('pt-BR')}</Badge>}
                  </div>

                  {canManage && (
                    <div className="mt-4">
                      <Button
                        variant="secondary"
                        className="w-full"
                        disabled={toggleActiveMutation.isPending}
                        onClick={() => toggleActiveMutation.mutate({ code: coupon.code, active: !coupon.active })}
                      >
                        {coupon.active ? 'Desativar' : 'Ativar'}
                      </Button>
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo cupom">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            createMutation.mutate();
          }}
        >
          <Input
            label="Código"
            placeholder="BEMVINDO10"
            required
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Tipo de desconto"
              value={form.discountType}
              onChange={(e) => setForm({ ...form, discountType: e.target.value as CouponDiscountType })}
            >
              <option value="PERCENTAGE">Percentual (%)</option>
              <option value="FIXED">Valor fixo (R$)</option>
            </Select>
            <Input
              label={form.discountType === 'PERCENTAGE' ? 'Percentual' : 'Valor (R$)'}
              type="number"
              step="0.01"
              min="0.01"
              required
              value={form.discountValue}
              onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Limite de usos (opcional)"
              type="number"
              step="1"
              min="1"
              placeholder="Ilimitado"
              value={form.maxUses}
              onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
            />
            <Input
              label="Limite por cliente (opcional)"
              type="number"
              step="1"
              min="1"
              placeholder="Ilimitado"
              value={form.maxUsesPerCustomer}
              onChange={(e) => setForm({ ...form, maxUsesPerCustomer: e.target.value })}
            />
          </div>
          <Input
            label="Expira em (opcional)"
            type="date"
            value={form.expiresAt}
            onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
          />

          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={createMutation.isPending} className="mt-1">
            {createMutation.isPending ? 'Salvando…' : 'Criar cupom'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
