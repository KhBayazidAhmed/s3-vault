import {
	ChecksumUtils,
	IntegrityError,
	type TransferItem,
	type TransferPlan,
	type TransferProgress,
} from "@S3-vault-CLI/domain";
import type {
	MultipartRepository,
	TransferRepository,
} from "@S3-vault-CLI/state";
import type { StorageBackend, UploadedPart } from "@S3-vault-CLI/storage";
import { EventEmitter } from "node:events";
import {
	closeSync,
	createReadStream,
	createWriteStream,
	existsSync,
	mkdirSync,
	openSync,
	readSync,
	unlinkSync,
} from "node:fs";
import { dirname } from "node:path";
import { type RetryOptions, RetryUtils } from "./retry.js";
import { WorkerPool } from "./worker-pool.js";

export interface TransferEngineOptions {
	profileName: string;
	bucket: string;
	concurrency?: number;
	multipartThresholdBytes?: number;
	partSizeBytes?: number;
	maxRetries?: number;
	retryBaseDelayMs?: number;
	retryMaxDelayMs?: number;
	verifyChecksum?: boolean;
	dryRun?: boolean;
}

export class TransferEngine extends EventEmitter {
	private storage: StorageBackend;
	private transferRepo?: TransferRepository;
	private multipartRepo?: MultipartRepository;
	private options: Required<TransferEngineOptions>;
	private workerPool: WorkerPool;
	private retryOptions: RetryOptions;

	constructor(
		storage: StorageBackend,
		options: TransferEngineOptions,
		repos?: {
			transferRepo?: TransferRepository;
			multipartRepo?: MultipartRepository;
		},
	) {
		super();
		this.storage = storage;
		this.transferRepo = repos?.transferRepo;
		this.multipartRepo = repos?.multipartRepo;

		this.options = {
			profileName: options.profileName,
			bucket: options.bucket,
			concurrency: options.concurrency ?? 8,
			multipartThresholdBytes:
				options.multipartThresholdBytes ?? 16 * 1024 * 1024,
			partSizeBytes: options.partSizeBytes ?? 8 * 1024 * 1024,
			maxRetries: options.maxRetries ?? 3,
			retryBaseDelayMs: options.retryBaseDelayMs ?? 500,
			retryMaxDelayMs: options.retryMaxDelayMs ?? 10000,
			verifyChecksum: options.verifyChecksum ?? true,
			dryRun: options.dryRun ?? false,
		};

		this.workerPool = new WorkerPool(this.options.concurrency);
		this.retryOptions = {
			maxRetries: this.options.maxRetries,
			baseDelayMs: this.options.retryBaseDelayMs,
			maxDelayMs: this.options.retryMaxDelayMs,
		};
	}

	async execute(
		plan: TransferPlan,
		jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
	): Promise<{ success: boolean; errors: Error[] }> {
		const totalFiles = plan.items.filter((i) => i.action !== "skip").length;
		const totalBytes = plan.totalBytes;
		let completedFiles = 0;
		let failedFiles = 0;
		let transferredBytes = 0;
		const startTime = Date.now();
		const errors: Error[] = [];

		// Save job in DB
		if (this.transferRepo && !this.options.dryRun) {
			this.transferRepo.createJob(
				{
					id: jobId,
					profileName: this.options.profileName,
					direction: plan.direction,
					sourcePath: plan.items[0]?.sourcePath ?? "",
					targetPath: plan.items[0]?.targetPath ?? "",
					totalItems: totalFiles,
					totalBytes,
					status: "in_progress",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				plan.items,
			);
		}

		this.emit("start", {
			jobId,
			totalFiles,
			totalBytes,
			dryRun: this.options.dryRun,
		});

		const emitProgress = (activeItem?: string) => {
			const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
			const speedBytesPerSec = transferredBytes / elapsedSec;
			const remainingBytes = Math.max(0, totalBytes - transferredBytes);
			const estimatedRemainingSec =
				speedBytesPerSec > 0 ? remainingBytes / speedBytesPerSec : 0;

			const progress: TransferProgress = {
				jobId,
				totalFiles,
				completedFiles,
				failedFiles,
				totalBytes,
				transferredBytes,
				speedBytesPerSec,
				estimatedRemainingSec,
				activeItem,
				status:
					failedFiles > 0
						? completedFiles > 0
							? "in_progress"
							: "failed"
						: "in_progress",
			};

			this.emit("progress", progress);
		};

		if (this.options.dryRun) {
			for (const item of plan.items) {
				if (item.action !== "skip") {
					transferredBytes += item.size;
					completedFiles++;
					emitProgress(item.relativePath);
				}
			}
			this.emit("complete", {
				jobId,
				completedFiles,
				failedFiles: 0,
				transferredBytes,
				errors: [],
			});
			return { success: true, errors: [] };
		}

		const tasks = plan.items.map((item) => async () => {
			if (item.action === "skip") {
				return;
			}

			this.emit("item-start", item);

			try {
				if (item.action === "upload") {
					await this.uploadItem(item, (bytes) => {
						transferredBytes += bytes;
						emitProgress(item.relativePath);
					});
				} else if (item.action === "download") {
					await this.downloadItem(item, (bytes) => {
						transferredBytes += bytes;
						emitProgress(item.relativePath);
					});
				} else if (item.action === "delete-remote") {
					await this.storage.deleteObject({
						bucket: this.options.bucket,
						key: item.targetPath,
					});
					emitProgress(item.relativePath);
				} else if (item.action === "delete-local") {
					if (existsSync(item.sourcePath)) {
						unlinkSync(item.sourcePath);
					}
					emitProgress(item.relativePath);
				}

				item.status = "completed";
				completedFiles++;
				this.transferRepo?.updateTaskStatus(item.id, "completed", item.size);
				this.emit("item-complete", item);
			} catch (err: unknown) {
				const error = err instanceof Error ? err : new Error(String(err));
				item.status = "failed";
				item.error = error.message;
				failedFiles++;
				errors.push(error);
				this.transferRepo?.updateTaskStatus(
					item.id,
					"failed",
					0,
					error.message,
				);
				this.emit("item-fail", { item, error });
			}
		});

		await Promise.all(tasks.map((task) => this.workerPool.run(task)));

		const finalStatus =
			failedFiles === 0
				? "completed"
				: completedFiles > 0
					? "failed"
					: "failed";
		this.transferRepo?.updateJobStatus(
			jobId,
			finalStatus,
			errors.map((e) => e.message).join("; "),
		);

		this.emit("complete", {
			jobId,
			completedFiles,
			failedFiles,
			transferredBytes,
			errors,
		});

		return {
			success: failedFiles === 0,
			errors,
		};
	}

	private async uploadItem(
		item: TransferItem,
		onBytes: (bytes: number) => void,
	): Promise<void> {
		const filePath = item.sourcePath;
		const key = item.targetPath;
		const fileSize = item.size;

		// Small file upload
		if (fileSize < this.options.multipartThresholdBytes) {
			await RetryUtils.withRetry(async () => {
				const fileStream = createReadStream(filePath);
				let sha256: string | undefined;

				if (this.options.verifyChecksum) {
					const { hash } = await ChecksumUtils.hashStream(
						createReadStream(filePath),
						"sha256",
					);
					sha256 = hash;
				}

				const putRes = await this.storage.putObject({
					bucket: this.options.bucket,
					key,
					body: fileStream,
					size: fileSize,
					checksumSha256: sha256,
				});

				// Verification
				if (this.options.verifyChecksum && sha256 && putRes.checksumSha256) {
					if (sha256.toLowerCase() !== putRes.checksumSha256.toLowerCase()) {
						throw new IntegrityError(
							`Uploaded object '${key}' checksum mismatch (expected ${sha256}, got ${putRes.checksumSha256}).`,
							{
								key,
								expectedChecksum: sha256,
								actualChecksum: putRes.checksumSha256,
							},
						);
					}
				}
			}, this.retryOptions);

			onBytes(fileSize);
			return;
		}

		// Multipart upload
		await this.uploadMultipartItem(filePath, key, fileSize, onBytes);
	}

	private async uploadMultipartItem(
		filePath: string,
		key: string,
		fileSize: number,
		onBytes: (bytes: number) => void,
	): Promise<void> {
		const partSize = this.options.partSizeBytes;
		const totalParts = Math.ceil(fileSize / partSize);

		// Check for resumable session
		let uploadId: string;
		const completedPartsMap = new Map<number, UploadedPart>();

		const existingSession = this.multipartRepo?.findActiveSession(
			this.options.profileName,
			this.options.bucket,
			key,
			filePath,
		);

		if (
			existingSession &&
			existingSession.partSize === partSize &&
			existingSession.totalParts === totalParts
		) {
			uploadId = existingSession.uploadId;
			for (const p of existingSession.parts) {
				completedPartsMap.set(p.partNumber, p);
				onBytes(p.size);
			}
		} else {
			const init = await this.storage.createMultipartUpload({
				bucket: this.options.bucket,
				key,
			});
			uploadId = init.uploadId;

			this.multipartRepo?.saveSession({
				uploadId,
				profileName: this.options.profileName,
				bucket: this.options.bucket,
				key,
				filePath,
				partSize,
				totalParts,
				totalBytes: fileSize,
			});
		}

		const fd = openSync(filePath, "r");

		try {
			for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
				if (completedPartsMap.has(partNumber)) {
					continue; // Part already uploaded in previous session
				}

				const startOffset = (partNumber - 1) * partSize;
				const currentPartSize = Math.min(partSize, fileSize - startOffset);
				const partBuffer = Buffer.alloc(currentPartSize);

				readSync(fd, partBuffer, 0, currentPartSize, startOffset);

				const uploadedPart = await RetryUtils.withRetry(async () => {
					return await this.storage.uploadPart({
						bucket: this.options.bucket,
						key,
						uploadId,
						partNumber,
						body: partBuffer,
						size: currentPartSize,
					});
				}, this.retryOptions);

				completedPartsMap.set(partNumber, uploadedPart);
				this.multipartRepo?.recordPart({
					uploadId,
					partNumber,
					etag: uploadedPart.etag,
					checksumSha256: uploadedPart.checksumSha256,
					size: currentPartSize,
				});

				onBytes(currentPartSize);
			}

			// Complete multipart upload
			const sortedParts = Array.from(completedPartsMap.values()).sort(
				(a, b) => a.partNumber - b.partNumber,
			);
			await this.storage.completeMultipartUpload({
				bucket: this.options.bucket,
				key,
				uploadId,
				parts: sortedParts,
			});

			this.multipartRepo?.markCompleted(uploadId);
		} catch (err) {
			throw err;
		} finally {
			closeSync(fd);
		}
	}

	private async downloadItem(
		item: TransferItem,
		onBytes: (bytes: number) => void,
	): Promise<void> {
		const key = item.sourcePath;
		const targetFile = item.targetPath;

		mkdirSync(dirname(targetFile), { recursive: true });

		await RetryUtils.withRetry(async () => {
			const stream = await this.storage.getObject({
				bucket: this.options.bucket,
				key,
			});

			const writeStream = createWriteStream(targetFile);
			let downloadedBytes = 0;

			await new Promise<void>((resolve, reject) => {
				stream.on("data", (chunk: Buffer) => {
					downloadedBytes += chunk.length;
					onBytes(chunk.length);
				});
				stream.pipe(writeStream);
				writeStream.on("finish", resolve);
				writeStream.on("error", reject);
				stream.on("error", reject);
			});

			// Verify checksum if available
			if (
				this.options.verifyChecksum &&
				item.remoteHash &&
				!ChecksumUtils.isMultipartETag(item.remoteHash)
			) {
				const { hash } = await ChecksumUtils.hashStream(
					createReadStream(targetFile),
					"sha256",
				);
				const remoteClean = item.remoteHash.replace(/["']/g, "").toLowerCase();

				if (remoteClean.length === 64 && hash.toLowerCase() !== remoteClean) {
					throw new IntegrityError(
						`Downloaded file '${targetFile}' checksum mismatch (expected ${remoteClean}, got ${hash}).`,
						{ key, expectedChecksum: remoteClean, actualChecksum: hash },
					);
				}
			}
		}, this.retryOptions);
	}
}
