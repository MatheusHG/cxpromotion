import bcrypt from 'bcryptjs';
import { pool } from './db/postgres.js';

async function main() {
  const email = 'admin@jbd';
  const password = 'admin123';
  const hash = await bcrypt.hash(password, 10);

  const { rows } = await pool.query('SELECT id FROM cx_users WHERE email = $1', [email]);
  if (rows.length > 0) {
    console.log(`Usuário ${email} já existe (id=${rows[0].id}).`);
    await pool.end();
    return;
  }

  await pool.query(
    `INSERT INTO cx_users (email, name, password, role) VALUES ($1, $2, $3, 'admin')`,
    [email, 'Admin', hash],
  );

  console.log(`Admin criado: ${email} / ${password} — TROQUE A SENHA APÓS O PRIMEIRO LOGIN`);
  await pool.end();
}

main().catch((err) => {
  console.error('Falha ao seedar:', err);
  process.exit(1);
});
