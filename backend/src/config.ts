import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  pg: {
    host: process.env.PG_HOST ?? 'localhost',
    port: Number(process.env.PG_PORT ?? 5432),
    user: required('PG_USER'),
    password: required('PG_PASSWORD'),
    database: required('PG_DATABASE'),
    ssl: process.env.PG_SSL === 'true',
  },
  clickhouse: {
    url: required('CLICKHOUSE_URL'),
    username: process.env.CLICKHOUSE_USER ?? 'default',
    password: process.env.CLICKHOUSE_PASSWORD ?? '',
  },
  xtremepush: {
    region: process.env.XTREMEPUSH_REGION ?? 'us',
    apiToken: process.env.XTREMEPUSH_API_TOKEN ?? '',
  },
};
