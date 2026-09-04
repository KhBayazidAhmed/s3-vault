import { IntegrityError, type TransferItem } from "@S3-vault-CLI/domain";
import type { MultipartRepository } from "@S3-vault-CLI/state";
import type {
	PutObjectResult,
	StorageBackend,
	UploadedPart,
} from "@S3-vault-CLI/storage";
import { promises as fsPromises, statSync } from "node:fs";
import type { StateWarning } from "./engine-files.js";
import type { ResolvedEngineOptions } from "./engine-options.js";
import { type RetryOptions, RetryUtils } from "./retry.js";
import { WorkerPool } from "./worker-pool.js";

interface MultipartSession {
	uploadId: string;
	completedParts: Map<number, UploadedPart>;
}

export class MultipartUploader {
	private readonly workerPool: WorkerPool;

	constructor(
		private readonly storage: StorageBackend,
		private readonly repository: MultipartRepository | undefined,
		private readonly options: ResolvedEngineOptions,
		private readonly retryOptions: RetryOptions,
		private readonly warn: StateWarning,
	) {
		this.workerPool = new WorkerPool(options.concurrency);
	}

	async upload(
		item: TransferItem,
		onBytes: (bytes: number) => void,
	): Promise<PutObjectResult> {
		const fileSize = item.size;
		const sourceStats = statSync(item.sourcePath);
		const sourceMtimeMs = sourceStats.mtimeMs;
		const totalParts = Math.ceil(fileSize / this.options.partSizeBytes);
		const session = await this.prepareSession(
			item,
			totalParts,
			sourceMtimeMs,
			onBytes,
		);
		const handle = await fsPromises.open(item.sourcePath, "r");
		try {
			await this.uploadMissingParts(handle, item, session, totalParts, onBytes);
			await this.ensureSourceUnchanged(item, sourceMtimeMs, session.uploadId);
			const parts = Array.from(session.completedParts.values()).sort(
				(a, b) => a.partNumber - b.partNumber,
			);
			const result = await RetryUtils.withRetry(
				async () =>
					await this.storage.completeMultipartUpload({
						bucket: this.options.bucket,
						key: item.targetPath,
						uploadId: session.uploadId,
						parts,
					}),
				this.retryOptions,
			);
			this.repository?.markCompleted(session.uploadId);
			return result;
		} finally {
			await handle.close();
		}
	}

	private async prepareSession(
		item: TransferItem,
		totalParts: number,
		sourceMtimeMs: number,
		onBytes: (bytes: number) => void,
	): Promise<MultipartSession> {
		const existing = this.repository?.findActiveSession(
			this.options.profileName,
			this.options.bucket,
			item.targetPath,
			item.sourcePath,
		);
		const canResume =
			existing != null &&
			existing.partSize === this.options.partSizeBytes &&
			existing.totalParts === totalParts &&
			existing.totalBytes === item.size &&
			existing.sourceMtimeMs !== undefined &&
			Math.abs(existing.sourceMtimeMs - sourceMtimeMs) < 1 &&
			(item.localHash === undefined ||
				existing.sourceSha256 === item.localHash);
		if (existing && canResume) {
			const completedParts = new Map<number, UploadedPart>();
			for (const part of existing.parts) {
				completedParts.set(part.partNumber, part);
				onBytes(part.size);
			}
			return { uploadId: existing.uploadId, completedParts };
		}
		if (existing) await this.abortStaleSession(item, existing.uploadId);
		const init = await RetryUtils.withRetry(
			async () =>
				await this.storage.createMultipartUpload({
					bucket: this.options.bucket,
					key: item.targetPath,
				}),
			this.retryOptions,
		);
		this.repository?.saveSession({
			uploadId: init.uploadId,
			profileName: this.options.profileName,
			bucket: this.options.bucket,
			key: item.targetPath,
			filePath: item.sourcePath,
			partSize: this.options.partSizeBytes,
			totalParts,
			totalBytes: item.size,
			sourceMtimeMs,
			sourceSha256: item.localHash,
		});
		return { uploadId: init.uploadId, completedParts: new Map() };
	}

	private async abortStaleSession(
		item: TransferItem,
		uploadId: string,
	): Promise<void> {
		try {
			await this.storage.abortMultipartUpload({
				bucket: this.options.bucket,
				key: item.targetPath,
				uploadId,
			});
		} catch (error) {
			this.warn(
				item,
				`Could not clean up stale multipart upload '${uploadId}': ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			this.repository?.markAborted(uploadId);
		}
	}

	private async uploadMissingParts(
		handle: fsPromises.FileHandle,
		item: TransferItem,
		session: MultipartSession,
		totalParts: number,
		onBytes: (bytes: number) => void,
	): Promise<void> {
		const tasks: Promise<void>[] = [];
		for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
			if (session.completedParts.has(partNumber)) continue;
			tasks.push(
				this.workerPool.run(async () => {
					const startOffset = (partNumber - 1) * this.options.partSizeBytes;
					const size = Math.min(
						this.options.partSizeBytes,
						item.size - startOffset,
					);
					const body = Buffer.allocUnsafe(size);
					const { bytesRead } = await handle.read(body, 0, size, startOffset);
					if (bytesRead !== size) {
						throw new IntegrityError(
							`Source file '${item.sourcePath}' changed or became unreadable during upload.`,
							{ key: item.targetPath },
						);
					}
					const part = await RetryUtils.withRetry(
						async () =>
							await this.storage.uploadPart({
								bucket: this.options.bucket,
								key: item.targetPath,
								uploadId: session.uploadId,
								partNumber,
								body,
								size,
							}),
						this.retryOptions,
					);
					session.completedParts.set(partNumber, part);
					this.repository?.recordPart({
						uploadId: session.uploadId,
						partNumber,
						etag: part.etag,
						checksumSha256: part.checksumSha256,
						size,
					});
					onBytes(size);
				}),
			);
		}
		const results = await Promise.allSettled(tasks);
		const failure = results.find(
			(result): result is PromiseRejectedResult => result.status === "rejected",
		);
		if (failure) throw failure.reason;
	}

	private async ensureSourceUnchanged(
		item: TransferItem,
		sourceMtimeMs: number,
		uploadId: string,
	): Promise<void> {
		const finalStats = statSync(item.sourcePath);
		if (
			finalStats.size === item.size &&
			Math.abs(finalStats.mtimeMs - sourceMtimeMs) < 1
		) {
			return;
		}
		await this.storage.abortMultipartUpload({
			bucket: this.options.bucket,
			key: item.targetPath,
			uploadId,
		});
		this.repository?.markAborted(uploadId);
		throw new IntegrityError(
			`Source file '${item.sourcePath}' changed during upload; the multipart upload was aborted.`,
			{ key: item.targetPath },
		);
	}
}
