import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import promotionsRoutes from './routes/promotions.js';
import userSearchRoutes from './routes/user-search.js';
import xtremepushRoutes from './routes/xtremepush.js';

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

const app = express();
app.use(cors({ origin: config.frontendOrigin, credentials: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/promotions', promotionsRoutes);
app.use('/api/user-search', userSearchRoutes);
app.use('/api/xtremepush', xtremepushRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[express:error]', err);
  const message = err instanceof Error ? err.message : 'Erro interno';
  res.status(500).json({ error: message });
});

app.listen(config.port, () => {
  console.log(`Backend ouvindo em http://localhost:${config.port}`);
});
