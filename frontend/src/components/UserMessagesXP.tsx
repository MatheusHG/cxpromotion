import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Send, MessageSquare, Mail, Bell, Smartphone, Globe, Inbox,
  AlertCircle, CheckCircle2, Eye, MousePointerClick, ChevronDown,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtDate, fmtNumber } from '@/lib/utils';

interface XPMessage {
  id: number;
  campaign_id: number;
  campaign_title: string;
  campaign_image: string | null;
  user_id: string;
  create_time: number;
  message_type_name: string;
  delivery: number;
  open: number;
  click: number;
  error: number;
  error_message: string | null;
  open_time: number | null;
  click_time: number | null;
}

interface Props {
  userId: string;
  startDate: string;
  endDate: string;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  sms: <MessageSquare className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  push: <Bell className="h-3.5 w-3.5" />,
  ios_push: <Smartphone className="h-3.5 w-3.5" />,
  android_push: <Smartphone className="h-3.5 w-3.5" />,
  web_push: <Globe className="h-3.5 w-3.5" />,
  inbox: <Inbox className="h-3.5 w-3.5" />,
  onsite: <Globe className="h-3.5 w-3.5" />,
  promotion: <Bell className="h-3.5 w-3.5" />,
};

const TYPE_BADGES: Record<string, string> = {
  sms: 'bg-green-100 text-green-800',
  email: 'bg-blue-100 text-blue-800',
  push: 'bg-purple-100 text-purple-800',
  ios_push: 'bg-purple-100 text-purple-800',
  android_push: 'bg-purple-100 text-purple-800',
  web_push: 'bg-indigo-100 text-indigo-800',
  inbox: 'bg-amber-100 text-amber-800',
  onsite: 'bg-cyan-100 text-cyan-800',
  promotion: 'bg-pink-100 text-pink-800',
};

interface CampaignGroup {
  campaign_id: number;
  campaign_title: string;
  campaign_image: string | null;
  messages: XPMessage[];
  channels: Set<string>;
  firstReceived: number;
  lastReceived: number;
  delivered: number;
  opened: number;
  clicked: number;
  errors: number;
}

export function UserMessagesXP({ userId, startDate, endDate }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const params = { start_date: startDate, end_date: endDate };
  const query = useQuery({
    queryKey: ['xp-messages', userId, params],
    queryFn: async () => (await api.get<XPMessage[]>(`/xtremepush/users/${userId}/messages`, { params })).data,
    enabled: !!userId,
    staleTime: 30_000,
  });

  const data = query.data ?? [];

  const groups = useMemo<CampaignGroup[]>(() => {
    const map = new Map<number, CampaignGroup>();
    for (const m of data) {
      const g = map.get(m.campaign_id) ?? {
        campaign_id: m.campaign_id,
        campaign_title: m.campaign_title,
        campaign_image: m.campaign_image,
        messages: [],
        channels: new Set<string>(),
        firstReceived: m.create_time,
        lastReceived: m.create_time,
        delivered: 0, opened: 0, clicked: 0, errors: 0,
      };
      g.messages.push(m);
      g.channels.add(m.message_type_name);
      g.firstReceived = Math.min(g.firstReceived, m.create_time);
      g.lastReceived  = Math.max(g.lastReceived,  m.create_time);
      g.delivered += m.delivery;
      g.opened    += m.open;
      g.clicked   += m.click;
      g.errors    += m.error;
      map.set(m.campaign_id, g);
    }
    return Array.from(map.values()).sort((a, b) => b.lastReceived - a.lastReceived);
  }, [data]);

  const totals = {
    campaigns: groups.length,
    total: data.length,
    delivered: data.filter((m) => m.delivery === 1).length,
    opened: data.filter((m) => m.open === 1).length,
    clicked: data.filter((m) => m.click === 1).length,
    errors: data.filter((m) => m.error === 1).length,
  };

  function toggle(id: number) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-4 w-4" /> Promoções/campanhas recebidas via XtremePush
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-3 flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-2.5 w-1/3" />
                  </div>
                  <Skeleton className="h-6 w-32" />
                </div>
              ))}
            </div>
          </div>
        )}
        {query.error && (
          <div className="text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Erro: {(query.error as Error)?.message}
          </div>
        )}
        {query.data && data.length === 0 && (
          <div className="text-sm text-muted-foreground">
            Nenhuma campanha enviada para esse usuário no período.
          </div>
        )}
        {data.length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
              <Stat label="Campanhas" value={totals.campaigns} highlight />
              <Stat label="Mensagens" value={totals.total} />
              <Stat label="Entregues" value={totals.delivered} positive />
              <Stat label="Abertas" value={totals.opened} positive />
              <Stat label="Clicadas" value={totals.clicked} positive />
              <Stat label="Erros" value={totals.errors} negative />
            </div>

            <div className="space-y-2">
              {groups.map((g) => {
                const isOpen = expanded.has(g.campaign_id);
                return (
                  <div key={g.campaign_id} className="rounded-lg border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggle(g.campaign_id)}
                      className="w-full bg-muted/30 hover:bg-muted px-3 py-2 transition-colors text-left"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`}
                          />
                          {g.campaign_image ? (
                            <img
                              src={g.campaign_image}
                              alt=""
                              loading="lazy"
                              className="h-10 w-10 rounded object-cover shrink-0 border"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="h-10 w-10 rounded bg-muted shrink-0 flex items-center justify-center">
                              <Send className="h-4 w-4 text-muted-foreground/40" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm truncate" title={g.campaign_title}>
                              {g.campaign_title}
                            </div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap">
                              <span>ID: {g.campaign_id}</span>
                              <span>·</span>
                              <span>{fmtDate(new Date(g.firstReceived * 1000).toISOString())}{g.firstReceived !== g.lastReceived && <> → {fmtDate(new Date(g.lastReceived * 1000).toISOString())}</>}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex gap-1">
                            {Array.from(g.channels).map((c) => (
                              <span key={c} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGES[c] ?? 'bg-gray-100 text-gray-800'}`}>
                                {TYPE_ICONS[c] ?? <Bell className="h-3 w-3" />}
                                {c}
                              </span>
                            ))}
                          </div>
                          <span className="text-xs tabular-nums whitespace-nowrap">
                            <strong>{g.messages.length}</strong>
                            {g.messages.length === 1 ? ' msg' : ' msgs'}
                          </span>
                          <div className="flex gap-1 text-xs">
                            <StatusIcon active={g.delivered > 0} icon={<CheckCircle2 className="h-3 w-3" />} label="entregue" color="emerald" count={g.delivered} />
                            <StatusIcon active={g.opened > 0} icon={<Eye className="h-3 w-3" />} label="aberta" color="blue" count={g.opened} />
                            <StatusIcon active={g.clicked > 0} icon={<MousePointerClick className="h-3 w-3" />} label="clicou" color="purple" count={g.clicked} />
                            {g.errors > 0 && <StatusIcon active icon={<AlertCircle className="h-3 w-3" />} label="erro" color="red" count={g.errors} />}
                          </div>
                        </div>
                      </div>
                    </button>

                    {isOpen && (
                      <Table>
                        <TableHeader className="bg-background">
                          <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead>Data/Hora</TableHead>
                            <TableHead>Canal</TableHead>
                            <TableHead className="text-center">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {g.messages
                            .slice()
                            .sort((a, b) => b.create_time - a.create_time)
                            .map((m, i) => (
                              <TableRow key={m.id}>
                                <TableCell className="text-muted-foreground tabular-nums text-xs">{i + 1}</TableCell>
                                <TableCell className="text-xs whitespace-nowrap">
                                  {fmtDate(new Date(m.create_time * 1000).toISOString())}
                                </TableCell>
                                <TableCell>
                                  <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${TYPE_BADGES[m.message_type_name] ?? 'bg-gray-100 text-gray-800'}`}>
                                    {TYPE_ICONS[m.message_type_name] ?? <Bell className="h-3.5 w-3.5" />}
                                    {m.message_type_name}
                                  </span>
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="inline-flex items-center gap-2">
                                    {m.error === 1 ? (
                                      <span className="inline-flex items-center gap-1 text-red-700 text-xs" title={m.error_message ?? ''}>
                                        <AlertCircle className="h-3 w-3" /> erro
                                      </span>
                                    ) : (
                                      <>
                                        <SmallStatus active={!!m.delivery} icon={<CheckCircle2 className="h-3 w-3" />} label="entregue" color="emerald" />
                                        <SmallStatus active={!!m.open} icon={<Eye className="h-3 w-3" />} label="aberta" color="blue" />
                                        <SmallStatus active={!!m.click} icon={<MousePointerClick className="h-3 w-3" />} label="clicou" color="purple" />
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, positive, negative, highlight }: { label: string; value: number; positive?: boolean; negative?: boolean; highlight?: boolean }) {
  const cls = positive
    ? 'border-emerald-200 bg-emerald-50'
    : negative
    ? 'border-red-200 bg-red-50/40'
    : highlight
    ? 'border-primary/40 bg-primary/5'
    : '';
  return (
    <div className={`rounded-lg border p-2 ${cls}`}>
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="text-lg font-bold tabular-nums leading-tight">{fmtNumber(value)}</div>
    </div>
  );
}

function StatusIcon({ active, icon, label, color, count }: { active: boolean; icon: React.ReactNode; label: string; color: string; count: number }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${active ? `text-${color}-600 font-semibold` : 'text-muted-foreground/30'}`}
      title={`${label}: ${count}`}
    >
      {icon}
      {active && <span className="tabular-nums">{count}</span>}
    </span>
  );
}

function SmallStatus({ active, icon, label, color }: { active: boolean; icon: React.ReactNode; label: string; color: string }) {
  return (
    <span
      className={`inline-flex items-center ${active ? `text-${color}-600` : 'text-muted-foreground/30'}`}
      title={`${label}: ${active ? 'sim' : 'não'}`}
    >
      {icon}
    </span>
  );
}
