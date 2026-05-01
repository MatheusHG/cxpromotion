import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy, X as XIcon, Info, Gift, ChevronDown, Hourglass, CheckCircle2, Send, AlertTriangle, Calendar, Coins, Repeat } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { bonusExpiration, fmtBRL, fmtDate, fmtNumber, timeUntil } from '@/lib/utils';
import type { UserXPDispatch } from '@/components/PromotionCard';

type Provider = 'PRAGMATIC' | 'SOFTSWISS' | 'AVIATOR';

interface Round {
  data: string;
  round_id: string;
  game_id?: string;
  game_name?: string;
  valor_ganho: number;
  ganhou: boolean | number;
  bonus_code?: string;
  resgate_data?: string;
}

interface Resgate {
  bonus_code: string;
  resgate_data: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  promotion: {
    promotion_id: string;
    promocao: string;
    friendly_name?: string;
    game_name?: string;
    giros_da_promocao?: number;
    valor_por_rodada?: string;
    inicio?: string;
    fim?: string;
    config_valid_for_days?: number;
    config_valid_for_minutes?: number;
  };
  provider: Provider;
  userId: string;
  startDate: string;
  endDate: string;
  isTest: boolean;
  xpDispatches?: UserXPDispatch[];
}

const PROVIDER_BADGE: Record<Provider, string> = {
  PRAGMATIC: 'bg-blue-100 text-blue-800',
  SOFTSWISS: 'bg-purple-100 text-purple-800',
  AVIATOR:   'bg-orange-100 text-orange-800',
};

export function PromotionRoundsDialog({ open, onClose, promotion, provider, userId, startDate, endDate, isTest, xpDispatches = [] }: Props) {
  const params = {
    user_id: userId,
    promotion_id: promotion.promotion_id,
    provider,
    start_date: startDate,
    end_date: endDate,
    is_test: String(isTest),
  };

  const query = useQuery({
    queryKey: ['user-rounds', params],
    queryFn: async () => (await api.get<{ rounds: Round[]; resgates?: Resgate[]; note?: string }>('/user-search/rounds', { params })).data,
    enabled: open,
  });

  const rounds = query.data?.rounds ?? [];
  const resgates = query.data?.resgates ?? [];
  const note = query.data?.note;

  const ganhos = rounds.filter((r) => Boolean(r.ganhou)).length;
  const perdas = rounds.length - ganhos;
  const totalGanho = rounds.reduce((s, r) => s + Number(r.valor_ganho || 0), 0);
  const winRate = rounds.length > 0 ? (ganhos / rounds.length) * 100 : 0;

  // Master list = resgates retornados pelo backend. Anexa rounds correspondentes a cada um.
  const groups = (() => {
    const roundsByCode = new Map<string, Round[]>();
    for (const r of rounds) {
      const key = r.bonus_code || 'sem-resgate';
      const list = roundsByCode.get(key) ?? [];
      list.push(r);
      roundsByCode.set(key, list);
    }
    return resgates.map((res) => ({
      bonus_code: res.bonus_code,
      resgate_data: res.resgate_data,
      rounds: roundsByCode.get(res.bonus_code) ?? [],
    }));
  })();

  const semJogadas = groups.filter((g) => g.rounds.length === 0).length;

  // Cruza disparos XP com resgates (matching pelo dispatch mais recente ANTES de cada resgate).
  // Sobra: disparos que não levaram a nenhum resgate → "recebida mas não resgatada"
  const { dispatchByResgate, orphanDispatches } = useMemo(() => {
    const sortedDispatches = [...xpDispatches].sort((a, b) => a.create_time - b.create_time);
    const dispatchByResgate = new Map<string, UserXPDispatch[]>();
    const consumed = new Set<number>(); // índices de disparos já vinculados a algum resgate

    // Pra cada resgate (em ordem cronológica), pegar todos os disparos no intervalo (último resgate, este]
    const sortedResgates = [...groups].sort((a, b) =>
      new Date(a.resgate_data).getTime() - new Date(b.resgate_data).getTime(),
    );
    let prevEndMs = -Infinity;
    for (const g of sortedResgates) {
      const resgateMs = new Date(g.resgate_data).getTime();
      const matched: UserXPDispatch[] = [];
      sortedDispatches.forEach((d, i) => {
        const dispMs = d.create_time * 1000;
        if (dispMs > prevEndMs && dispMs <= resgateMs && !consumed.has(i)) {
          matched.push(d);
          consumed.add(i);
        }
      });
      dispatchByResgate.set(g.bonus_code, matched);
      prevEndMs = resgateMs;
    }
    const orphanDispatches = sortedDispatches.filter((_d, i) => !consumed.has(i));
    return { dispatchByResgate, orphanDispatches };
  }, [xpDispatches, groups]);

  // Controle de expansão: se só houver 1 resgate, abre por padrão; senão tudo fechado.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (groups.length === 1) setExpanded(new Set([groups[0].bonus_code]));
    else setExpanded(new Set());
  }, [groups.length]);

  const toggleAll = () => {
    if (expanded.size === groups.length) setExpanded(new Set());
    else setExpanded(new Set(groups.map((g) => g.bonus_code)));
  };
  const toggle = (code: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <div className="flex items-start gap-2 flex-wrap">
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${PROVIDER_BADGE[provider]}`}>
              {provider}
            </span>
            {promotion.game_name && (
              <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-muted">
                {promotion.game_name}
              </span>
            )}
          </div>
          <DialogTitle className="pr-8">{promotion.friendly_name || promotion.promocao}</DialogTitle>
          <DialogDescription>Detalhes rodada-a-rodada do usuário nessa promoção</DialogDescription>
        </DialogHeader>

        {/* Info da promoção (config + vigência) */}
        <div className="rounded-lg border bg-muted/30 px-3 py-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {promotion.giros_da_promocao !== undefined && (
            <div className="flex items-center gap-1.5">
              <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Giros</div>
                <div className="font-semibold tabular-nums">{promotion.giros_da_promocao}</div>
              </div>
            </div>
          )}
          {promotion.valor_por_rodada !== undefined && (
            <div className="flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <div className="text-[10px] uppercase text-muted-foreground tracking-wide">R$/giro</div>
                <div className="font-semibold tabular-nums">{fmtBRL(promotion.valor_por_rodada)}</div>
              </div>
            </div>
          )}
          {(promotion.inicio || promotion.fim) && (
            <div className="flex items-center gap-1.5 col-span-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Vigência da promoção</div>
                <div className="font-medium">{fmtDate(promotion.inicio)} → {fmtDate(promotion.fim)}</div>
              </div>
            </div>
          )}
          {(promotion.config_valid_for_days || promotion.config_valid_for_minutes) && (
            <div className="flex items-center gap-1.5 col-span-2 sm:col-span-4">
              <Hourglass className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Validade após resgate</div>
                <div className="font-medium">
                  {promotion.config_valid_for_minutes
                    ? `${promotion.config_valid_for_minutes} minutos`
                    : `${promotion.config_valid_for_days} ${promotion.config_valid_for_days === 1 ? 'dia' : 'dias'}`}
                </div>
              </div>
            </div>
          )}
        </div>

        {query.isLoading && <div className="text-sm text-muted-foreground py-8 text-center">Carregando rodadas…</div>}

        {note && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 flex items-start gap-2 text-sm">
            <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-amber-900">{note}</p>
          </div>
        )}

        {!query.isLoading && groups.length === 0 && !note && (
          <div className="text-sm text-muted-foreground py-8 text-center">
            Nenhum resgate encontrado para essa promoção no período.
          </div>
        )}

        {groups.length > 0 && (
          <>
            {/* Resumo geral */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Stat label="Resgates" value={fmtNumber(groups.length)} highlight hint={semJogadas > 0 ? `${semJogadas} sem jogadas` : undefined} />
              <Stat label="Rodadas" value={fmtNumber(rounds.length)} />
              <Stat label="Ganhas" value={fmtNumber(ganhos)} positive />
              <Stat label="Perdidas" value={fmtNumber(perdas)} negative />
              <Stat label="Total ganho" value={fmtBRL(totalGanho)} highlight />
            </div>
            <div className="flex items-center justify-between -mt-1">
              <div className="text-xs text-muted-foreground">
                {rounds.length > 0 && <>Taxa de vitória geral: <strong className="tabular-nums">{winRate.toFixed(1)}%</strong></>}
              </div>
              {groups.length > 1 && (
                <Button variant="ghost" size="sm" onClick={toggleAll} className="h-7 text-xs">
                  {expanded.size === groups.length ? 'Recolher tudo' : 'Expandir tudo'}
                </Button>
              )}
            </div>

            {/* Body scrollável: orphan + resgates juntos */}
            <div className="overflow-y-auto flex-1 -mr-2 pr-2 space-y-3">

            {/* Disparos XP sem resgate correspondente (recebido mas não resgatado) */}
            {orphanDispatches.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 overflow-hidden">
                <div className="bg-amber-100 px-3 py-2 border-b border-amber-200 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-amber-900">
                      Disparada mas NÃO resgatada · {orphanDispatches.length}×
                    </div>
                    <div className="text-[11px] text-amber-800">
                      A XP tentou enviar essas mensagens, mas o usuário não fez nenhum resgate depois.
                      <br />
                      <strong>Entrega ≠ resgate</strong>: "entregue" = chegou ao aparelho; "falhou" = não chegou (push expirado, bloqueado, etc).
                    </div>
                  </div>
                </div>
                <Table>
                  <TableHeader className="bg-amber-50">
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Campanha</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orphanDispatches.map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground tabular-nums text-xs">{i + 1}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {fmtDate(new Date(d.create_time * 1000).toISOString())}
                        </TableCell>
                        <TableCell>
                          <span className="inline-block rounded bg-amber-200 text-amber-900 px-2 py-0.5 text-[11px] font-medium">
                            {d.channel}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[280px]" title={d.campaign_title}>
                          {d.campaign_title ?? '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="inline-flex items-center gap-1.5 text-xs">
                            {d.delivered ? (
                              <span className="text-emerald-700" title="A XP entregou a mensagem ao aparelho/inbox/email">
                                ✓ entregue
                              </span>
                            ) : (
                              <span className="text-red-700" title="A XP tentou enviar mas falhou — não chegou ao usuário (push expirado, bloqueado, sem conexão, etc)">
                                ⚠ falha no envio
                              </span>
                            )}
                            {d.opened  && <span className="text-blue-700"   title="Usuário abriu/visualizou">👁</span>}
                            {d.clicked && <span className="text-purple-700" title="Usuário clicou">🖱</span>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Sessões agrupadas por resgate (accordion) */}
            <div className="space-y-2">
              {groups.map((g, gi) => {
                const isOpen = expanded.has(g.bonus_code);
                const gGanhos = g.rounds.filter((r) => Boolean(r.ganhou)).length;
                const gPerdas = g.rounds.length - gGanhos;
                const gTotal = g.rounds.reduce((s, r) => s + Number(r.valor_ganho || 0), 0);
                const gRate = g.rounds.length > 0 ? (gGanhos / g.rounds.length) * 100 : 0;
                const naoJogou = g.rounds.length === 0;
                const fullyUsed =
                  !naoJogou &&
                  promotion.giros_da_promocao !== undefined &&
                  g.rounds.length >= promotion.giros_da_promocao;

                // Validade calculada com base na DATA DESTE RESGATE
                const exp = bonusExpiration(g.resgate_data, promotion.config_valid_for_days, promotion.config_valid_for_minutes);
                const expExpired = exp ? exp.getTime() <= Date.now() : null;
                const expTimeLeft = exp && !expExpired ? timeUntil(exp) : null;

                return (
                  <div
                    key={g.bonus_code}
                    className={`rounded-lg border overflow-hidden ${
                      naoJogou ? 'border-amber-300' : fullyUsed ? 'border-emerald-300' : ''
                    }`}
                  >
                    {/* Cabeçalho clicável */}
                    <button
                      type="button"
                      onClick={() => !naoJogou && toggle(g.bonus_code)}
                      className={`w-full px-3 py-2 transition-colors text-left space-y-1.5 ${naoJogou ? 'bg-amber-50 cursor-default' : 'bg-muted/50 hover:bg-muted'}`}
                    >
                      {/* Linha 1: Resgate#N + stats inline */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {!naoJogou && (
                            <ChevronDown
                              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`}
                            />
                          )}
                          <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold shrink-0 ${naoJogou ? 'bg-amber-200 text-amber-900' : 'bg-primary/10 text-primary'}`}>
                            <Gift className="h-3 w-3" /> Resgate #{gi + 1}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs tabular-nums">
                          {naoJogou ? (
                            <span className="text-amber-800 font-semibold">
                              Não jogou ainda
                              {promotion.giros_da_promocao !== undefined && (
                                <span className="font-normal"> · {promotion.giros_da_promocao} giros disponíveis</span>
                              )}
                            </span>
                          ) : (
                            <>
                              <span>
                                <strong>{g.rounds.length}</strong>
                                {promotion.giros_da_promocao !== undefined && (
                                  <span className="text-muted-foreground">/{promotion.giros_da_promocao}</span>
                                )}{' '}
                                <span className="text-muted-foreground">rodadas</span>
                              </span>
                              <span className="text-emerald-700"><strong>{gGanhos}</strong> <span className="text-muted-foreground">ganhas</span></span>
                              <span className="text-muted-foreground">{gPerdas} perdidas</span>
                              <span className="text-muted-foreground">·</span>
                              <span>{gRate.toFixed(0)}%</span>
                              <span className="text-muted-foreground">·</span>
                              <span className="font-semibold">{fmtBRL(gTotal)}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Linha 2: Timeline RECEBIDA → RESGATADA → VALIDADE em cards */}
                      <div className="ml-6 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        {/* RECEBIDA via XP (último dispatch antes do resgate) */}
                        <div className="rounded border bg-blue-50 border-blue-200 px-2 py-1.5">
                          <div className="text-[9px] uppercase tracking-wide font-semibold text-blue-900 flex items-center gap-1">
                            <Send className="h-2.5 w-2.5" /> Recebida via XP
                          </div>
                          {(dispatchByResgate.get(g.bonus_code) ?? []).length > 0 ? (
                            <>
                              <div className="font-semibold text-blue-900 mt-0.5 tabular-nums">
                                {fmtDate(new Date(((dispatchByResgate.get(g.bonus_code) ?? []).slice(-1)[0]!.create_time) * 1000).toISOString())}
                              </div>
                              <div className="text-[10px] text-blue-700/80 flex items-center gap-1 mt-0.5">
                                <span className="inline-block rounded bg-blue-200 px-1 py-0.5 text-[9px] font-semibold">
                                  {(dispatchByResgate.get(g.bonus_code) ?? []).slice(-1)[0]!.channel}
                                </span>
                                {(dispatchByResgate.get(g.bonus_code) ?? []).length > 1 && (
                                  <span>+ {(dispatchByResgate.get(g.bonus_code) ?? []).length - 1}</span>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="text-[10px] text-muted-foreground italic mt-0.5">sem disparo XP linkado</div>
                          )}
                        </div>

                        {/* RESGATADA */}
                        <div className="rounded border bg-emerald-50 border-emerald-200 px-2 py-1.5">
                          <div className="text-[9px] uppercase tracking-wide font-semibold text-emerald-900 flex items-center gap-1">
                            <Gift className="h-2.5 w-2.5" /> Resgatada em
                          </div>
                          <div className="font-semibold text-emerald-900 mt-0.5 tabular-nums">
                            {fmtDate(g.resgate_data)}
                          </div>
                        </div>

                        {/* VALIDADE / TEMPO PRA USAR */}
                        <div className={`rounded border px-2 py-1.5 ${fullyUsed ? 'bg-emerald-50 border-emerald-200' : exp && expExpired ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                          <div className={`text-[9px] uppercase tracking-wide font-semibold flex items-center gap-1 ${fullyUsed ? 'text-emerald-900' : exp && expExpired ? 'text-red-900' : 'text-amber-900'}`}>
                            <Hourglass className="h-2.5 w-2.5" /> Para usar
                          </div>
                          {fullyUsed ? (
                            <>
                              <div className="font-semibold text-emerald-700 mt-0.5 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Resgatado
                              </div>
                              <div className="text-[10px] text-emerald-700/80">todas as {promotion.giros_da_promocao} rodadas usadas</div>
                            </>
                          ) : exp ? (
                            expExpired ? (
                              <>
                                <div className="font-semibold text-red-700 mt-0.5">Expirou</div>
                                <div className="text-[10px] text-red-700/80 tabular-nums">em {fmtDate(exp.toISOString())}</div>
                              </>
                            ) : (
                              <>
                                <div className={`font-semibold mt-0.5 tabular-nums ${expTimeLeft && /min$|^\d+h$/.test(expTimeLeft) ? 'text-red-700' : 'text-amber-700'}`}>
                                  Faltam {expTimeLeft}
                                </div>
                                <div className="text-[10px] text-amber-700/80 tabular-nums">até {fmtDate(exp.toISOString())}</div>
                              </>
                            )
                          ) : (
                            <div className="text-[10px] text-muted-foreground italic mt-0.5">sem prazo</div>
                          )}
                          {!fullyUsed && !naoJogou && promotion.giros_da_promocao !== undefined && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {promotion.giros_da_promocao - g.rounds.length} giros restantes
                            </div>
                          )}
                        </div>
                      </div>

                      {/* bonus_code */}
                      <div className="ml-6 text-[10px] font-mono text-muted-foreground truncate" title={g.bonus_code}>
                        {g.bonus_code}
                      </div>
                    </button>

                    {/* Tabela colapsável (só renderiza se tem rodadas e está aberto) */}
                    {!naoJogou && isOpen && (
                      <div className="max-h-[400px] overflow-auto">
                        <Table>
                          <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow>
                              <TableHead className="w-12">#</TableHead>
                              <TableHead>Data</TableHead>
                              <TableHead>Round ID</TableHead>
                              <TableHead>Jogo</TableHead>
                              <TableHead className="text-center">Resultado</TableHead>
                              <TableHead className="text-right">Valor ganho</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {g.rounds.map((r, i) => {
                              const won = Boolean(r.ganhou);
                              return (
                                <TableRow key={r.round_id + i} className={won ? 'bg-emerald-50/50' : ''}>
                                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                                  <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.data)}</TableCell>
                                  <TableCell className="text-xs font-mono text-muted-foreground" title={r.round_id}>
                                    {r.round_id.length > 20 ? r.round_id.slice(0, 20) + '…' : r.round_id}
                                  </TableCell>
                                  <TableCell className="text-xs">{r.game_name || r.game_id || '-'}</TableCell>
                                  <TableCell className="text-center">
                                    {won ? (
                                      <span className="inline-flex items-center gap-1 text-emerald-700 font-medium text-xs">
                                        <Trophy className="h-3 w-3" /> Ganhou
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                                        <XIcon className="h-3 w-3" /> Perdeu
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums font-medium">
                                    {Number(r.valor_ganho) > 0 ? fmtBRL(r.valor_ganho) : <span className="text-muted-foreground">-</span>}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  hint,
  positive,
  negative,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  positive?: boolean;
  negative?: boolean;
  highlight?: boolean;
}) {
  const cls = positive
    ? 'border-emerald-300 bg-emerald-50'
    : negative
    ? 'border-red-200 bg-red-50/40'
    : highlight
    ? 'border-primary/40 bg-primary/5'
    : '';
  return (
    <div className={`rounded-lg border p-2 ${cls}`}>
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="text-lg font-bold tabular-nums leading-tight">{value}</div>
      {hint && <div className="text-[10px] text-amber-700 mt-0.5">{hint}</div>}
    </div>
  );
}
