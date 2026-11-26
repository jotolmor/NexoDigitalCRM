export const MIN_JWT_SECRET_LENGTH = 32;

/** Session signing key; the API must not start without a long one. */
export function jwtSecret() {
  const secret = process.env.JWT_SECRET ?? '';
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET debe tener al menos ${MIN_JWT_SECRET_LENGTH} caracteres. Configúralo antes de arrancar la API.`);
  }
  return secret;
}
