import { z } from 'zod';

/**
 * Environment contract.
 *
 * Anything the app needs at runtime is declared here and validated once at
 * boot, so a missing secret fails loudly on deploy instead of silently
 * degrading security later. Nothing in this file is bundled to the browser
 * except the NEXT_PUBLIC_* values.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional(),

  // 32+ chars. Generate with: openssl rand -base64 48
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),

  APP_URL: z.string().url().default('http://localhost:3000'),

  SESSION_MAX_AGE_DAYS: z.coerce.number().int().positive().default(7),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().positive().default(30),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_ROOT_FOLDER: z.string().default('the-hungry-bowl'),

  // 'poll' works on every host including Vercel serverless.
  // 'sse' keeps a stream open — use it on a VPS / long-running Node server.
  REALTIME_DRIVER: z.enum(['poll', 'sse']).default('poll'),
  REALTIME_POLL_MS: z.coerce.number().int().min(1000).default(5000),

  RATE_LIMIT_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),

  SEED_OWNER_EMAIL: z.string().email().optional(),
  SEED_OWNER_PASSWORD: z.string().optional(),
  SEED_OWNER_NAME: z.string().optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),
});

function parseServerEnv() {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

/** Server-only environment. Importing this from a client component will fail the build. */
export const env = (() => {
  // During `next build` some pages are statically analysed without a DB; keep
  // the error message helpful rather than a stack trace from deep inside Prisma.
  if (process.env.SKIP_ENV_VALIDATION === 'true') {
    return process.env as unknown as z.infer<typeof serverSchema>;
  }
  return parseServerEnv();
})();

export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
});

export const isProduction = env.NODE_ENV === 'production';
export const isCloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);
