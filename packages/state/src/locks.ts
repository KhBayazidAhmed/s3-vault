import type { Database } from "bun:sqlite";

export class LockManager {
	private db: Database;

	constructor(db: Database) {
		this.db = db;
	}

	acquireLock(
		resource: string,
		ttlMs = 60000,
	): { acquired: boolean; lockId?: string; error?: string } {
		const now = Date.now();
		const expiresAt = new Date(now + ttlMs).toISOString();
		const nowIso = new Date(now).toISOString();
		const lockId = `lock_${now}_${Math.random().toString(36).slice(2, 8)}`;
		const pid = process.pid;

		try {
			// 1. Clean expired locks
			this.db.run("DELETE FROM locks WHERE resource = ? AND expires_at < ?", [
				resource,
				nowIso,
			]);

			// 2. Try inserting new lock
			this.db.run(
				"INSERT INTO locks (lock_id, resource, acquired_at, expires_at, owner_pid) VALUES (?, ?, ?, ?, ?)",
				[lockId, resource, nowIso, expiresAt, pid],
			);

			return { acquired: true, lockId };
		} catch {
			const existing = this.db
				.query("SELECT * FROM locks WHERE resource = ?")
				.get(resource) as Record<string, any> | null;
			return {
				acquired: false,
				error: `Resource '${resource}' is currently locked by PID ${existing?.owner_pid} until ${existing?.expires_at}.`,
			};
		}
	}

	releaseLock(lockId: string): void {
		this.db.run("DELETE FROM locks WHERE lock_id = ?", [lockId]);
	}
}
