import { useState } from 'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Button } from './ui/Button';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  label: string;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: (reason: string) => void;
}

export function ReasonModal({ open, onClose, title, label, confirmLabel, loading, onConfirm }: Props) {
  const [reason, setReason] = useState('');

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(reason);
          setReason('');
        }}
      >
        <Input label={label} required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button type="submit" variant="danger" disabled={loading}>
          {loading ? 'Enviando…' : confirmLabel}
        </Button>
      </form>
    </Modal>
  );
}
