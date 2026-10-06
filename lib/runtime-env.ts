// Server-only runtime environment for Next.js on Vercel or Node.js.
// Vite resolves this module to runtime-env.cloudflare.ts for the local/Sites build.
export function runtimeEnv(): Record<string, string | undefined> {
 return process.env;
}
