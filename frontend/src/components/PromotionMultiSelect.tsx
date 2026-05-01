import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Filter, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, fmtDate } from '@/lib/utils';

interface PromotionItem {
  promotion_id: string;
  name: string;
  friendly_name?: string;
  context?: string;
  inicio: string;
  fim: string;
  expirada: number | boolean;
}

interface Props {
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function PromotionMultiSelect({ selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: promotions = [], isLoading } = useQuery({
    queryKey: ['promotions-list'],
    queryFn: async () => (await api.get<PromotionItem[]>('/promotions/list')).data,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return promotions;
    return promotions.filter((p) =>
      (p.friendly_name || '').toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.promotion_id.toLowerCase().includes(q),
    );
  }, [promotions, search]);

  const selectedSet = new Set(selected);

  function toggle(id: string, disabled: boolean) {
    if (disabled) return;
    if (selectedSet.has(id)) onChange(selected.filter((s) => s !== id));
    else onChange([...selected, id]);
  }

  function clearAll(e: React.MouseEvent) {
    e.stopPropagation();
    onChange([]);
  }

  const triggerLabel = selected.length === 0
    ? 'Todas as promoções'
    : `${selected.length} ${selected.length === 1 ? 'promoção' : 'promoções'} selecionada${selected.length === 1 ? '' : 's'}`;

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium leading-none">Filtrar promoções</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              'w-full justify-between font-normal',
              selected.length === 0 && 'text-muted-foreground',
            )}
          >
            <span className="flex items-center gap-2 truncate">
              <Filter className="h-4 w-4 shrink-0" />
              <span className="truncate">{triggerLabel}</span>
            </span>
            <span className="flex items-center gap-1 shrink-0">
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-sm hover:bg-muted p-0.5"
                  aria-label="Limpar seleção"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[420px] p-0">
          <div className="p-2 border-b">
            <Input
              placeholder="Buscar por nome ou ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-[320px] overflow-auto">
            {isLoading && <div className="p-3 text-xs text-muted-foreground">Carregando…</div>}
            {!isLoading && filtered.length === 0 && (
              <div className="p-3 text-xs text-muted-foreground">Nenhuma promoção encontrada.</div>
            )}
            {filtered.map((p) => {
              const checked = selectedSet.has(p.promotion_id);
              const isSportsbook = p.context === 'SPORTSBOOK';
              const disabled = isSportsbook;
              const fullName = p.friendly_name || p.name;
              const hoverTitle = [
                fullName,
                p.friendly_name && p.friendly_name !== p.name ? `(${p.name})` : null,
                `ID: ${p.promotion_id}`,
                isSportsbook ? '⚠ Sportsbook ainda não suportado — em breve' : null,
              ].filter(Boolean).join('\n');
              return (
                <button
                  key={p.promotion_id}
                  type="button"
                  onClick={() => toggle(p.promotion_id, disabled)}
                  disabled={disabled}
                  title={hoverTitle}
                  className={cn(
                    'w-full text-left px-3 py-2 flex items-start gap-2 text-xs border-b last:border-b-0 transition-colors',
                    !disabled && 'hover:bg-accent',
                    checked && 'bg-primary/5',
                    disabled && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0',
                      checked ? 'bg-primary border-primary text-primary-foreground' : 'border-input',
                      disabled && 'border-muted-foreground/30',
                    )}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="block font-medium truncate">{fullName}</span>
                      {isSportsbook && (
                        <span className="shrink-0 inline-block rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[9px] font-semibold">
                          SPORTSBOOK · em breve
                        </span>
                      )}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {fmtDate(p.inicio)} → {fmtDate(p.fim)}
                      {Number(p.expirada) ? ' · expirada' : ' · ativa'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <div className="p-2 border-t flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{selected.length} selecionada(s)</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])} className="h-7 text-xs">
                Limpar
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
