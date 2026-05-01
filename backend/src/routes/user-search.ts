import { Router } from 'express';
import { z } from 'zod';
import { chQuery } from '../db/clickhouse.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();
router.use(authMiddleware);

const schema = z.object({
  user_id: z.string().min(1),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  is_test: z.enum(['true', 'false']).optional().default('false'),
  promotion_ids: z.union([z.string(), z.array(z.string())]).optional(),
});

/**
 * GET /api/user-search?user_id=...&start_date=...&end_date=...
 * Histórico unificado das 3 plataformas para um usuário.
 */
router.get('/', asyncHandler(async (req, res) => {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { user_id, start_date, end_date } = parsed.data;
  const isTestSql = parsed.data.is_test === 'true' ? 'true' : 'false';

  // promotion_ids: aceita string única, array, ou ausente. Sanitiza pra alfanumérico.
  const rawIds = parsed.data.promotion_ids;
  const promotionIds = (Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [])
    .filter((id) => /^[a-z0-9]+$/i.test(id));
  const promoFilterSql = promotionIds.length
    ? `AND p._id IN (${promotionIds.map((id) => `'${id}'`).join(',')})`
    : '';

  const sql = `
    SELECT
        p._id  AS promotion_id,
        p.name AS promocao,
        ifNull(p.friendly_name, '')                                     AS friendly_name,
        ifNull(p.image, '')                                             AS image,
        ifNull(p.description, '')                                       AS description,
        anyIf(t.info_game_id, t.info_game_id != '')                     AS game_id,
        anyIf(t.info_game_name, t.info_game_name != '')                 AS game_name,
        t.provider                                                      AS provider,
        p.config_rounds                                                 AS giros_da_promocao,
        toString(p.config_value)                                        AS valor_por_rodada,
        ifNull(p.config_valid_for_days, 0)                              AS config_valid_for_days,
        ifNull(p.config_valid_for_minutes, 0)                           AS config_valid_for_minutes,
        toString(p.created_at - INTERVAL 3 HOUR)                        AS criada_em,
        toString(p.start_date  - INTERVAL 3 HOUR)                       AS inicio,
        toString(p.end_date    - INTERVAL 3 HOUR)                       AS fim,
        count(DISTINCT IF(t.is_resgate, t.resgate_bonus_code, NULL))    AS resgates,
        toString(minIf(t.date - INTERVAL 3 HOUR, t.is_resgate))         AS primeiro_resgate,
        toString(maxIf(t.date - INTERVAL 3 HOUR, t.is_resgate))         AS ultimo_resgate,
        p.config_rounds * count(DISTINCT IF(t.is_resgate, t.resgate_bonus_code, NULL)) AS giros_esperados,
        countIf(t.is_giro)                                              AS giros,
        countIf(t.is_ganho)                                             AS ganhos,
        countIf(t.is_perda)                                             AS perdas,
        round(sumIf(t.value, t.is_ganho), 2)                            AS valor_ganho,
        if(t.provider = 'SOFTSWISS',
            if(count(DISTINCT IF(t.is_resgate, t.resgate_bonus_code, NULL)) = 0, 0,
               round(countIf(t.is_ganho) / count(DISTINCT IF(t.is_resgate, t.resgate_bonus_code, NULL)) * 100, 1)),
            if(p.config_rounds * count(DISTINCT IF(t.is_resgate, t.resgate_bonus_code, NULL)) = 0, 0,
               round(countIf(t.is_giro) / (p.config_rounds * count(DISTINCT IF(t.is_resgate, t.resgate_bonus_code, NULL))) * 100, 1))
        )                                                               AS taxa_de_resgate
    FROM (
        SELECT 'PRAGMATIC' AS provider, t.to_id, t.date, t.value, t.info_game_id, t.info_game_name,
            (t.context_identifier != '')                                                          AS is_resgate,
            (t.context_identifier  = '' AND t.type = 'DEBIT_BY_CASINO_BET')                       AS is_giro,
            (t.context_identifier  = '' AND t.type = 'CREDIT_BY_WINNING_CASINO_BET')              AS is_ganho,
            false                                                                                 AS is_perda,
            if(t.context_identifier != '', t.context_identifier, bm.promotion_id)                 AS effective_promotion_id,
            bm.bonus_code                                                                         AS resgate_bonus_code
        FROM majorsports.transactions t
        INNER JOIN (
            SELECT info_bet_id AS bonus_code, any(context_identifier) AS promotion_id
            FROM majorsports.transactions
            WHERE to_id = {user_id:String} AND info_provider = 'PRAGMATIC' AND info_is_test = ${isTestSql}
              AND context_identifier != '' AND info_bet_id != ''
              AND (date - INTERVAL 3 HOUR) BETWEEN {start_date:String} AND {end_date:String}
            GROUP BY info_bet_id
        ) bm ON bm.bonus_code = if(t.context_identifier != '', t.info_bet_id, substring(t.info_extra_info, 25))
        WHERE t.info_provider = 'PRAGMATIC' AND t.info_is_test = ${isTestSql}
          AND t.to_id = {user_id:String}
          AND (t.date - INTERVAL 3 HOUR) BETWEEN {start_date:String} AND {end_date:String}
          AND (t.context_identifier != '' OR t.info_extra_info LIKE 'BONUS_NGX_TRG#bonusCode:%')

        UNION ALL

        SELECT 'SOFTSWISS' AS provider, t.to_id, t.date, t.value, t.info_game_id, t.info_game_name,
            (t.context_identifier != '')                                                AS is_resgate,
            false                                                                       AS is_giro,
            (t.context_identifier  = '' AND t.type = 'CREDIT_BY_WINNING_CASINO_BET')    AS is_ganho,
            false                                                                       AS is_perda,
            sm.promotion_id                                                             AS effective_promotion_id,
            sm.session_id                                                               AS resgate_bonus_code
        FROM majorsports.transactions t
        INNER JOIN (
            SELECT info_bet_id AS session_id, any(context_identifier) AS promotion_id
            FROM majorsports.transactions
            WHERE to_id = {user_id:String} AND info_provider = 'SOFTSWISS' AND info_is_test = ${isTestSql}
              AND context_identifier != '' AND info_bet_id != ''
              AND (date - INTERVAL 3 HOUR) BETWEEN {start_date:String} AND {end_date:String}
            GROUP BY info_bet_id
        ) sm ON sm.session_id = t.info_bet_id
        WHERE t.info_provider = 'SOFTSWISS' AND t.info_is_test = ${isTestSql}
          AND t.to_id = {user_id:String}
          AND (t.date - INTERVAL 3 HOUR) BETWEEN {start_date:String} AND {end_date:String}
          AND (t.context_identifier != '' OR t.info_extra_info LIKE 'BONUS_NGX_TRG#issueId:%')

        UNION ALL

        SELECT 'AVIATOR' AS provider, t.to_id, t.date, t.value, t.info_game_id, t.info_game_name,
            (t.context_identifier != '' AND t.type = 'DEBIT_BY_CASINO_BET')             AS is_resgate,
            (t.info_extra_info LIKE 'BONUS_NGX_TRG#reason:FREEBET_%')                   AS is_giro,
            (t.info_extra_info  = 'BONUS_NGX_TRG#reason:FREEBET_WIN')                   AS is_ganho,
            (t.info_extra_info  = 'BONUS_NGX_TRG#reason:FREEBET_LOST')                  AS is_perda,
            if(t.context_identifier != '', t.context_identifier, rm.promotion_id)       AS effective_promotion_id,
            if(t.context_identifier != '', t.info_bet_id, rm.resgate_info_bet_id)       AS resgate_bonus_code
        FROM majorsports.transactions t
        ASOF LEFT JOIN (
            SELECT to_id, min(date) AS resgate_date, any(context_identifier) AS promotion_id, info_bet_id AS resgate_info_bet_id
            FROM majorsports.transactions
            WHERE to_id = {user_id:String} AND info_provider = 'AVIATOR' AND info_is_test = ${isTestSql}
              AND context_identifier != ''
              AND (date - INTERVAL 3 HOUR) BETWEEN {start_date:String} AND {end_date:String}
            GROUP BY to_id, info_bet_id
        ) rm ON t.to_id = rm.to_id AND t.date >= rm.resgate_date
        WHERE t.info_provider = 'AVIATOR' AND t.info_is_test = ${isTestSql}
          AND t.to_id = {user_id:String}
          AND (t.date - INTERVAL 3 HOUR) BETWEEN {start_date:String} AND {end_date:String}
          AND (t.context_identifier != '' OR t.info_extra_info LIKE 'BONUS_NGX_TRG#reason:FREEBET_%')
    ) t
    INNER JOIN majorsports.promotions p ON p._id = t.effective_promotion_id
    WHERE 1=1 ${promoFilterSql}
    GROUP BY p._id, p.name, p.friendly_name, p.image, p.description, t.provider, p.config_rounds, p.config_value, p.config_valid_for_days, p.config_valid_for_minutes, p.created_at, p.start_date, p.end_date
    ORDER BY ultimo_resgate DESC`;

  const rows = await chQuery(sql, { user_id, start_date, end_date });
  res.json(rows);
}));

const roundsSchema = z.object({
  user_id: z.string().min(1),
  promotion_id: z.string().min(1),
  provider: z.enum(['PRAGMATIC', 'SOFTSWISS', 'AVIATOR']),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  is_test: z.enum(['true', 'false']).optional().default('false'),
});

/**
 * GET /api/user-search/rounds — detalhes de cada rodada do usuário em uma promoção.
 *   PRAGMATIC: 1 linha por round_id (info_bet_id) com valor ganho agregado dos CREDITs
 *   AVIATOR:   1 linha por giro CREDIT, resultado em info_extra_info
 *   SOFTSWISS: vazio (giros não são logados; só resgate e ganho agregado existem)
 */
router.get('/rounds', asyncHandler(async (req, res) => {
  const parsed = roundsSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { user_id, promotion_id, provider, start_date, end_date } = parsed.data;
  const isTestSql = parsed.data.is_test === 'true' ? 'true' : 'false';

  // Lista master de resgates (todos os resgates do user × promoção, deduplicados)
  const resgatesSql = `
    SELECT
        info_bet_id                              AS bonus_code,
        toString(min(date) - INTERVAL 3 HOUR)    AS resgate_data
    FROM majorsports.transactions
    WHERE to_id = {user_id:String}
      AND info_provider = {provider:String}
      AND info_is_test  = ${isTestSql}
      AND context_identifier = {promotion_id:String}
      AND info_bet_id != ''
      AND (date - INTERVAL 3 HOUR) BETWEEN {start_date:String} AND {end_date:String}
    GROUP BY info_bet_id
    ORDER BY min(date) ASC
    LIMIT 500`;
  const resgates = await chQuery<{ bonus_code: string; resgate_data: string }>(resgatesSql, {
    user_id, promotion_id, provider, start_date, end_date,
  });

  if (provider === 'SOFTSWISS') {
    return res.json({
      rounds: [],
      resgates,
      note:
        'SOFTSWISS não loga giros individualmente — apenas o resgate e o ganho agregado da sessão existem em transactions. ' +
        'O ganho só aparece quando o usuário finaliza TODAS as rodadas disponíveis na sessão. ' +
        'Se ele resgatou mas ainda está jogando (sessão em andamento) ou abandonou no meio, esses giros parciais NÃO vão aparecer aqui — só veremos o resgate sem ganho. ' +
        'Por isso, "sem ganho" pode significar duas coisas: (1) ainda jogando / abandonou, ou (2) terminou tudo perdendo zero. O sistema do provedor não diferencia esses dois casos.',
    });
  }

  let sql: string;
  if (provider === 'PRAGMATIC') {
    sql = `
      WITH user_resgates AS (
          SELECT
              info_bet_id  AS bonus_code,
              min(date)    AS resgate_date
          FROM majorsports.transactions
          WHERE to_id = {user_id:String}
            AND info_provider = 'PRAGMATIC'
            AND info_is_test = ${isTestSql}
            AND context_identifier = {promotion_id:String}
            AND info_bet_id != ''
            AND (date - INTERVAL 3 HOUR) BETWEEN {start_date:String} AND {end_date:String}
          GROUP BY info_bet_id
      )
      SELECT
          toString(min(t.date - INTERVAL 3 HOUR))                                                AS data,
          t.info_bet_id                                                                          AS round_id,
          anyIf(t.info_game_id, t.info_game_id != '')                                            AS game_id,
          anyIf(t.info_game_name, t.info_game_name != '')                                        AS game_name,
          round(sumIf(t.value, t.type = 'CREDIT_BY_WINNING_CASINO_BET'), 2)                      AS valor_ganho,
          countIf(t.type = 'CREDIT_BY_WINNING_CASINO_BET') > 0                                   AS ganhou,
          any(r.bonus_code)                                                                      AS bonus_code,
          toString(any(r.resgate_date) - INTERVAL 3 HOUR)                                        AS resgate_data
      FROM majorsports.transactions t
      INNER JOIN user_resgates r ON r.bonus_code = substring(t.info_extra_info, 25)
      WHERE t.to_id = {user_id:String}
        AND t.info_provider = 'PRAGMATIC'
        AND t.info_is_test  = ${isTestSql}
        AND t.context_identifier = ''
        AND t.info_extra_info LIKE 'BONUS_NGX_TRG#bonusCode:%'
        AND (t.date - INTERVAL 3 HOUR) BETWEEN {start_date:String} AND {end_date:String}
      GROUP BY t.info_bet_id
      ORDER BY resgate_data ASC, data ASC
      LIMIT 1000`;
  } else {
    // AVIATOR: cada giro é 1 linha CREDIT; ASOF JOIN p/ atribuir à promoção mais recente
    sql = `
      SELECT
          toString(t.date - INTERVAL 3 HOUR)                                     AS data,
          t.info_bet_id                                                          AS round_id,
          t.info_game_id                                                         AS game_id,
          t.info_game_name                                                       AS game_name,
          if(t.info_extra_info = 'BONUS_NGX_TRG#reason:FREEBET_WIN', t.value, 0) AS valor_ganho,
          t.info_extra_info = 'BONUS_NGX_TRG#reason:FREEBET_WIN'                 AS ganhou,
          rm.resgate_info_bet_id                                                 AS bonus_code,
          toString(rm.resgate_date - INTERVAL 3 HOUR)                            AS resgate_data
      FROM majorsports.transactions t
      ASOF LEFT JOIN (
          SELECT
              to_id,
              min(date)          AS resgate_date,
              any(context_identifier) AS promo_id,
              info_bet_id        AS resgate_info_bet_id
          FROM majorsports.transactions
          WHERE to_id = {user_id:String}
            AND info_provider = 'AVIATOR'
            AND info_is_test  = ${isTestSql}
            AND context_identifier != ''
            AND (date - INTERVAL 3 HOUR) BETWEEN {start_date:String} AND {end_date:String}
          GROUP BY to_id, info_bet_id
      ) rm ON t.to_id = rm.to_id AND t.date >= rm.resgate_date
      WHERE t.to_id = {user_id:String}
        AND t.info_provider = 'AVIATOR'
        AND t.info_is_test  = ${isTestSql}
        AND t.info_extra_info LIKE 'BONUS_NGX_TRG#reason:FREEBET_%'
        AND rm.promo_id = {promotion_id:String}
        AND (t.date - INTERVAL 3 HOUR) BETWEEN {start_date:String} AND {end_date:String}
      ORDER BY rm.resgate_date ASC, t.date ASC
      LIMIT 1000`;
  }

  const rounds = await chQuery(sql, { user_id, promotion_id, start_date, end_date });
  res.json({ rounds, resgates });
}));

export default router;
