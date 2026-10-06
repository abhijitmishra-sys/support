import { env } from 'cloudflare:workers';
export function runtimeEnv(): Record<string, string | undefined> {
 return env as unknown as Record<string, string | undefined>;
}
