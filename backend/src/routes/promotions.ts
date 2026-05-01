import { Router } from 'express';
import { z } from 'zod';
import { chQuery } from '../db/clickhouse.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();
router.use(authMiddleware);

const dateRangeSchema = z.object({
  start_date: z.string().min(1),
  end_date: z.string().min(1),
});

function parseRange(req: any) {
  return dateRangeSchema.safeParse(req.query);
}

/**
 * GET /api/promotions/overview?start_date=...&end_date=...
 * Resumo dos 3 providers (totais agregados).
 */
/**
 * GET /api/promotions/list
 * Lista de promoções dos últimos 30 dias (ativas + expiradas) — usado em filtros multiselect.
 */
router.get('/list', asyncHandler(async (_req, res) => {
  const sql = `
    SELECT
        _id                                                   AS promotion_id,
        name                                                  AS name,
        ifNull(friendly_name, '')                             AS friendly_name,
        ifNull(context, '')                                   AS context,
        toString(start_date - INTERVAL 3 HOUR)                AS inicio,
        toString(end_date   - INTERVAL 3 HOUR)                AS fim,
        end_date < now() AS expirada
    FROM majorsports.promotions
    WHERE removed = false
      AND start_date >= (now() - INTERVAL 30 DAY)
    ORDER BY start_date DESC
    LIMIT 1000`;
  const rows = await chQuery(sql);
  res.json(rows);
}));

router.get('/overview', asyncHandler(async (req, res) => {
  const parsed = parseRange(req);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { start_date, end_date } = parsed.data;

  const sql = `
    SELECT
      info_provider AS provider,
      countIf(context_identifier != '' AND type = 'DEBIT_BY_CASINO_BET')              AS resgates,
      count(DISTINCT IF(context_identifier != '', to_id, NULL))                       AS usuarios_que_resgataram,
      countIf(
            (info_provider = 'PRAGMATIC' AND context_identifier = '' AND type = 'CREDIT_BY_WINNING_CASINO_BET' AND info_extra_info LIKE 'BONUS_NGX_TRG#bonusCode:%')
         OR (info_provider = 'SOFTSWISS' AND context_identifier = '' AND type = 'CREDIT_BY_WINNING_CASINO_BET' AND info_extra_info LIKE 'BONUS_NGX_TRG#issueId:%')
         OR (info_provider = 'AVIATOR'   AND info_extra_info  = 'BONUS_NGX_TRG#reason:FREEBET_WIN')
      )                                                                               AS ganhos,
      round(sumIf(value,
            (info_provider = 'PRAGMATIC' AND context_identifier = '' AND type = 'CREDIT_BY_WINNING_CASINO_BET' AND info_extra_info LIKE 'BONUS_NGX_TRG#bonusCode:%')
         OR (info_provider = 'SOFTSWISS' AND context_identifier = '' AND type = 'CREDIT_BY_WINNING_CASINO_BET' AND info_extra_info LIKE 'BONUS_NGX_TRG#issueId:%')
         OR (info_provider = 'AVIATOR'   AND info_extra_info  = 'BONUS_NGX_TRG#reason:FREEBET_WIN')
      ), 2)                                                                           AS valor_ganho
    FROM majorsports.transactions
    WHERE info_provider IN ('PRAGMATIC', 'SOFTSWISS', 'AVIATOR')
      AND info_is_test  = false
      AND (date - INTERVAL 3 HOUR) BETWEEN {start_date:String} AND {end_date:String}
      AND (
            context_identifier != ''
         OR info_extra_info LIKE 'BONUS_NGX_TRG#%'
      )
    GROUP BY info_provider
    ORDER BY info_provider`;

  const rows = await chQuery(sql, { start_date, end_date });
  res.json(rows);
}));

/**
 * GET /api/promotions/pragmatic?start_date=...&end_date=...
 * Resumo por promoção PRAGMATIC.
 */
router.get('/pragmatic', asyncHandler(async (req, res) => {
  const parsed = parseRange(req);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { start_date, end_date } = parsed.data;

  const sql = `
    WITH
    period_tx AS (
        SELECT
            t.id, t.to_id, t.type, t.value, t.context_identifier, t.info_game_id, t.info_game_name,
            if(t.context_identifier != '', '', substring(t.info_extra_info, 25)) AS bonus_code
        FROM majorsports.transactions t
        WHERE t.info_provider = 'PRAGMATIC'
          AND t.info_is_test  = false
          AND (t.date - INTERVAL 3 HOUR) BETWEEN {start_date:String} AND {end_date:String}
          AND (t.context_identifier != '' OR t.info_extra_info LIKE 'BONUS_NGX_TRG#bonusCode:%')
    ),
    bonus_map AS (
        SELECT info_bet_id AS bonus_code, any(context_identifier) AS promotion_id
        FROM majorsports.transactions
        WHERE info_provider = 'PRAGMATIC' AND info_is_test = false
          AND context_identifier != '' AND info_bet_id != ''
        GROUP BY info_bet_id
    )
    SELECT
        p._id  AS promotion_id,
        p.name AS promocao,
        ifNull(p.friendly_name, '')      AS friendly_name,
        ifNull(p.image, '')              AS image,
        ifNull(p.description, '')        AS description,
        anyIf(pt.info_game_id, pt.info_game_id != '')   AS game_id,
        anyIf(pt.info_game_name, pt.info_game_name != '') AS game_name,
        p.config_rounds                  AS giros_da_promocao,
        toString(p.config_value)         AS valor_por_rodada,
        ifNull(p.config_valid_for_days, 0)    AS config_valid_for_days,
        ifNull(p.config_valid_for_minutes, 0) AS config_valid_for_minutes,
        toString(p.created_at - INTERVAL 3 HOUR)  AS criada_em,
        toString(p.start_date  - INTERVAL 3 HOUR) AS inicio,
        toString(p.end_date    - INTERVAL 3 HOUR) AS fim,
        countIf(pt.context_identifier != '')                                                              AS resgates,
        count(DISTINCT IF(pt.context_identifier != '', pt.to_id, NULL))                                   AS usuarios_que_resgataram,
        p.config_rounds * countIf(pt.context_identifier != '')                                            AS giros_esperados,
        countIf(pt.context_identifier  = '' AND pt.type = 'DEBIT_BY_CASINO_BET')                          AS giros,
        countIf(pt.context_identifier  = '' AND pt.type = 'CREDIT_BY_WINNING_CASINO_BET')                 AS ganhos,
        count(DISTINCT IF(pt.context_identifier  = '', pt.to_id, NULL))                                   AS usuarios_que_jogaram,
        round(sumIf(pt.value, pt.context_identifier = '' AND pt.type = 'CREDIT_BY_WINNING_CASINO_BET'), 2) AS valor_ganho,
        if(p.config_rounds * countIf(pt.context_identifier != '') = 0, 0,
           round(countIf(pt.context_identifier = '' AND pt.type = 'DEBIT_BY_CASINO_BET')
               / (p.config_rounds * countIf(pt.context_identifier != '')) * 100, 1))                      AS taxa_de_resgate
    FROM period_tx pt
    LEFT  JOIN bonus_map bm ON bm.bonus_code = pt.bonus_code
    INNER JOIN majorsports.promotions p
           ON p._id = if(pt.context_identifier != '', pt.context_identifier, bm.promotion_id)
    GROUP BY p._id, p.name, p.friendly_name, p.image, p.description, p.config_rounds, p.config_value, p.config_valid_for_days, p.config_valid_for_minutes, p.created_at, p.start_date, p.end_date
    ORDER BY resgates DESC
    LIMIT 200`;

  const rows = await chQuery(sql, { start_date, end_date });
  res.json(rows);
}));

/**
 * GET /api/promotions/softswiss?start_date=...&end_date=...
 */
router.get('/softswiss', asyncHandler(async (req, res) => {
  const parsed = parseRange(req);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { start_date, end_date } = parsed.data;

  const sql = `
    SELECT
        p._id   AS promotion_id,
        p.name  AS promocao,
        ifNull(p.friendly_name, '')      AS friendly_name,
        ifNull(p.image, '')              AS image,
        ifNull(p.description, '')        AS description,
        anyIf(t.info_game_id, t.info_game_id != '')   AS game_id,
        anyIf(t.info_game_name, t.info_game_name != '') AS game_name,
        p.config_rounds                  AS giros_da_promocao,
        toString(p.config_value)         AS valor_por_rodada,
        ifNull(p.config_valid_for_days, 0)    AS config_valid_for_days,
        ifNull(p.config_valid_for_minutes, 0) AS config_valid_for_minutes,
        toString(p.created_at - INTERVAL 3 HOUR)  AS criada_em,
        toString(p.start_date  - INTERVAL 3 HOUR) AS inicio,
        toString(p.end_date    - INTERVAL 3 HOUR) AS fim,
        countIf(t.context_identifier != '')                                                                AS resgates,
        count(DISTINCT IF(t.context_identifier != '', t.to_id, NULL))                                      AS usuarios_que_resgataram,
        p.config_rounds * countIf(t.context_identifier != '')                                              AS giros_esperados,
        countIf(t.context_identifier  = '' AND t.type = 'CREDIT_BY_WINNING_CASINO_BET')                    AS sessoes_concluidas,
        count(DISTINCT IF(t.context_identifier  = '', t.to_id, NULL))                                      AS usuarios_que_concluiram,
        countIf(t.context_identifier != '')
          - countIf(t.context_identifier = '' AND t.type = 'CREDIT_BY_WINNING_CASINO_BET')                 AS sessoes_abandonadas,
        round(sumIf(t.value, t.context_identifier = '' AND t.type = 'CREDIT_BY_WINNING_CASINO_BET'), 2)    AS valor_ganho_total,
        if(countIf(t.context_identifier != '') = 0, 0,
           round(countIf(t.context_identifier = '' AND t.type = 'CREDIT_BY_WINNING_CASINO_BET')
               / countIf(t.context_identifier != '') * 100, 1))                                            AS taxa_de_resgate
    FROM majorsports.transactions t
    INNER JOIN (
        SELECT info_bet_id AS session_id, context_identifier AS promotion_id
        FROM majorsports.transactions
        WHERE info_provider = 'SOFTSWISS'
          AND info_is_test  = false
          AND context_identifier != ''
          AND info_bet_id        != ''
          AND (date - INTERVAL 3 HOUR) BETWEEN {start_date:String} AND {end_date:String}
    ) sm ON sm.session_id = t.info_bet_id
    INNER JOIN majorsports.promotions p ON p._id = sm.promotion_id
    WHERE t.info_provider = 'SOFTSWISS'
      AND t.info_is_test  = false
      AND (t.date - INTERVAL 3 HOUR) BETWEEN {start_date:String} AND {end_date:String}
      AND (t.context_identifier != '' OR t.info_extra_info LIKE 'BONUS_NGX_TRG#issueId:%')
    GROUP BY p._id, p.name, p.friendly_name, p.image, p.description, p.config_rounds, p.config_value, p.config_valid_for_days, p.config_valid_for_minutes, p.created_at, p.start_date, p.end_date
    ORDER BY resgates DESC
    LIMIT 200`;

  const rows = await chQuery(sql, { start_date, end_date });
  res.json(rows);
}));

/**
 * GET /api/promotions/aviator?start_date=...&end_date=...
 * Com correlação temporal via ASOF JOIN.
 */
router.get('/aviator', asyncHandler(async (req, res) => {
  const parsed = parseRange(req);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { start_date, end_date } = parsed.data;

  const sql = `
    SELECT
        p._id   AS promotion_id,
        p.name  AS promocao,
        ifNull(p.friendly_name, '')      AS friendly_name,
        ifNull(p.image, '')              AS image,
        ifNull(p.description, '')        AS description,
        anyIf(tagged.info_game_id, tagged.info_game_id != '')   AS game_id,
        anyIf(tagged.info_game_name, tagged.info_game_name != '') AS game_name,
        p.config_rounds                  AS giros_da_promocao,
        toString(p.config_value)         AS valor_por_rodada,
        ifNull(p.config_valid_for_days, 0)    AS config_valid_for_days,
        ifNull(p.config_valid_for_minutes, 0) AS config_valid_for_minutes,
        toString(p.created_at - INTERVAL 3 HOUR)  AS criada_em,
        toString(p.start_date  - INTERVAL 3 HOUR) AS inicio,
        toString(p.end_date    - INTERVAL 3 HOUR) AS fim,
        countIf(tagged.is_resgate)                                  AS resgates,
        count(DISTINCT IF(tagged.is_resgate, tagged.to_id, NULL))   AS usuarios_que_resgataram,
        p.config_rounds * countIf(tagged.is_resgate)                AS giros_esperados,
        countIf(tagged.is_giro)                                     AS giros,
        countIf(tagged.is_ganho)                                    AS ganhos,
        countIf(tagged.is_perda)                                    AS perdas,
        round(sumIf(tagged.value, tagged.is_ganho), 2)              AS valor_ganho,
        if(countIf(tagged.is_giro) = 0, 0,
           round(countIf(tagged.is_ganho) / countIf(tagged.is_giro) * 100, 1))    AS pct_giros_ganhos,
        if(p.config_rounds * countIf(tagged.is_resgate) = 0, 0,
           round(countIf(tagged.is_giro)
               / (p.config_rounds * countIf(tagged.is_resgate)) * 100, 1))         AS taxa_de_resgate
    FROM (
        SELECT
            t.to_id, t.date, t.value, t.info_game_id, t.info_game_name,
            (t.context_identifier != '' AND t.type = 'DEBIT_BY_CASINO_BET')   AS is_resgate,
            (t.info_extra_info LIKE 'BONUS_NGX_TRG#reason:FREEBET_%')         AS is_giro,
            (t.info_extra_info  = 'BONUS_NGX_TRG#reason:FREEBET_WIN')         AS is_ganho,
            (t.info_extra_info  = 'BONUS_NGX_TRG#reason:FREEBET_LOST')        AS is_perda,
            if(t.context_identifier != '', t.context_identifier, rm.promotion_id) AS effective_promotion_id
        FROM majorsports.transactions t
        ASOF LEFT JOIN (
            SELECT to_id, date AS resgate_date, context_identifier AS promotion_id
            FROM majorsports.transactions
            WHERE info_provider = 'AVIATOR'
              AND info_is_test  = false
              AND context_identifier != ''
              AND (date - INTERVAL 3 HOUR) BETWEEN {start_date:String} AND {end_date:String}
        ) rm ON t.to_id = rm.to_id AND t.date >= rm.resgate_date
        WHERE t.info_provider = 'AVIATOR'
          AND t.info_is_test  = false
          AND (t.date - INTERVAL 3 HOUR) BETWEEN {start_date:String} AND {end_date:String}
          AND (t.context_identifier != '' OR t.info_extra_info LIKE 'BONUS_NGX_TRG#reason:FREEBET_%')
    ) tagged
    INNER JOIN majorsports.promotions p ON p._id = tagged.effective_promotion_id
    GROUP BY p._id, p.name, p.friendly_name, p.image, p.description, p.config_rounds, p.config_value, p.config_valid_for_days, p.config_valid_for_minutes, p.created_at, p.start_date, p.end_date
    ORDER BY resgates DESC
    LIMIT 200`;

  const rows = await chQuery(sql, { start_date, end_date });
  res.json(rows);
}));

export default router;
