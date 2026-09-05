import type Database from "better-sqlite3";

export const OWNER_DENIED = "owner_not_authorized";
export class OwnerAccessDenied extends Error {
  constructor() {
    super(OWNER_DENIED);
  }
}

export function createOwnerIdentityTable(database: Database.Database) {
  database.exec(`CREATE TABLE IF NOT EXISTS owner_identity (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    google_subject TEXT NOT NULL UNIQUE,
    bound_at TEXT NOT NULL
  )`);
}

type GoogleIdentity = { subject: string; email: string; verified: boolean };

/** Email admits the first owner only; the durable subject is authoritative afterward. */
export function createOwnerPolicy(database: Database.Database, bootstrapEmail: string) {
  const normalizedBootstrapEmail = bootstrapEmail.trim().toLowerCase();

  function boundSubject(): string | undefined {
    const row = database.prepare(
      "SELECT google_subject FROM owner_identity WHERE singleton = 1",
    ).get() as { google_subject: string } | undefined;
    return row?.google_subject;
  }

  function acceptsGoogleIdentity(identity: GoogleIdentity) {
    if (!identity.subject || !identity.verified) return false;
    const bound = boundSubject();
    if (bound) return bound === identity.subject;
    return Boolean(normalizedBootstrapEmail) &&
      identity.email.trim().toLowerCase() === normalizedBootstrapEmail;
  }

  function identityForUser(userId: string): GoogleIdentity | undefined {
    const rows = database.prepare(`
      SELECT a.accountId AS subject, u.email, u.emailVerified AS verified
      FROM account a JOIN user u ON u.id = a.userId
      WHERE a.userId = ? AND a.providerId = 'google'
        AND a.issuer = 'https://accounts.google.com'
    `).all(userId) as Array<{ subject: string; email: string; verified: number }>;
    if (rows.length !== 1) return undefined;
    return { ...rows[0], verified: rows[0].verified === 1 };
  }

  /** Atomically bind the first owner or verify the existing binding before issuing a session. */
  function bindOwnerForSession(userId: string) {
    return database.transaction(() => {
      const identity = identityForUser(userId);
      if (!identity || !acceptsGoogleIdentity(identity)) throw new OwnerAccessDenied();
      database.prepare(`
        INSERT OR IGNORE INTO owner_identity (singleton, google_subject, bound_at)
        VALUES (1, ?, ?)
      `).run(identity.subject, new Date().toISOString());
      if (boundSubject() !== identity.subject) throw new OwnerAccessDenied();
    }).immediate();
  }

  function isOwnerUser(userId: string) {
    const identity = identityForUser(userId);
    return Boolean(identity?.verified && identity.subject === boundSubject());
  }
  return { acceptsGoogleIdentity, bindOwnerForSession, isOwnerUser };
}
