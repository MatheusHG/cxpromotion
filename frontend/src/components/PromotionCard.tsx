import { useState } from 'react';
import { Calendar, Coins, Image as ImageIcon, Repeat, TrendingUp, Trophy, Users, CheckCircle2, AlertCircle, Hourglass, Send } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtBRL, fmtDate, fmtNumber, gameThumbnail, timeUntil } from '@/lib/utils';

type Provider = 'PRAGMATIC' | 'SOFTSWISS' | 'AVIATOR';

interface Promotion {
  promotion_id: string;
  promocao: string;
  friendly_name?: string;
  image?: string;
  description?: string;
  game_id?: string;
  game_name?: string;
  giros_da_promocao: number;
  valor_por_rodada: string;
  config_valid_for_days?: number;
  config_valid_for_minutes?: number;
  criada_em: string;
  inicio: string;
  fim: string;
  ultimo_resgate?: string;
  resgates: number;
  usuarios_que_resgataram?: number;
  giros_esperados?: number;
  giros?: number;
  ganhos?: number;
  perdas?: number;
  valor_ganho?: number;
  valor_ganho_total?: number;
  sessoes_concluidas?: number;
  sessoes_abandonadas?: number;
  taxa_de_resgate?: number;
  pct_giros_ganhos?: number;
}

const PROVIDER_GRADIENTS: Record<Provider, string> = {
  PRAGMATIC: 'from-blue-500/80 to-indigo-600/80',
  SOFTSWISS: 'from-purple-500/80 to-fuchsia-600/80',
  AVIATOR:   'from-orange-500/80 to-red-600/80',
};

const PROVIDER_BADGE: Record<Provider, string> = {
  PRAGMATIC: 'bg-blue-100 text-blue-800',
  SOFTSWISS: 'bg-purple-100 text-purple-800',
  AVIATOR:   'bg-orange-100 text-orange-800',
};

interface XPDispatchStats {
  campaigns: number;
  users: number;
  users_delivered: number;
  users_failed: number;
  dispatches: number;
  delivered: number;
  failed: number;
  opened: number;
  clicked: number;
}

export interface UserXPDispatch {
  create_time: number;
  channel: string;
  delivered: boolean;
  opened: boolean;
  clicked: boolean;
  campaign_title?: string;
}

interface Props {
  provider: Provider;
  promotion: Promotion;
  onClick?: () => void;
  xpStats?: XPDispatchStats | null;
  xpStatsLoading?: boolean;
  userXPDispatches?: UserXPDispatch[];
}

export function PromotionCard({ provider, promotion: p, onClick, xpStats, xpStatsLoading, userXPDispatches }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const valorPorRodada = Number(p.valor_por_rodada) || 0;
  const valorTotalConfigurado = valorPorRodada * (p.giros_da_promocao ?? 0);
  const valorGanho = p.valor_ganho ?? p.valor_ganho_total ?? 0;
  const taxa = p.taxa_de_resgate ?? 0;
  const imageUrl = !imgFailed ? (p.image || gameThumbnail(p.game_id)) : null;

  const now = new Date();
  const fim = new Date(p.fim);
  const promoExpired = !Number.isNaN(fim.getTime()) && fim.getTime() <= now.getTime();
  const promoTimeLeft = !promoExpired ? timeUntil(fim, now) : null;

  const validityHint =
    (p.config_valid_for_minutes && p.config_valid_for_minutes > 0)
      ? `${p.config_valid_for_minutes} min após resgate`
      : (p.config_valid_for_days && p.config_valid_for_days > 0)
      ? `${p.config_valid_for_days} ${p.config_valid_for_days === 1 ? 'dia' : 'dias'} após resgate`
      : null;

  const taxaColor =
    taxa >= 80 ? 'text-emerald-600' :
    taxa >= 50 ? 'text-amber-600' :
                 'text-red-600';

  return (
    <Card
      className={`overflow-hidden flex flex-col transition-all ${onClick ? 'cursor-pointer hover:shadow-lg hover:ring-2 hover:ring-primary/40' : 'hover:shadow-lg'}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      {/* Hero image */}
      <div className={`relative h-40 bg-gradient-to-br ${PROVIDER_GRADIENTS[provider]}`}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={p.game_name || p.promocao}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover object-top"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80">
            <ImageIcon className="h-10 w-10 text-white/40 mb-1" />
            {p.game_name && <p className="text-xs font-medium px-2 text-center line-clamp-1">{p.game_name}</p>}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        {/* Topo: provider + nome do jogo (sem badge de status pra não apertar) */}
        <div className="absolute top-2 left-2 right-2 flex flex-wrap gap-1">
          <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${PROVIDER_BADGE[provider]}`}>
            {provider}
          </span>
          {p.game_name && (
            <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-white/90 text-gray-800 backdrop-blur max-w-full truncate">
              {p.game_name}
            </span>
          )}
        </div>

        {/* Rodapé: vigência + status de resgate juntos (mesmo tema = tempo) */}
        <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
          <p className="text-xs text-white/90 flex items-center gap-1 drop-shadow min-w-0">
            <Calendar className="h-3 w-3 shrink-0" />
            <span className="truncate">{fmtDate(p.inicio)} → {fmtDate(p.fim)}</span>
          </p>
          {promoExpired ? (
            <span
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 shrink-0"
              title={`Resgate encerrado em ${fmtDate(p.fim)}`}
            >
              <AlertCircle className="h-3 w-3" /> Encerrado
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 shrink-0"
              title={`Pode ser resgatada até ${fmtDate(p.fim)}`}
            >
              <CheckCircle2 className="h-3 w-3" /> {promoTimeLeft}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div>
          <h3 className="font-semibold text-sm leading-tight line-clamp-2" title={p.promocao}>
            {p.friendly_name || p.promocao}
          </h3>
          {p.friendly_name && p.friendly_name !== p.promocao && (
            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1" title={p.promocao}>
              {p.promocao}
            </p>
          )}
        </div>

        {/* Config */}
        <div className="flex items-center justify-between rounded-md bg-muted/60 p-2 text-xs">
          <div className="flex items-center gap-1.5">
            <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
            <span><strong>{p.giros_da_promocao}</strong> giros</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Coins className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{fmtBRL(valorPorRodada)}/giro</span>
          </div>
          <div className="text-muted-foreground">
            {fmtBRL(valorTotalConfigurado)} total
          </div>
        </div>

        {/* Hint genérico de validade (info da promoção, não específico do usuário).
            O tempo restante por resgate fica DENTRO do modal, em cada seção. */}
        {validityHint && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Hourglass className="h-3.5 w-3.5 shrink-0" />
            <span>Validade: <span className="text-foreground font-medium">{validityHint}</span></span>
            {p.ultimo_resgate && (
              <span className="text-[10px] text-muted-foreground/70">· (clique pra ver por resgate)</span>
            )}
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat icon={<Repeat className="h-3.5 w-3.5" />} label="Resgates" value={fmtNumber(p.resgates)} />
          <Stat icon={<Users className="h-3.5 w-3.5" />} label="Usuários" value={fmtNumber(p.usuarios_que_resgataram)} />
          {provider === 'SOFTSWISS' ? (
            <>
              <Stat
                icon={<Trophy className="h-3.5 w-3.5" />}
                label="Sessões"
                value={`${fmtNumber(p.sessoes_concluidas ?? p.ganhos ?? 0)}/${fmtNumber(p.resgates)}`}
                hint="concluídas / total"
              />
              <Stat
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label="Abandonadas"
                value={fmtNumber(p.sessoes_abandonadas ?? Math.max(0, (p.resgates ?? 0) - (p.ganhos ?? 0)))}
              />
            </>
          ) : (
            <>
              <Stat
                icon={<Repeat className="h-3.5 w-3.5" />}
                label="Giros"
                value={`${fmtNumber(p.giros)}/${fmtNumber(p.giros_esperados)}`}
                hint="executados / esperados"
              />
              <Stat
                icon={<Trophy className="h-3.5 w-3.5" />}
                label="Ganhos"
                value={fmtNumber(p.ganhos)}
              />
            </>
          )}
        </div>

        {/* XP dispatch stats — skeleton enquanto carrega */}
        {xpStatsLoading && !xpStats && (
          <div className="rounded-md bg-blue-50/50 border border-blue-100 px-2 py-1.5 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Send className="h-3 w-3 text-blue-300" />
              <Skeleton className="h-3 w-40 bg-blue-100" />
            </div>
            <div className="grid grid-cols-2 gap-1">
              <Skeleton className="h-6 bg-blue-100" />
              <Skeleton className="h-6 bg-blue-100" />
              <Skeleton className="h-6 bg-blue-100" />
              <Skeleton className="h-6 bg-blue-100" />
            </div>
          </div>
        )}

        {/* XP dispatch stats (visão dashboard — agregada) */}
        {xpStats && xpStats.dispatches > 0 && (() => {
          const usuariosResgataram = p.usuarios_que_resgataram ?? 0;
          // "Faltam" só faz sentido quando alguém recebeu com sucesso E não resgatou
          const faltamResgatar = xpStats.users_delivered > 0
            ? Math.max(0, xpStats.users_delivered - usuariosResgataram)
            : null;
          return (
            <div className="rounded-md bg-blue-50 border border-blue-200 px-2 py-1.5 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold text-blue-900">
                <Send className="h-3 w-3" />
                XtremePush · {fmtNumber(xpStats.dispatches)} disparos em {fmtNumber(xpStats.campaigns)} {xpStats.campaigns === 1 ? 'campanha' : 'campanhas'}
              </div>
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                <Mini
                  icon="✓"
                  label="Receberam (XP)"
                  value={xpStats.users_delivered}
                  color="emerald"
                  hint="Usuários únicos onde a XP entregou pelo menos 1 notificação com sucesso"
                />
                <Mini
                  icon="⚠"
                  label="Falharam (XP)"
                  value={xpStats.users_failed}
                  color="red"
                  hint="Usuários cujos disparos XP TODOS falharam (push expirado, bloqueado, etc)"
                />
                <Mini
                  icon="🎁"
                  label="Resgataram (casino)"
                  value={usuariosResgataram}
                  color="violet"
                  hint="Usuários únicos que resgataram a promoção no casino — qualquer canal, não apenas via XP"
                />
                <Mini
                  icon="⏳"
                  label="Não acionaram"
                  value={faltamResgatar}
                  color="amber"
                  hint={faltamResgatar === null
                    ? 'Sem dados — XP não entregou pra ninguém com sucesso, então essa estimativa não se aplica'
                    : 'Recebeu via XP com sucesso mas NÃO resgatou no casino. Estimativa: max(0, recebidos − resgataram).'}
                />
              </div>
              {xpStats.users_delivered === 0 && usuariosResgataram > 0 && (
                <div className="text-[10px] text-amber-800 bg-amber-50 rounded px-1.5 py-1">
                  ⓘ XP não entregou nenhuma notificação dessa promoção. Os resgates aconteceram via outros canais (site, app, email externo, etc).
                </div>
              )}
            </div>
          );
        })()}

        {/* XP dispatches por usuário (visão user-search) */}
        {userXPDispatches && userXPDispatches.length > 0 && (
          <div className="rounded-md bg-blue-50 border border-blue-200 px-2 py-1.5 text-xs space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium text-blue-900">
              <Send className="h-3 w-3" />
              Recebida via XtremePush · {userXPDispatches.length}×
            </div>
            <ul className="space-y-0.5 text-[11px]">
              {userXPDispatches.slice(0, 4).map((d, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-blue-900">
                  <span className="tabular-nums">{fmtDate(new Date(d.create_time * 1000).toISOString())}</span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block rounded bg-blue-200 text-blue-900 px-1.5 py-0.5 text-[9px] font-semibold">{d.channel}</span>
                    {d.delivered && <span title="entregue" className="text-emerald-700">✓</span>}
                    {d.opened    && <span title="aberta"   className="text-blue-700">👁</span>}
                    {d.clicked   && <span title="clicada"  className="text-purple-700">🖱</span>}
                  </span>
                </li>
              ))}
              {userXPDispatches.length > 4 && (
                <li className="text-[10px] text-blue-700/70 italic">
                  + {userXPDispatches.length - 4} disparos
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-2 border-t flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Taxa de resgate</p>
            <p className={`text-xl font-bold ${taxaColor}`}>{taxa}%</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Valor ganho</p>
            <p className="text-lg font-semibold">{fmtBRL(valorGanho)}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Mini({ icon, label, value, color, hint }: { icon: string; label: string; value: number | null; color: 'emerald' | 'red' | 'violet' | 'amber'; hint?: string }) {
  const colorMap: Record<typeof color, string> = {
    emerald: 'text-emerald-700',
    red: 'text-red-700',
    violet: 'text-violet-700',
    amber: 'text-amber-700',
  };
  return (
    <div className="flex items-center justify-between gap-1 rounded bg-white/60 px-1.5 py-1" title={hint}>
      <span className="text-muted-foreground flex items-center gap-1 truncate">
        <span>{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span className={`font-bold tabular-nums shrink-0 ${value === null ? 'text-muted-foreground' : colorMap[color]}`}>
        {value === null ? '—' : fmtNumber(value)}
      </span>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2" title={hint}>
      <span className="text-muted-foreground">{icon}</span>
      <div className="leading-tight">
        <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
        <div className="font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}
