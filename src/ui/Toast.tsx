import { useEffect, useState } from 'react';
import { useApp } from '../state/store';

export function Toast() {
  const toast = useApp((s) => s.toast);
  const [dismissed, setDismissed] = useState<number | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setDismissed(toast.id), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast || toast.id === dismissed) return null;
  return (
    <div className="toast" role="status">
      {toast.text}
    </div>
  );
}
