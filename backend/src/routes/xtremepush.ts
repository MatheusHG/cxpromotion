import { Router } from 'express';
import { z } from 'zod';
import { xtremepush } from '../services/xtremepush.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/xtremepush/campaigns
 * Lista campanhas (proxy do list/campaign)
 */
router.get(
  '/campaigns',
  asyncHandler(async (_req, res) => {
    const campaigns = await xtremepush.listCampaigns({ limit: 500 });
    res.json(campaigns);
  }),
);

const userMessagesSchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  campaign_id: z.string().optional(),
});

/**
 * GET /api/xtremepush/users/:user_id/messages?start_date=&end_date=&campaign_id=
 * Histórico de mensagens enviadas pelo XtremePush para um usuário.
 * Datas em formato 'YYYY-MM-DD HH:MM:SS' (mesmo já usado no resto do app).
 */
router.get(
  '/users/:user_id/messages',
  asyncHandler(async (req, res) => {
    const parsed = userMessagesSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { start_date, end_date, campaign_id } = parsed.data;

    const toUnix = (s?: string) => (s ? Math.floor(new Date(s.replace(' ', 'T') + 'Z').getTime() / 1000) : undefined);

    const messages = await xtremepush.listUserMessages(req.params.user_id, {
      startDate: toUnix(start_date),
      endDate:   toUnix(end_date),
      campaignId: campaign_id ? Number(campaign_id) : undefined,
    });

    // 1) Campaign summaries (title + image + xp_promotion_id) — 1 request
    const campaignIds = Array.from(new Set(messages.map((m) => m.campaign_id)));
    const summaries = await xtremepush.getCampaignSummaries(campaignIds);

    // 2) XP promotion IDs → casino external_ids — 1 request (só pra promos preenchidas)
    const xpPromoIds = Array.from(
      new Set(Array.from(summaries.values()).map((s) => s.xp_promotion_id).filter((x): x is number => !!x)),
    );
    const xpPromoToCasino = await xtremepush.getCasinoExternalIds(xpPromoIds);

    const enriched = messages.map((m) => {
      const s = summaries.get(m.campaign_id);
      const casinoPromoId = s?.xp_promotion_id ? xpPromoToCasino.get(s.xp_promotion_id) ?? null : null;
      return {
        ...m,
        campaign_title: s?.title ?? `Campanha #${m.campaign_id}`,
        campaign_image: s?.image ?? null,
        casino_promotion_id: casinoPromoId,
      };
    });

    res.json(enriched);
  }),
);

/**
 * POST /api/xtremepush/promotions/dispatch-stats
 * Body: { casino_ids: string[], start_date?, end_date? }
 * Retorna stats agregadas (campaigns/users/dispatches/delivered/opened/clicked) por casino promotion._id.
 */
const dispatchStatsSchema = z.object({
  casino_ids: z.array(z.string()).min(1).max(500),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

router.post(
  '/promotions/dispatch-stats',
  asyncHandler(async (req, res) => {
    const parsed = dispatchStatsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { casino_ids, start_date, end_date } = parsed.data;

    const toUnix = (s?: string) => (s ? Math.floor(new Date(s.replace(' ', 'T') + 'Z').getTime() / 1000) : undefined);

    const stats = await xtremepush.getDispatchStatsForCasinoPromos(casino_ids, {
      startDate: toUnix(start_date),
      endDate: toUnix(end_date),
    });

    const out: Record<string, unknown> = {};
    for (const [id, s] of stats.entries()) out[id] = s;
    res.json(out);
  }),
);

/**
 * GET /api/xtremepush/campaigns/:id/stats?start_date=&end_date=
 * Estatísticas agregadas de envio de uma campanha.
 */
router.get(
  '/campaigns/:id/stats',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

    const parsed = userMessagesSchema.pick({ start_date: true, end_date: true }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const toUnix = (s?: string) => (s ? Math.floor(new Date(s.replace(' ', 'T') + 'Z').getTime() / 1000) : undefined);

    const messages = await xtremepush.listCampaignMessages(id, {
      startDate: toUnix(parsed.data.start_date),
      endDate:   toUnix(parsed.data.end_date),
    });

    const stats = {
      total: messages.length,
      delivered: messages.filter((m) => m.delivery === 1).length,
      opened:    messages.filter((m) => m.open === 1).length,
      clicked:   messages.filter((m) => m.click === 1).length,
      errors:    messages.filter((m) => m.error === 1).length,
      by_type:   {} as Record<string, number>,
    };
    for (const m of messages) {
      stats.by_type[m.message_type_name] = (stats.by_type[m.message_type_name] ?? 0) + 1;
    }
    res.json(stats);
  }),
);

export default router;
