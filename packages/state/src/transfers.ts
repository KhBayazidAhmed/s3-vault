import type {
	TransferDirection,
	TransferItem,
	TransferJob,
	TransferStatus,
} from "@S3-vault-CLI/domain";
import type { Database } from "bun:sqlite";

export interface TransferHistoryFilter {
	profileName?: string;
	status?: TransferStatus;
	limit?: number;
	offset?: number;
}

export class TransferRepository {
	private db: Database;

	constructor(db: Database) {
		this.db = db;
	}

	createJob(job: TransferJob, items: TransferItem[] = []): void {
		this.db.transaction(() => {
			this.db.run(
				`INSERT INTO transfers (
          id, profile_name, direction, source_path, target_path,
          total_items, total_bytes, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					job.id,
					job.profileName,
					job.direction,
					job.sourcePath,
					job.targetPath,
					job.totalItems,
					job.totalBytes,
					job.status,
					job.createdAt.toISOString(),
					job.updatedAt.toISOString(),
				],
			);

			const insertTask = this.db.prepare(
				`INSERT INTO transfer_tasks (\n          id, job_id, source_path, target_path, relative_path,
          size, action, status, bytes_transferred, local_hash, remote_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			);

			for (const item of items) {
				insertTask.run(
					item.id,
					job.id,
					item.sourcePath,
					item.targetPath,
					item.relativePath,
					item.size,
					item.action,
					item.status,
					item.bytesTransferred,
					item.localHash ?? null,
					item.remoteHash ?? null,
				);
			}
		})();
	}

	updateJobStatus(
		jobId: string,
		status: TransferStatus,
		errorMessage?: string,
	): void {
		const now = new Date().toISOString();
		const completedAt = ["completed", "failed", "cancelled"].includes(status)
			? now
			: null;

		this.db.run(
			`UPDATE transfers SET
        status = ?,
        error_message = ?,
        updated_at = ?,
        completed_at = COALESCE(?, completed_at)
      WHERE id = ?`,
			[status, errorMessage ?? null, now, completedAt, jobId],
		);
	}

	updateTaskStatus(
		taskId: string,
		status: TransferItem["status"],
		bytesTransferred?: number,
		error?: string,
	): void {
		this.db.run(
			`UPDATE transfer_tasks SET
        status = ?,
        bytes_transferred = COALESCE(?, bytes_transferred),
        error = ?
      WHERE id = ?`,
			[status, bytesTransferred ?? null, error ?? null, taskId],
		);
	}

	getJob(jobId: string): { job: TransferJob; tasks: TransferItem[] } | null {
		const row = this.db
			.query("SELECT * FROM transfers WHERE id = ?")
			.get(jobId) as Record<string, any> | null;
		if (!row) return null;

		const taskRows = this.db
			.query("SELECT * FROM transfer_tasks WHERE job_id = ?")
			.all(jobId) as Record<string, any>[];

		const job: TransferJob = {
			id: row.id,
			profileName: row.profile_name,
			direction: row.direction as TransferDirection,
			sourcePath: row.source_path,
			targetPath: row.target_path,
			totalItems: row.total_items,
			totalBytes: row.total_bytes,
			status: row.status as TransferStatus,
			createdAt: new Date(row.created_at),
			updatedAt: new Date(row.updated_at),
			completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
			errorMessage: row.error_message || undefined,
		};

		const tasks: TransferItem[] = taskRows.map((t) => ({
			id: t.id,
			sourcePath: t.source_path,
			targetPath: t.target_path,
			relativePath: t.relative_path,
			size: t.size,
			action: t.action,
			status: t.status,
			bytesTransferred: t.bytes_transferred,
			localHash: t.local_hash || undefined,
			remoteHash: t.remote_hash || undefined,
			error: t.error || undefined,
		}));

		return { job, tasks };
	}

	reconcileStaleJobs(staleThresholdMs = 2 * 60 * 1000): number {
		const threshold = new Date(Date.now() - staleThresholdMs).toISOString();
		const now = new Date().toISOString();
		const res = this.db.run(
			`UPDATE transfers
       SET status = 'cancelled',
           error_message = 'Interrupted',
           updated_at = ?,
           completed_at = COALESCE(completed_at, ?)
       WHERE status = 'in_progress' AND updated_at < ?`,
			[now, now, threshold],
		);
		return res.changes;
	}

	listHistory(filter: TransferHistoryFilter = {}): TransferJob[] {
		this.reconcileStaleJobs();
		let sql = "SELECT * FROM transfers WHERE 1=1";
		const params: (string | number)[] = [];

		if (filter.profileName) {
			sql += " AND profile_name = ?";
			params.push(filter.profileName);
		}

		if (filter.status) {
			sql += " AND status = ?";
			params.push(filter.status);
		}

		sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
		params.push(filter.limit ?? 50);
		params.push(filter.offset ?? 0);

		const rows = this.db.query(sql).all(...params) as Record<string, any>[];

		return rows.map((row) => ({
			id: row.id,
			profileName: row.profile_name,
			direction: row.direction as TransferDirection,
			sourcePath: row.source_path,
			targetPath: row.target_path,
			totalItems: row.total_items,
			totalBytes: row.total_bytes,
			status: row.status as TransferStatus,
			createdAt: new Date(row.created_at),
			updatedAt: new Date(row.updated_at),
			completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
			errorMessage: row.error_message || undefined,
		}));
	}
}
