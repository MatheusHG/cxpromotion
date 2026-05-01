import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, Search, Table as TableIcon, Trophy, Repeat, DollarSign, Layers } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { DateRangePicker, defaultRange, toCHDateTime } from '@/components/DateRangePicker';
import { PromotionCard } from '@/components/PromotionCard';
import { PromotionMultiSelect } from '@/components/PromotionMultiSelect';
import { PromotionRoundsDialog } from '@/components/PromotionRoundsDialog';
import { UserMessagesXP } from '@/components/UserMessagesXP';
import { fmtBRL, fmtDate, fmtNumber } from '@/lib/utils';

type Provider = 'PRAGMATIC' | 'SOFTSWISS' | 'AVIATOR';
type ViewMode = 'grid' | 'table';

interface UserHistoryRow {
  promotion_id: string;
  promocao: string;
  friendly_name?: string;
  image?: string;
  description?: string;
  game_id?: string;
  game_name?: string;
  provider: Provider;
  giros_da_promocao: number;
  valor_por_rodada: string;
  config_valid_for_days?: number;
  config_valid_for_minutes?: number;
  criada_em: string;
  inicio: string;
  fim: string;
  resgates: number;
  primeiro_resgate: string;
  ultimo_resgate: string;
  giros_esperados: number;
  giros: number;
  ganhos: number;
  perdas: number;
  valor_ganho: number;
  taxa_de_resgate: number;
}

export function UserSearch() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Estado inicial vem da URL (se houver), senão usa defaults
  const fallback = defaultRange();
  const initialUserId = searchParams.get('user_id') ?? '';
  const initialStartDate = searchParams.get('start_date') ?? fallback.startDate;
  const initialEndDate = searchParams.get('end_date') ?? fallback.endDate;
  const initialIsTest = searchParams.get('is_test') === 'true';
  const initialPromotionIds = searchParams.getAll('promotion_ids');

  const [userId, setUserId] = useState(initialUserId);
  const [searchUserId, setSearchUserId] = useState(initialUserId);
  const [range, setRange] = useState({ startDate: initialStartDate, endDate: initialEndDate });
  const [isTest, setIsTest] = useState(initialIsTest);
  const [searchIsTest, setSearchIsTest] = useState(initialIsTest);
  const [promotionIds, setPromotionIds] = useState<string[]>(initialPromotionIds);
  const [searchPromotionIds, setSearchPromotionIds] = useState<string[]>(initialPromotionIds);
  const [view, setView] = useState<ViewMode>('grid');
  const [selected, setSelected] = useState<UserHistoryRow | null>(null);

  const params = {
    user_id: searchUserId,
    start_date: toCHDateTime(range.startDate),
    end_date: toCHDateTime(range.endDate),
    is_test: String(searchIsTest),
    ...(searchPromotionIds.length > 0 ? { promotion_ids: searchPromotionIds } : {}),
  };

  const query = useQuery({
    queryKey: ['user-search', params],
    queryFn: async () => (await api.get<UserHistoryRow[]>('/user-search', { params })).data,
    enabled: !!searchUserId,
  });

  // Mensagens XP do usuário — mesma queryKey usada por UserMessagesXP, então o cache do React Query é compartilhado.
  const xpMessagesParams = { start_date: params.start_date, end_date: params.end_date };
  const xpMessages = useQuery({
    queryKey: ['xp-messages', searchUserId, xpMessagesParams],
    queryFn: async () =>
      (
        await api.get<Array<{
          campaign_id: number;
          campaign_title: string;
          casino_promotion_id: string | null;
          create_time: number;
          message_type_name: string;
          delivery: number;
          open: number;
          click: number;
        }>>(`/xtremepush/users/${searchUserId}/messages`, { params: xpMessagesParams })
      ).data,
    enabled: !!searchUserId,
    staleTime: 30_000,
  });

  const xpByPromo = useMemo(() => {
    const map = new Map<string, Array<{ create_time: number; channel: string; delivered: boolean; opened: boolean; clicked: boolean; campaign_title?: string }>>();
    for (const m of xpMessages.data ?? []) {
      if (!m.casino_promotion_id) continue;
      const list = map.get(m.casino_promotion_id) ?? [];
      list.push({
        create_time: m.create_time,
        channel: m.message_type_name,
        delivered: m.delivery === 1,
        opened: m.open === 1,
        clicked: m.click === 1,
        campaign_title: m.campaign_title,
      });
      map.set(m.casino_promotion_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.create_time - b.create_time);
    return map;
  }, [xpMessages.data]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = userId.trim();
    setSearchUserId(trimmed);
    setSearchIsTest(isTest);
    setSearchPromotionIds(promotionIds);

    // Sincroniza com a URL pra refresh preservar a busca
    const next = new URLSearchParams();
    if (trimmed) next.set('user_id', trimmed);
    next.set('start_date', range.startDate);
    next.set('end_date', range.endDate);
    if (isTest) next.set('is_test', 'true');
    for (const id of promotionIds) next.append('promotion_ids', id);
    setSearchParams(next, { replace: true });
  }

  const data = query.data ?? [];
  const totalGanho = data.reduce((s, r) => s + Number(r.valor_ganho || 0), 0);
  const totalResgates = data.reduce((s, r) => s + Number(r.resgates || 0), 0);
  const totalGiros = data.reduce((s, r) => s + Number(r.giros || 0), 0);
  const providersDistinct = Array.from(new Set(data.map((r) => r.provider)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Histórico do usuário</h1>
        <p className="text-sm text-muted-foreground">
          Cole o <code className="text-xs bg-muted px-1 py-0.5 rounded">to_id</code> + período. Ver todas as promoções resgatadas, giros executados, ganhos e taxa de utilização.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1 flex-1 min-w-[280px]">
                <Label htmlFor="user_id">User ID</Label>
                <Input
                  id="user_id"
                  placeholder="ex: 67c3959d1a9e010028a3c0ac"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  required
                />
              </div>
              <DateRangePicker
                startDate={range.startDate}
                endDate={range.endDate}
                onChange={(s, e) => setRange({ startDate: s, endDate: e })}
              />
              <Button type="submit"><Search className="h-4 w-4" /> Buscar</Button>
            </div>
            <div className="max-w-md">
              <PromotionMultiSelect selected={promotionIds} onChange={setPromotionIds} />
            </div>
            <label className="flex items-center gap-2 text-sm select-none cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={isTest}
                onChange={(e) => setIsTest(e.target.checked)}
                className="h-4 w-4 rounded border-input text-primary focus:ring-1 focus:ring-ring cursor-pointer"
              />
              <span>
                Esta é uma <strong>conta de teste</strong>{' '}
                <span className="text-muted-foreground">(filtra <code className="text-xs">info_is_test = true</code>)</span>
              </span>
            </label>
          </form>
        </CardContent>
      </Card>

      {searchUserId && (
        <>
          {query.isLoading && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="overflow-hidden flex flex-col">
                    <Skeleton className="h-40 w-full rounded-none" />
                    <div className="p-4 flex-1 space-y-3">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-8 w-full" />
                      <div className="grid grid-cols-2 gap-2">
                        <Skeleton className="h-8" /><Skeleton className="h-8" />
                        <Skeleton className="h-8" /><Skeleton className="h-8" />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
          {query.error && (
            <Card><CardContent className="pt-6"><div className="text-sm text-destructive">Erro ao buscar dados.</div></CardContent></Card>
          )}
          {query.data && query.data.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">
                  Nenhuma promoção encontrada para esse usuário no período.
                  {!searchIsTest && ' Se for conta de teste, marque a opção e busque novamente.'}
                </div>
              </CardContent>
            </Card>
          )}
          {query.data && query.data.length > 0 && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SummaryCard
                  icon={<Layers className="h-4 w-4" />}
                  label="Promoções"
                  value={fmtNumber(data.length)}
                  hint={providersDistinct.join(' · ')}
                />
                <SummaryCard
                  icon={<Repeat className="h-4 w-4" />}
                  label="Total resgates"
                  value={fmtNumber(totalResgates)}
                />
                <SummaryCard
                  icon={<Trophy className="h-4 w-4" />}
                  label="Giros executados"
                  value={fmtNumber(totalGiros)}
                />
                <SummaryCard
                  icon={<DollarSign className="h-4 w-4" />}
                  label="Total ganho"
                  value={fmtBRL(totalGanho)}
                  highlight
                />
              </div>

              {/* View toggle */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Promoções</h2>
                <div className="flex gap-1">
                  <Button variant={view === 'grid' ? 'default' : 'outline'} size="sm" onClick={() => setView('grid')}>
                    <LayoutGrid className="h-4 w-4" /> Cards
                  </Button>
                  <Button variant={view === 'table' ? 'default' : 'outline'} size="sm" onClick={() => setView('table')}>
                    <TableIcon className="h-4 w-4" /> Tabela
                  </Button>
                </div>
              </div>

              {view === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {data.map((p) => (
                    <PromotionCard
                      key={`${p.provider}-${p.promotion_id}`}
                      provider={p.provider}
                      promotion={p}
                      onClick={() => setSelected(p)}
                      userXPDispatches={xpByPromo.get(p.promotion_id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead>Promoção</TableHead>
                        <TableHead className="text-right">FS</TableHead>
                        <TableHead className="text-right">R$/giro</TableHead>
                        <TableHead>Vigência</TableHead>
                        <TableHead className="text-right">Resgates</TableHead>
                        <TableHead>Primeiro</TableHead>
                        <TableHead>Último</TableHead>
                        <TableHead className="text-right">Giros</TableHead>
                        <TableHead className="text-right">Taxa</TableHead>
                        <TableHead className="text-right">Ganhos</TableHead>
                        <TableHead className="text-right">Perdas</TableHead>
                        <TableHead className="text-right">Valor ganho</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.map((r) => (
                        <TableRow
                          key={`${r.provider}-${r.promotion_id}`}
                          className="cursor-pointer"
                          onClick={() => setSelected(r)}
                        >
                          <TableCell><ProviderBadge provider={r.provider} /></TableCell>
                          <TableCell className="max-w-[280px]">
                            <div className="line-clamp-2 text-sm">{r.friendly_name || r.promocao}</div>
                            {r.game_name && <div className="text-[10px] text-muted-foreground">{r.game_name}</div>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{r.giros_da_promocao}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtBRL(r.valor_por_rodada)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {fmtDate(r.inicio)} → {fmtDate(r.fim)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{r.resgates}</TableCell>
                          <TableCell className="text-xs">{fmtDate(r.primeiro_resgate)}</TableCell>
                          <TableCell className="text-xs">{fmtDate(r.ultimo_resgate)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.provider === 'SOFTSWISS' ? '-' : `${r.giros}/${r.giros_esperados}`}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums font-medium ${taxaColor(r.taxa_de_resgate)}`}>
                            {r.taxa_de_resgate}%
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{r.ganhos}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.perdas}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtBRL(r.valor_ganho)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {searchUserId && (
        <UserMessagesXP
          userId={searchUserId}
          startDate={params.start_date}
          endDate={params.end_date}
        />
      )}

      {selected && (
        <PromotionRoundsDialog
          open
          onClose={() => setSelected(null)}
          promotion={selected}
          provider={selected.provider}
          userId={searchUserId}
          startDate={params.start_date}
          endDate={params.end_date}
          isTest={searchIsTest}
          xpDispatches={xpByPromo.get(selected.promotion_id)}
        />
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? 'border-primary/40 bg-primary/5' : ''}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function ProviderBadge({ provider }: { provider: Provider }) {
  const colors: Record<Provider, string> = {
    PRAGMATIC: 'bg-blue-100 text-blue-800',
    SOFTSWISS: 'bg-purple-100 text-purple-800',
    AVIATOR: 'bg-orange-100 text-orange-800',
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${colors[provider]}`}>
      {provider}
    </span>
  );
}

function taxaColor(taxa: number): string {
  if (taxa >= 80) return 'text-emerald-600';
  if (taxa >= 50) return 'text-amber-600';
  return 'text-red-600';
}
