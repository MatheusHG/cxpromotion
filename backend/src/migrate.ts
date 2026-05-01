import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './db/postgres.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = await readFile(join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Schema aplicado com sucesso.');
  await pool.end();
}

main().catch((err) => {
  console.error('Falha ao migrar:', err);
  process.exit(1);
});
