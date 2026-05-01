import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../db/postgres.js';
import { config } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

router.post('/login', asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Email e senha obrigatórios' });
  }
  const { email, password } = parsed.data;

  const { rows } = await pool.query(
    'SELECT id, email, name, password, role, active FROM cx_users WHERE email = $1',
    [email],
  );
  const user = rows[0];
  if (!user || !user.active) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn } as jwt.SignOptions,
  );

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}));

router.get('/me', authMiddleware, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, email, name, role FROM cx_users WHERE id = $1 AND active = TRUE',
    [req.user!.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json(rows[0]);
}));

export default router;
