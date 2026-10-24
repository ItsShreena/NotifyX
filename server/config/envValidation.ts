/**
 * Production Environment Configuration & Audit Validator.
 * Safely audits configuration at server boot, providing actionable warnings
 * without leaking sensitive credentials or blocking local development.
 */

export interface EnvValidationReport {
  isProduction: boolean;
  databaseConfigured: boolean;
  redisConfigured: boolean;
  jwtConfigured: boolean;
  aiConfigured: boolean;
  frontendUrlConfigured: boolean;
  warnings: string[];
  recommendations: string[];
}

export function validateEnvironment(): EnvValidationReport {
  const isProduction = process.env.NODE_ENV === 'production';
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // 1. JWT_SECRET
  const jwtSecret = process.env.JWT_SECRET;
  const isDefaultSecret = jwtSecret === 'notifyx-dev-secret-replace-in-production-2026';
  const jwtConfigured = Boolean(jwtSecret && !isDefaultSecret && jwtSecret.length >= 32);

  if (isProduction) {
    if (!jwtSecret || isDefaultSecret) {
      warnings.push(
        'CRITICAL: JWT_SECRET is unset or using the default development secret in production. Set a random 32+ character secret.'
      );
    } else if (jwtSecret.length < 32) {
      warnings.push(
        'WARNING: JWT_SECRET is shorter than 32 characters. A cryptographically random secret with at least 256 bits (32 chars) is recommended.'
      );
    }
  }

  // 2. DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;
  const databaseConfigured = Boolean(dbUrl && dbUrl.startsWith('postgres'));

  if (isProduction && !databaseConfigured) {
    warnings.push(
      'WARNING: DATABASE_URL is not configured for PostgreSQL. The server will run in-memory fallback mode; notifications and accounts will not persist across container restarts.'
    );
    recommendations.push(
      'Provision a managed PostgreSQL instance (e.g., Cloud SQL, Neon, Supabase) and configure DATABASE_URL.'
    );
  }

  // 3. REDIS_URL
  const redisUrl = process.env.REDIS_URL;
  const redisConfigured = Boolean(redisUrl);

  if (isProduction && !redisConfigured) {
    recommendations.push(
      'REDIS_URL is not configured. NotifyX is operating using the embedded in-memory queue. For multi-instance horizontal scaling, attach a Redis instance (e.g., Memorystore, Upstash, Redis Cloud).'
    );
  }

  // 4. GEMINI_API_KEY / AI_API_KEY
  const aiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  const aiConfigured = Boolean(aiKey);

  if (!aiConfigured) {
    recommendations.push(
      'GEMINI_API_KEY is not configured. Intelligent category inference and priority suggestions will use deterministic rule-based heuristics.'
    );
  }

  // 5. FRONTEND_URL
  const frontendUrl = process.env.FRONTEND_URL;
  const frontendUrlConfigured = Boolean(frontendUrl);

  if (isProduction && !frontendUrlConfigured) {
    recommendations.push(
      'FRONTEND_URL is not configured. If the frontend and backend are hosted on different domains, configure FRONTEND_URL to restrict CORS origins.'
    );
  }

  const report: EnvValidationReport = {
    isProduction,
    databaseConfigured,
    redisConfigured,
    jwtConfigured,
    aiConfigured,
    frontendUrlConfigured,
    warnings,
    recommendations,
  };

  // Structured boot audit log
  console.log('──────────────────────────────────────────────────────');
  console.log(`🛡️ [NotifyX Config Audit] Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`   Database:    ${databaseConfigured ? 'PostgreSQL Configured' : 'In-Memory Fallback'}`);
  console.log(`   Queue:       ${redisConfigured ? 'BullMQ (Redis)' : 'EmbeddedQueue (In-Memory)'}`);
  console.log(`   Auth/JWT:    ${jwtConfigured ? 'Custom Secret Configured' : (isProduction ? '⚠️ Dev Secret Used!' : 'Development Default')}`);
  console.log(`   AI Intel:    ${aiConfigured ? 'Gemini API Active' : 'Deterministic Heuristic Fallback'}`);
  console.log(`   CORS:        ${frontendUrlConfigured ? `Allowed Origin: ${frontendUrl}` : 'Same-Origin / Localhost Permissive'}`);

  if (warnings.length > 0) {
    for (const warn of warnings) {
      console.warn(`   ⚠️ ${warn}`);
    }
  }

  // If STRICT_CONFIG=true is set in production, fail startup safely with actionable messages (no secrets printed)
  if (process.env.STRICT_CONFIG === 'true') {
    const criticalErrors: string[] = [];
    if (!jwtConfigured) {
      criticalErrors.push('JWT_SECRET must be set to a cryptographically secure string (minimum 32 characters).');
    }
    if (isProduction && !databaseConfigured) {
      criticalErrors.push('DATABASE_URL must be configured with a valid postgresql:// connection string.');
    }
    if (criticalErrors.length > 0) {
      console.error('❌ [FATAL CONFIGURATION ERROR] Production startup aborted due to invalid secrets:');
      for (const err of criticalErrors) {
        console.error(`   - ${err}`);
      }
      process.exit(1);
    }
  }

  console.log('──────────────────────────────────────────────────────');

  return report;
}
