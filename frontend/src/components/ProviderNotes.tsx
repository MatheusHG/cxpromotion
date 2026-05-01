import { Info, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

type Provider = 'PRAGMATIC' | 'SOFTSWISS' | 'AVIATOR';

interface Note {
  text: string;
  type?: 'info' | 'warn';
}

const NOTES: Record<Provider, { description: string; notes: Note[] }> = {
  PRAGMATIC: {
    description: 'Cada free spin gera uma linha individual de transação. Resgate, giro e ganho são linhas separadas.',
    notes: [
      { type: 'info', text: 'Resgate e giro têm o mesmo type (DEBIT_BY_CASINO_BET) — só context_identifier preenchido distingue.' },
      { type: 'info', text: 'Linking entre giros e seu resgate via bonusCode UUID em info_extra_info ↔ info_bet_id do resgate.' },
      { type: 'info', text: 'taxa_de_resgate = giros executados / (config_rounds × resgates). 100% = todos os free spins foram jogados.' },
      { type: 'warn', text: 'Filtro info_extra_info LIKE \'BONUS_NGX_TRG%\' é obrigatório — sem ele, apostas em dinheiro real são contadas como giros.' },
    ],
  },
  SOFTSWISS: {
    description: 'Apenas 2 linhas por sessão de bônus: 1 resgate + 1 ganho agregado (no fim).',
    notes: [
      { type: 'warn', text: 'Giros individuais NÃO são logados em transactions — só sabemos se a sessão começou (resgate) e terminou (ganho).' },
      { type: 'warn', text: 'Ganho só é registrado se o usuário concluir TODAS as rodadas. Quem desistiu no meio aparece como "abandonado" sem valor de ganho parcial.' },
      { type: 'info', text: 'Linking via mesmo info_bet_id no resgate e no ganho.' },
      { type: 'info', text: 'taxa_de_resgate = sessões concluídas / resgates. Equivale ao % de bônus que foram totalmente jogados.' },
    ],
  },
  AVIATOR: {
    description: 'Resgate como DEBIT, mas todos os giros aparecem como CREDIT (mesmo os perdidos). O resultado vem em info_extra_info.',
    notes: [
      { type: 'info', text: 'reason:FREEBET_WIN = giro premiado · reason:FREEBET_LOST = giro perdido. Não há linha separada de "ganho".' },
      { type: 'warn', text: 'Sem mapeamento direto entre resgate e giros (info_bet_id é diferente). Atribuição usa correlação temporal (ASOF JOIN: cada giro vai pra promoção mais recente do mesmo usuário).' },
      { type: 'warn', text: 'Edge case: se o usuário resgata 2 promoções AVIATOR sem jogar entre elas, todos os giros vão atribuídos à última.' },
      { type: 'info', text: 'taxa_de_resgate = giros executados / (config_rounds × resgates). pct_ganho = giros premiados / total de giros.' },
    ],
  },
};

export function ProviderNotes({ provider }: { provider: Provider }) {
  const { description, notes } = NOTES[provider];
  return (
    <Card className="bg-muted/40 border-dashed">
      <CardContent className="pt-4 pb-4 space-y-2">
        <p className="text-sm font-medium">{description}</p>
        <ul className="space-y-1.5">
          {notes.map((n, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              {n.type === 'warn' ? (
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
              ) : (
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-600" />
              )}
              <span>{n.text}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
