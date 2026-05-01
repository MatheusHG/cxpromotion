import { config } from '../config.js';

const BASE_URL = `https://api.${config.xtremepush.region}.xtremepush.com/api/external`;

interface XPCondition {
  field: string;
  op: '=' | '!=' | '>=' | '<=' | '>' | '<' | 'IN' | 'NOT IN';
  value: string | number | (string | number)[];
}

/**
 * Constrói o objeto `condition` no formato XtremePush:
 *   { "0": [field, op, value], "1": [...], "operator": "AND" }
 */
function buildCondition(filters: XPCondition[]): Record<string, unknown> | undefined {
  if (!filters.length) return undefined;
  const obj: Record<string, unknown> = { operator: 'AND' };
  filters.forEach((f, i) => {
    obj[String(i)] = [f.field, f.op, f.value];
  });
  return obj;
}

interface XPResponse<T> {
  success: boolean;
  code: number;
  message?: string;
  errors?: unknown[];
  data?: T;
  model?: T;
}

async function call<T>(method: string, model: string, body: Record<string, unknown>): Promise<T> {
  if (!config.xtremepush.apiToken) {
    throw new Error('XTREMEPUSH_API_TOKEN não configurado no .env');
  }
  const res = await fetch(`${BASE_URL}/${method}/${model}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apptoken: config.xtremepush.apiToken, ...body }),
  });
  const json = (await res.json()) as XPResponse<T>;
  if (!json.success) {
    throw new Error(`XtremePush ${method}/${model} falhou: ${json.message ?? 'erro desconhecido'}`);
  }
  return (json.data ?? json.model ?? ([] as unknown)) as T;
}

/** Faz a mesma chamada `list` em chunks pra evitar IN gigante (limit XP). Concatena resultados. */
async function callListChunked<T>(
  method: 'list',
  model: string,
  base: Record<string, unknown>,
  inField: string,
  inValues: (string | number)[],
  chunkSize = 200,
): Promise<T[]> {
  if (inValues.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < inValues.length; i += chunkSize) {
    const slice = inValues.slice(i, i + chunkSize);
    const condition = base.condition as Record<string, unknown> | undefined;
    const baseFilters = Object.entries(condition ?? {})
      .filter(([k]) => k !== 'operator')
      .map(([, v]) => v);
    const newCondition: Record<string, unknown> = { operator: 'AND' };
    baseFilters.forEach((f, idx) => { newCondition[String(idx)] = f; });
    newCondition[String(baseFilters.length)] = [inField, 'IN', slice];

    const data = await call<T[]>(method, model, { ...base, condition: newCondition });
    if (Array.isArray(data)) out.push(...data);
  }
  return out;
}

export interface Campaign {
  id: number;
  title: string;
  trigger: number;
  type: number;
  active: number;
  status: number;
  create_time: number;
  activate_time: number | null;
  deactivate_time: number | null;
  sms: number;
  email: number;
  ios_push: number;
  android_push: number;
  web_push: number;
  inbox: number;
  webhook: number;
  [key: string]: unknown;
}

export interface Message {
  id: number;
  campaign_id: number;
  user_id: string;
  profile_id: string;
  create_time: number;
  message_type_name: string;
  delivery: number;
  open: number;
  click: number;
  error: number;
  error_message: string | null;
  open_time: number | null;
  click_time: number | null;
  status: number;
}

export const xtremepush = {
  async listCampaigns(opts: { limit?: number; offset?: number } = {}): Promise<Campaign[]> {
    return call<Campaign[]>('list', 'campaign', {
      limit: opts.limit ?? 200,
      offset: opts.offset ?? 0,
      select: [
        'id', 'title', 'trigger', 'type', 'active', 'status',
        'create_time', 'activate_time', 'deactivate_time',
        'sms', 'email', 'ios_push', 'android_push', 'web_push', 'inbox', 'webhook',
      ],
    });
  },

  async getCampaign(id: number | string): Promise<Campaign> {
    return call<Campaign>('info', 'campaign', { id: String(id) });
  },

  /** Busca info resumida (título + imagem + xp promotion_id) das campanhas em uma única chamada. */
  async getCampaignSummaries(
    ids: number[],
  ): Promise<Map<number, { title: string; image: string | null; xp_promotion_id: number | null }>> {
    const map = new Map<number, { title: string; image: string | null; xp_promotion_id: number | null }>();
    if (ids.length === 0) return map;
    const data = await call<Array<{ id: number; title: string; promotion_id: number | null; messages?: Record<string, unknown> }>>(
      'list',
      'campaign',
      {
        condition: { '0': ['id', 'IN', ids], operator: 'AND' },
        select: ['id', 'title', 'promotion_id', 'messages'],
        limit: ids.length + 10,
      },
    );
    for (const c of data) {
      let image: string | null = null;
      for (const v of Object.values(c.messages ?? {})) {
        if (v && typeof v === 'object') {
          const m = v as Record<string, unknown>;
          const candidate = (m.push_picture as string) || (m.push_icon as string) || null;
          if (candidate) { image = candidate; break; }
        }
      }
      map.set(c.id, { title: c.title, image, xp_promotion_id: c.promotion_id });
    }
    return map;
  },

  /** Mapa xp_promotion_id → external_id (= casino promotion._id) para múltiplas promoções XP. */
  async getCasinoExternalIds(xpPromotionIds: number[]): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    if (xpPromotionIds.length === 0) return map;
    const data = await call<Array<{ id: number; external_id: string | null }>>('list', 'promotion', {
      condition: { '0': ['id', 'IN', xpPromotionIds], operator: 'AND' },
      select: ['id', 'external_id'],
      limit: xpPromotionIds.length + 10,
    });
    for (const p of data) if (p.external_id) map.set(p.id, p.external_id);
    return map;
  },

  /** Encontra campanhas XP cuja promotion aponta pra essas casino promotions (external_id). */
  async findCampaignsForCasinoPromos(
    casinoIds: string[],
  ): Promise<Map<string, { xp_promotion_id: number; campaign_ids: number[] }>> {
    const result = new Map<string, { xp_promotion_id: number; campaign_ids: number[] }>();
    if (casinoIds.length === 0) return result;

    // 1) casino._id → xp promotion.id
    const promos = await call<Array<{ id: number; external_id: string }>>('list', 'promotion', {
      condition: { '0': ['external_id', 'IN', casinoIds], operator: 'AND' },
      select: ['id', 'external_id'],
      limit: casinoIds.length + 10,
    });
    if (!promos.length) return result;

    const promoIdToCasinoId = new Map<number, string>();
    for (const p of promos) {
      promoIdToCasinoId.set(p.id, p.external_id);
      result.set(p.external_id, { xp_promotion_id: p.id, campaign_ids: [] });
    }

    // 2) xp promotion.id → campanhas
    const campaigns = await call<Array<{ id: number; promotion_id: number }>>('list', 'campaign', {
      condition: { '0': ['promotion_id', 'IN', Array.from(promoIdToCasinoId.keys())], operator: 'AND' },
      select: ['id', 'promotion_id'],
      limit: 1000,
    });
    for (const c of campaigns) {
      const casinoId = promoIdToCasinoId.get(c.promotion_id);
      if (casinoId) result.get(casinoId)!.campaign_ids.push(c.id);
    }
    return result;
  },

  /** Stats agregadas de envios por casino promotion (batch). */
  async getDispatchStatsForCasinoPromos(
    casinoIds: string[],
    opts: { startDate?: number; endDate?: number } = {},
  ): Promise<
    Map<
      string,
      {
        campaigns: number;
        dispatches: number;
        users: number;             // total distintos (delivered + failed_only)
        users_delivered: number;   // distintos que receberam pelo menos 1
        users_failed: number;      // distintos cujos disparos TODOS falharam
        delivered: number;
        failed: number;
        opened: number;
        clicked: number;
      }
    >
  > {
    const out = new Map<
      string,
      { campaigns: number; dispatches: number; users: number; users_delivered: number; users_failed: number; delivered: number; failed: number; opened: number; clicked: number }
    >();
    if (casinoIds.length === 0) return out;

    const map = await this.findCampaignsForCasinoPromos(casinoIds);
    const allCampaignIds = Array.from(map.values()).flatMap((v) => v.campaign_ids);
    if (allCampaignIds.length === 0) {
      for (const id of casinoIds) {
        out.set(id, { campaigns: 0, dispatches: 0, users: 0, users_delivered: 0, users_failed: 0, delivered: 0, failed: 0, opened: 0, clicked: 0 });
      }
      return out;
    }

    // Filtros base (sem o IN — é injetado por chunk)
    const dateFilters: XPCondition[] = [];
    if (opts.startDate) dateFilters.push({ field: 'create_time', op: '>=', value: opts.startDate });
    if (opts.endDate)   dateFilters.push({ field: 'create_time', op: '<=', value: opts.endDate });

    const messages = await callListChunked<Pick<Message, 'campaign_id' | 'user_id' | 'delivery' | 'open' | 'click'>>(
      'list',
      'message',
      {
        condition: buildCondition(dateFilters),
        select: ['campaign_id', 'user_id', 'delivery', 'open', 'click'],
        limit: 5000,
      },
      'campaign_id',
      allCampaignIds,
      200,
    );

    // Reverse: campaign_id → casino_id
    const campaignToCasino = new Map<number, string>();
    for (const [casinoId, v] of map.entries()) {
      for (const cId of v.campaign_ids) campaignToCasino.set(cId, casinoId);
    }

    interface Acc {
      campaigns: Set<number>;
      users: Set<string>;
      delivered_users: Set<string>;
      dispatches: number;
      delivered: number;
      failed: number;
      opened: number;
      clicked: number;
    }
    const acc = new Map<string, Acc>();
    for (const id of casinoIds) {
      acc.set(id, { campaigns: new Set(), users: new Set(), delivered_users: new Set(), dispatches: 0, delivered: 0, failed: 0, opened: 0, clicked: 0 });
    }
    for (const m of messages) {
      const casinoId = campaignToCasino.get(m.campaign_id);
      if (!casinoId) continue;
      const a = acc.get(casinoId)!;
      a.campaigns.add(m.campaign_id);
      a.users.add(m.user_id);
      a.dispatches += 1;
      if (m.delivery === 1) {
        a.delivered += 1;
        a.delivered_users.add(m.user_id);
      } else {
        a.failed += 1;
      }
      a.opened  += m.open;
      a.clicked += m.click;
    }
    for (const [id, a] of acc.entries()) {
      out.set(id, {
        campaigns: a.campaigns.size,
        users: a.users.size,
        users_delivered: a.delivered_users.size,
        users_failed: a.users.size - a.delivered_users.size,
        dispatches: a.dispatches,
        delivered: a.delivered,
        failed: a.failed,
        opened: a.opened,
        clicked: a.clicked,
      });
    }
    return out;
  },

  async listUserMessages(
    userId: string,
    opts: { startDate?: number; endDate?: number; campaignId?: number; limit?: number } = {},
  ): Promise<Message[]> {
    const filters: XPCondition[] = [{ field: 'user_id', op: '=', value: userId }];
    if (opts.startDate) filters.push({ field: 'create_time', op: '>=', value: opts.startDate });
    if (opts.endDate)   filters.push({ field: 'create_time', op: '<=', value: opts.endDate });
    if (opts.campaignId) filters.push({ field: 'campaign_id', op: '=', value: opts.campaignId });

    return call<Message[]>('list', 'message', {
      condition: buildCondition(filters),
      limit: opts.limit ?? 5000,
      select: [
        'id', 'campaign_id', 'user_id', 'profile_id', 'create_time',
        'message_type_name', 'delivery', 'open', 'click', 'error', 'error_message',
        'open_time', 'click_time', 'status',
      ],
    });
  },

  async listCampaignMessages(
    campaignId: number,
    opts: { startDate?: number; endDate?: number; limit?: number } = {},
  ): Promise<Message[]> {
    const filters: XPCondition[] = [{ field: 'campaign_id', op: '=', value: campaignId }];
    if (opts.startDate) filters.push({ field: 'create_time', op: '>=', value: opts.startDate });
    if (opts.endDate)   filters.push({ field: 'create_time', op: '<=', value: opts.endDate });

    return call<Message[]>('list', 'message', {
      condition: buildCondition(filters),
      limit: opts.limit ?? 5000,
      select: ['id', 'delivery', 'open', 'click', 'error', 'create_time', 'message_type_name'],
    });
  },
};
