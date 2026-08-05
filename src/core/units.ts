export type Unit = 'm' | 'cm' | 'mm';

const FACTOR: Record<Unit, number> = { m: 1, cm: 100, mm: 1000 };

export function formatLength(meters: number, unit: Unit, digits?: number): string {
  const value = meters * FACTOR[unit];
  const d = digits ?? (unit === 'm' ? 2 : unit === 'cm' ? 1 : 0);
  return `${value.toFixed(d).replace('.', ',')} ${unit}`;
}

export function formatArea(m2: number, unit: Unit): string {
  if (unit === 'm') return `${m2.toFixed(2).replace('.', ',')} m²`;
  const f = FACTOR[unit] ** 2;
  return `${(m2 * f).toFixed(0)} ${unit}²`;
}

export function formatAngle(rad: number): string {
  return `${((rad * 180) / Math.PI).toFixed(1).replace('.', ',')}°`;
}

/**
 * Aceita "3", "3,5", "350cm", "2.4 m", "45mm". Sem sufixo, usa a unidade ativa.
 * Devolve metros, ou null se não der para ler.
 */
export function parseLength(text: string, unit: Unit): number | null {
  const t = text.trim().toLowerCase().replace(',', '.');
  if (!t) return null;
  const m = /^(-?\d*\.?\d+)\s*(mm|cm|m)?$/.exec(t);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const u = (m[2] as Unit | undefined) ?? unit;
  return value / FACTOR[u];
}

/** Lê "3;4" ou "3 x 4" para as duas dimensões de um retângulo. */
export function parsePair(text: string, unit: Unit): [number, number] | null {
  const parts = text.split(/[;x×]/);
  if (parts.length !== 2) return null;
  const a = parseLength(parts[0], unit);
  const b = parseLength(parts[1], unit);
  return a === null || b === null ? null : [a, b];
}

/** Lê "1,5" ou "150%" como fator de escala. */
export function parseFactor(text: string): number | null {
  const t = text.trim().replace(',', '.');
  const pct = t.endsWith('%');
  const value = Number(pct ? t.slice(0, -1) : t);
  if (!Number.isFinite(value) || value === 0) return null;
  return pct ? value / 100 : value;
}

export function parseAngle(text: string): number | null {
  const t = text.trim().replace(',', '.').replace('°', '');
  const value = Number(t);
  return Number.isFinite(value) ? (value * Math.PI) / 180 : null;
}
