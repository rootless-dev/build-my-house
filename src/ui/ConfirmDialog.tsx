import { useEffect, useRef } from 'react';

export interface ConfirmRequest {
  title: string;
  body: string;
  /** Label of the button that goes through with the action. */
  confirmLabel: string;
  /** Marks the action as irreversible — paints the button red. */
  danger?: boolean;
  onConfirm: () => void;
}

/**
 * Confirmation for actions that lose work. Built on the native `<dialog>` so
 * the focus trap, Esc and the backdrop come from the platform — and, unlike
 * `window.confirm`, it does not block the main thread while it is open.
 *
 * Focus starts on "Cancelar": for a destructive prompt, the safe option is the
 * one that should answer a hurried Enter.
 */
export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (request && !el.open) el.showModal();
    else if (!request && el.open) el.close();
  }, [request]);

  return (
    <dialog className="confirm" ref={ref} onClose={onClose} onCancel={onClose} aria-labelledby="confirm-title">
      {request ? (
        <>
          <h2 className="confirm__title" id="confirm-title">
            {request.title}
          </h2>
          <p className="confirm__body">{request.body}</p>
          <div className="confirm__actions">
            <button type="button" className="btn" autoFocus onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className={`btn ${request.danger ? 'btn--danger' : 'btn--primary'}`}
              onClick={() => {
                request.onConfirm();
                onClose();
              }}
            >
              {request.confirmLabel}
            </button>
          </div>
        </>
      ) : null}
    </dialog>
  );
}
