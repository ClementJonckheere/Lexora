import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { Button, Modal } from './ui';

interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

const useConfirmStore = create<{ request: ConfirmRequest | null }>(() => ({ request: null }));

/** Boîte de confirmation asynchrone : `if (await confirm({...})) …` */
export function confirm(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.setState({ request: { ...opts, resolve } }));
}

export function ConfirmHost() {
  const request = useConfirmStore((s) => s.request);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (request) setTimeout(() => okRef.current?.focus(), 0);
  }, [request]);
  if (!request) return null;
  const close = (ok: boolean) => {
    useConfirmStore.setState({ request: null });
    request.resolve(ok);
  };
  return (
    <Modal
      title={request.title}
      size="sm"
      onClose={() => close(false)}
      footer={
        <>
          <Button onClick={() => close(false)}>Annuler</Button>
          <Button ref={okRef} variant={request.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {request.confirmLabel ?? 'Confirmer'}
          </Button>
        </>
      }
    >
      {request.message && (
        <div className="modal-body">
          <p className="text-2">{request.message}</p>
        </div>
      )}
    </Modal>
  );
}
