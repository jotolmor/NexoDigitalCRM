import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;
const BLOCK_MS = 15 * 60_000;
const PRUNE_ABOVE = 1000;

type Entry = { failures: number[]; blockedUntil: number };

/**
 * Failed sign-ins per email, kept in this process's memory (one API instance).
 * Counted per email, not per IP: behind the VPS proxy every client may share one address.
 */
@Injectable()
export class LoginAttempts {
  private entries = new Map<string, Entry>();

  assertAllowed(email: string, now = Date.now()) {
    const entry = this.entries.get(normalize(email));
    if (entry && entry.blockedUntil > now) {
      throw new HttpException('Demasiados intentos. Vuelve a intentarlo en unos minutos.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  recordFailure(email: string, now = Date.now()) {
    if (this.entries.size > PRUNE_ABOVE) this.prune(now);
    const key = normalize(email);
    const entry = this.entries.get(key) ?? { failures: [], blockedUntil: 0 };
    entry.failures = entry.failures.filter(time => time > now - WINDOW_MS);
    entry.failures.push(now);
    if (entry.failures.length >= MAX_FAILURES) {
      entry.blockedUntil = now + BLOCK_MS;
      entry.failures = [];
    }
    this.entries.set(key, entry);
  }

  reset(email: string) {
    this.entries.delete(normalize(email));
  }

  private prune(now: number) {
    for (const [key, entry] of this.entries) {
      if (entry.blockedUntil <= now && entry.failures.every(time => time <= now - WINDOW_MS)) this.entries.delete(key);
    }
  }
}

function normalize(email: string) {
  return email.trim().toLowerCase();
}
