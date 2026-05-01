import { createClient } from '@clickhouse/client';
import { config } from '../config.js';

export const ch = createClient({
  url: config.clickhouse.url,
  username: config.clickhouse.username,
  password: config.clickhouse.password,
  request_timeout: 60_000,
});

export async function chQuery<T = unknown>(query: string, query_params?: Record<string, unknown>): Promise<T[]> {
  const result = await ch.query({ query, query_params, format: 'JSONEachRow' });
  return result.json<T>();
}
