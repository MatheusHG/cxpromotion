import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtBRL(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '-';
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function fmtNumber(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '-';
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString('pt-BR');
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const THUMB_BASE = 'https://r2-images.ngx.bet/general/casino-vertical/medium';

/**
 * Constrói a URL da thumbnail do jogo a partir do info_game_id da transação.
 * - PRAGMATIC: 'vs5luckytig'        → 'vs5luckytig.avif'
 * - PG:        'pgsoft:FortuneOx'   → 'pgsoftFortuneOx.avif'
 * - AVIATOR:   '1' (puro número)    → null (não tem thumbnail individual)
 */
export function gameThumbnail(gameId: string | null | undefined): string | null {
  if (!gameId) return null;
  const trimmed = gameId.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return null;
  const normalized = trimmed.replace(/:/g, '');
  return `${THUMB_BASE}/${normalized}.avif`;
}

/**
 * Retorna string humana do tempo restante: "5 dias", "1 dia 4h", "23h", "30 min", "expirado".
 */
export function timeUntil(target: Date | string | null | undefined, now = new Date()): string {
  if (!target) return '-';
  const t = typeof target === 'string' ? new Date(target) : target;
  if (Number.isNaN(t.getTime())) return '-';
  const diff = t.getTime() - now.getTime();
  if (diff <= 0) return 'expirado';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (days > 1) return `${days} dias`;
  if (days === 1) return hours > 0 ? `1 dia ${hours}h` : '1 dia';
  if (hours > 0) return `${hours}h`;
  return `${minutes} min`;
}

/**
 * Calcula a data de expiração do bônus do usuário, com base no resgate
 * e na config da promoção (valid_for_minutes tem prioridade sobre valid_for_days).
 */
export function bonusExpiration(
  resgateIso: string | null | undefined,
  validDays: number | null | undefined,
  validMinutes: number | null | undefined,
): Date | null {
  if (!resgateIso) return null;
  const resgate = new Date(resgateIso);
  if (Number.isNaN(resgate.getTime())) return null;
  if (validMinutes && validMinutes > 0) {
    return new Date(resgate.getTime() + validMinutes * 60_000);
  }
  if (validDays && validDays > 0) {
    return new Date(resgate.getTime() + validDays * 86_400_000);
  }
  return null;
}
