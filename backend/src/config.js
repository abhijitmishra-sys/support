import { z } from 'zod';
export const config = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  ENABLE_PASSWORD_AUTH: z.string().default('false'),
  PORT: z.coerce.number().default(4100),
  DATABASE_URL: z.string().min(1),
  GATEWAY_SECRET: z.string().min(32), SOCKET_SECRET: z.string().min(32),
  SITE_ORIGIN: z.string().url(), SOCKET_PUBLIC_URL: z.string().url(),
  REDIS_URL: z.string().optional(), DEFAULT_WORKSPACE_ID: z.string().default('irma'),
  BOOTSTRAP_ADMIN_SUB: z.string().optional(), ALLOW_CUSTOMER_SIGNUP: z.string().default('false'),
  UPLOAD_DIRECTORY: z.string().default('./uploads'), SCANNER_URL: z.string().optional(),
  SMTP_HOST: z.string().optional(), SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(), SMTP_PASS: z.string().optional(), SMTP_FROM: z.string().optional(),
  INBOUND_SECRET: z.string().optional()
}).parse(process.env);
export const defaultSettings = {
  calendar: { zone:'Asia/Kolkata', days:[1,2,3,4,5], open:'09:00', close:'18:00', holidays:[] },
  categories:['Workflow','Integration','Campaigns','Analytics','Billing','Account','Other'],
  autoCloseHours:72, warningMinutes:5, agingMinutes:120,
  resolutionMinutes:null, pauseResolutionOnWaitingCustomer:true,
  firstResponseMinutes:{ ESSENTIAL:240,GROWTH:120,PRIORITY:30,ELITE:10 },
  configured:false
};
