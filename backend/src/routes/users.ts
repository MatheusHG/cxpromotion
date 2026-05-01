import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/postgres.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, email, name, role, active, created_at FROM cx_users ORDER BY created_at DESC',
  );
  res.json(rows);
}));

const createSchema = z.object({
  email: z.string().min(1),
  name: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(['admin', 'operador']),
});

router.post('/', asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, name, password, role } = parsed.data;

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO cx_users (email, name, password, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, active, created_at`,
      [email, name, hash, role],
    );
    res.status(201).json(rows[0]);
  } catch (err: unknown) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }
    throw err;
  }
}));

const updateSchema = z.object({
  email: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['admin', 'operador']).optional(),
  active: z.boolean().optional(),
});

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (k === 'password') {
      updates.push(`password = $${i++}`);
      values.push(await bcrypt.hash(v as string, 10));
    } else {
      updates.push(`${k} = $${i++}`);
      values.push(v);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
  updates.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE cx_users SET ${updates.join(', ')} WHERE id = $${i}
     RETURNING id, email, name, role, active, created_at`,
    values,
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json(rows[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
  if (id === req.user!.id) return res.status(400).json({ error: 'Não é possível deletar a si mesmo' });

  const { rowCount } = await pool.query('DELETE FROM cx_users WHERE id = $1', [id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.status(204).send();
}));

export default router;
