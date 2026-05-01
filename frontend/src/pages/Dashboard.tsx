import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, Table as TableIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DateRangePicker, defaultRange, toCHDateTime } from '@/components/DateRangePicker';
import { ProviderNotes } from '@/components/ProviderNotes';
import { PromotionCard } from '@/components/PromotionCard';
import { fmtBRL, fmtDate, fmtNumber } from '@/lib/utils';

type ViewMode = 'grid' | 'table';

interface OverviewRow {
  provider: string;
  resgates: number;
  usuarios_que_resgataram: number;
  ganhos: number;
  valor_ganho: number;
}

export function Dashboard() {
  const [range, setRange] = useState(defaultRange());
  const [view, setView] = useState<ViewMode>('grid');

  const params = {
    start_date: toCHDateTime(range.startDate),
    end_date: toCHDateTime(range.endDate),
  };

  const overview = useQuery({
    queryKey: ['overview', params],
    queryFn: async () => (await api.get<OverviewRow[]>('/promotions/overview', { params })).data,
    enabled: !!params.start_date && !!params.end_date,
  });

  const pragmatic = useQuery({
    queryKey: ['pragmatic', params],
    queryFn: async () => (await api.get<any[]>('/promotions/pragmatic', { params })).data,
    enabled: !!params.start_date && !!params.end_date,
  });

  const softswiss = useQuery({
    queryKey: ['softswiss', params],
    queryFn: async () => (await api.get<any[]>('/promotions/softswiss', { params })).data,
    enabled: !!params.start_date && !!params.end_date,
  });

  const aviator = useQuery({
    queryKey: ['aviator', params],
    queryFn: async () => (await api.get<any[]>('/promotions/aviator', { params })).data,
    enabled: !!params.start_date && !!params.end_date,
  });

  // XP dispatch stats — batch único pra todas as promoções visíveis nos 3 providers
  const allPromoIds = useMemo(() => {
    const ids = new Set<string>();
    for (const list of [pragmatic.data, softswiss.data, aviator.data]) {
      for (const p of list ?? []) if (p.promotion_id) ids.add(p.promotion_id);
    }
    return Array.from(ids);
  }, [pragmatic.data, softswiss.data, aviator.data]);

  const xpStats = useQuery({
    queryKey: ['xp-dispatch-stats', allPromoIds, params],
    queryFn: async () =>
      (
        await api.post<Record<string, {
          campaigns: number;
          users: number;
          users_delivered: number;
          users_failed: number;
          dispatches: number;
          delivered: number;
          failed: number;
          opened: number;
          clicked: number;
        }>>(
          '/xtremepush/promotions/dispatch-stats',
          { casino_ids: allPromoIds, start_date: params.start_date, end_date: params.end_date },
        )
      ).data,
    enabled: allPromoIds.length > 0,
    staleTime: 60_000,
  });

  const xpStatsMap = xpStats.data ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard de Promoções</h1>
          <p className="text-sm text-muted-foreground">Resumo dos providers no período selecionado</p>
        </div>
        <DateRangePicker
          startDate={range.startDate}
          endDate={range.endDate}
          onChange={(s, e) => setRange({ startDate: s, endDate: e })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['PRAGMATIC', 'SOFTSWISS', 'AVIATOR'].map((p) => {
          const row = overview.data?.find((r) => r.provider === p);
          return (
            <Card key={p}>
              <CardHeader>
                <CardTitle>{p}</CardTitle>
                <CardDescription>Totais no período</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Resgates</span><span>{fmtNumber(row?.resgates ?? 0)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Usuários únicos</span><span>{fmtNumber(row?.usuarios_que_resgataram ?? 0)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Ganhos / sessões</span><span>{fmtNumber(row?.ganhos ?? 0)}</span></div>
                <div className="flex justify-between font-medium"><span>Valor ganho</span><span>{fmtBRL(row?.valor_ganho ?? 0)}</span></div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="pragmatic">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="pragmatic">PRAGMATIC</TabsTrigger>
            <TabsTrigger value="softswiss">SOFTSWISS</TabsTrigger>
            <TabsTrigger value="aviator">AVIATOR</TabsTrigger>
          </TabsList>
          <div className="flex gap-1">
            <Button variant={view === 'grid' ? 'default' : 'outline'} size="sm" onClick={() => setView('grid')}>
              <LayoutGrid className="h-4 w-4" /> Cards
            </Button>
            <Button variant={view === 'table' ? 'default' : 'outline'} size="sm" onClick={() => setView('table')}>
              <TableIcon className="h-4 w-4" /> Tabela
            </Button>
          </div>
        </div>

        <TabsContent value="pragmatic" className="space-y-4">
          <ProviderNotes provider="PRAGMATIC" />
          {view === 'grid' ? (
            <PromotionGrid provider="PRAGMATIC" loading={pragmatic.isLoading} data={pragmatic.data ?? []} xpStatsMap={xpStatsMap} xpLoading={xpStats.isFetching} />
          ) : (
            <PromotionsTable
              loading={pragmatic.isLoading}
              data={pragmatic.data ?? []}
              columns={[
                { key: 'promocao', label: 'Promoção' },
                { key: 'giros_da_promocao', label: 'FS', align: 'right', fmt: fmtNumber },
                { key: 'valor_por_rodada', label: 'R$/giro', align: 'right', fmt: fmtBRL },
                { key: 'inicio', label: 'Início', fmt: fmtDate },
                { key: 'fim', label: 'Fim', fmt: fmtDate },
                { key: 'resgates', label: 'Resgates', align: 'right', fmt: fmtNumber },
                { key: 'usuarios_que_resgataram', label: 'Usuários', align: 'right', fmt: fmtNumber },
                { key: 'giros_esperados', label: 'Esperados', align: 'right', fmt: fmtNumber },
                { key: 'giros', label: 'Giros', align: 'right', fmt: fmtNumber },
                { key: 'taxa_de_resgate', label: 'Taxa resgate', align: 'right', fmt: (v) => v + '%' },
                { key: 'ganhos', label: 'Ganhos', align: 'right', fmt: fmtNumber },
                { key: 'valor_ganho', label: 'Valor ganho', align: 'right', fmt: fmtBRL },
              ]}
            />
          )}
        </TabsContent>

        <TabsContent value="softswiss" className="space-y-4">
          <ProviderNotes provider="SOFTSWISS" />
          {view === 'grid' ? (
            <PromotionGrid provider="SOFTSWISS" loading={softswiss.isLoading} data={softswiss.data ?? []} xpStatsMap={xpStatsMap} xpLoading={xpStats.isFetching} />
          ) : (
            <PromotionsTable
              loading={softswiss.isLoading}
              data={softswiss.data ?? []}
              columns={[
                { key: 'promocao', label: 'Promoção' },
                { key: 'giros_da_promocao', label: 'FS', align: 'right', fmt: fmtNumber },
                { key: 'valor_por_rodada', label: 'R$/giro', align: 'right', fmt: fmtBRL },
                { key: 'inicio', label: 'Início', fmt: fmtDate },
                { key: 'fim', label: 'Fim', fmt: fmtDate },
                { key: 'resgates', label: 'Resgates', align: 'right', fmt: fmtNumber },
                { key: 'sessoes_concluidas', label: 'Concluídas', align: 'right', fmt: fmtNumber },
                { key: 'sessoes_abandonadas', label: 'Abandonadas', align: 'right', fmt: fmtNumber },
                { key: 'taxa_de_resgate', label: 'Taxa resgate', align: 'right', fmt: (v) => v + '%' },
                { key: 'valor_ganho_total', label: 'Valor ganho', align: 'right', fmt: fmtBRL },
              ]}
            />
          )}
        </TabsContent>

        <TabsContent value="aviator" className="space-y-4">
          <ProviderNotes provider="AVIATOR" />
          {view === 'grid' ? (
            <PromotionGrid provider="AVIATOR" loading={aviator.isLoading} data={aviator.data ?? []} xpStatsMap={xpStatsMap} xpLoading={xpStats.isFetching} />
          ) : (
            <PromotionsTable
              loading={aviator.isLoading}
              data={aviator.data ?? []}
              columns={[
                { key: 'promocao', label: 'Promoção' },
                { key: 'giros_da_promocao', label: 'FS', align: 'right', fmt: fmtNumber },
                { key: 'valor_por_rodada', label: 'R$/giro', align: 'right', fmt: fmtBRL },
                { key: 'inicio', label: 'Início', fmt: fmtDate },
                { key: 'fim', label: 'Fim', fmt: fmtDate },
                { key: 'resgates', label: 'Resgates', align: 'right', fmt: fmtNumber },
                { key: 'giros_esperados', label: 'Esperados', align: 'right', fmt: fmtNumber },
                { key: 'giros', label: 'Giros', align: 'right', fmt: fmtNumber },
                { key: 'taxa_de_resgate', label: 'Taxa resgate', align: 'right', fmt: (v) => v + '%' },
                { key: 'ganhos', label: 'Ganhos', align: 'right', fmt: fmtNumber },
                { key: 'perdas', label: 'Perdas', align: 'right', fmt: fmtNumber },
                { key: 'pct_giros_ganhos', label: '% ganho', align: 'right', fmt: (v) => v + '%' },
                { key: 'valor_ganho', label: 'Valor ganho', align: 'right', fmt: fmtBRL },
              ]}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface Column {
  key: string;
  label: string;
  align?: 'left' | 'right';
  fmt?: (v: any) => string;
}

function PromotionGrid({
  provider,
  loading,
  data,
  xpStatsMap,
  xpLoading,
}: {
  provider: 'PRAGMATIC' | 'SOFTSWISS' | 'AVIATOR';
  loading: boolean;
  data: any[];
  xpLoading: boolean;
  xpStatsMap: Record<string, {
    campaigns: number;
    users: number;
    users_delivered: number;
    users_failed: number;
    dispatches: number;
    delivered: number;
    failed: number;
    opened: number;
    clicked: number;
  }>;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <PromotionCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (!data.length) return <div className="text-sm text-muted-foreground p-4">Nenhuma promoção encontrada no período.</div>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {data.map((p) => (
        <PromotionCard
          key={p.promotion_id}
          provider={provider}
          promotion={p}
          xpStats={xpStatsMap[p.promotion_id] ?? null}
          xpStatsLoading={xpLoading}
        />
      ))}
    </div>
  );
}

function PromotionCardSkeleton() {
  return (
    <Card className="overflow-hidden flex flex-col">
      <Skeleton className="h-40 w-full rounded-none" />
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-8 w-full" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
        <div className="mt-auto pt-2 border-t flex items-end justify-between">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
    </Card>
  );
}

function PromotionsTable({ loading, data, columns }: { loading: boolean; data: any[]; columns: Column[] }) {
  if (loading) return <div className="text-sm text-muted-foreground p-4">Carregando…</div>;
  if (!data.length) return <div className="text-sm text-muted-foreground p-4">Nenhuma promoção encontrada no período.</div>;
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key} className={c.align === 'right' ? 'text-right' : ''}>{c.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i}>
              {columns.map((c) => {
                const v = row[c.key];
                return (
                  <TableCell key={c.key} className={c.align === 'right' ? 'text-right tabular-nums' : ''}>
                    {c.fmt ? c.fmt(v) : v}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
