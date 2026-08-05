import type { Model } from './model';
import type { ModelSnapshot } from './types';

export function download(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportJSON(model: Model): string {
  return JSON.stringify(model.toSnapshot(), null, 1);
}

export function parseJSON(text: string): ModelSnapshot {
  const data = JSON.parse(text) as ModelSnapshot;
  if (!data || (data.version !== 1 && data.version !== 2)) {
    throw new Error('Arquivo não reconhecido: esperava um projeto .casa.');
  }
  return data;
}
