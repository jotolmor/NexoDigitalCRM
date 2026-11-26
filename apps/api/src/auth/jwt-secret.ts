export const MIN_JWT_SECRET_LENGTH = 32;
// Values published in this repository; anyone could sign sessions with them.
const PUBLIC_SECRETS = new Set(['replace-with-a-long-random-secret', 'development-only-secret-change-before-deployment']);

/** Session signing key; the API must not start without a long one. */
export function jwtSecret() {
  const secret = process.env.JWT_SECRET ?? '';
  if (secret.length < MIN_JWT_SECRET_LENGTH || PUBLIC_SECRETS.has(secret)) {
    throw new Error(`JWT_SECRET debe ser una clave propia de al menos ${MIN_JWT_SECRET_LENGTH} caracteres (por ejemplo: openssl rand -hex 32). Configúralo antes de arrancar la API.`);
  }
  return secret;
}
