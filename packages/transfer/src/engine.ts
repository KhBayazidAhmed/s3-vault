import type { TransferItem, TransferPlan } from "@S3-vault-CLI/domain";
import type {
	MultipartRepository,
	TransferRepository,
	UploadedFileRepository,
} from "@S3-vault-CLI/state";
import type { PutObjectResult, StorageBackend } from "@S3-vault-CLI/storage";
import { EventEmitter } from "node:events";
import { existsSync, unlinkSync } from "node:fs";
import { downloadItem, recordSuccessfulUpload } from "./engine-files.js";
import {
	makeRetryOptions,
	type ResolvedEngineOptions,
	resolveEngineOptions,
	type TransferEngineOptions,
} from "./engine-options.js";
import {
	createProgressEmitter,
	type ProgressState,
} from "./engine-progress.js";
import { EngineUploader } from "./engine-uploader.js";
import type { RetryOptions } from "./retry.js";
import { WorkerPool } from "./worker-pool.js";

export type { TransferEngineOptions } from "./engine-options.js";

export class TransferEngine extends EventEmitter {
	private readonly transferRepo?: TransferRepository;
	private readonly uploadedFileRepo?: UploadedFileRepository;
	private readonly options: ResolvedEngineOptions;
	private readonly workerPool: WorkerPool;
	private readonly retryOptions: RetryOptions;
	private readonly uploader: EngineUploader;

	constructor(
		private readonly storage: StorageBackend,
		options: TransferEngineOptions,
		repos?: {
			transferRepo?: TransferRepository;
			multipartRepo?: MultipartRepository;
			uploadedFileRepo?: UploadedFileRepository;
		},
	) {
		super();
		this.transferRepo = repos?.transferRepo;
		this.uploadedFileRepo = repos?.uploadedFileRepo;
		this.options = resolveEngineOptions(options);
		this.workerPool = new WorkerPool(this.options.concurrency);
		this.retryOptions = makeRetryOptions(this.options);
		this.uploader = new EngineUploader(
			storage,
			repos?.multipartRepo,
			this.options,
			this.retryOptions,
			(item, message) => this.emit("state-warning", { item, message }),
		);
	}

	async execute(
		plan: TransferPlan,
		jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
	): Promise<{ success: boolean; errors: Error[] }> {
		const totalFiles = plan.items.filter(
			(item) => item.action !== "skip",
		).length;
		const state: ProgressState = {
			completedFiles: 0,
			failedFiles: 0,
			transferredBytes: 0,
		};
		const errors: Error[] = [];
		this.createJob(plan, jobId, totalFiles);
		this.emit("start", {
			jobId,
			totalFiles,
			totalBytes: plan.totalBytes,
			dryRun: this.options.dryRun,
		});
		const emitProgress = createProgressEmitter(
			jobId,
			totalFiles,
			plan.totalBytes,
			state,
			(progress) => this.emit("progress", progress),
		);

		if (this.options.dryRun) {
			for (const item of plan.items) {
				if (item.action === "skip") continue;
				state.transferredBytes += item.size;
				state.completedFiles++;
				emitProgress(item.relativePath);
			}
			this.emitComplete(jobId, state, []);
			return { success: true, errors: [] };
		}

		const tasks = plan.items.map((item) => async () => {
			if (item.action === "skip") {
				if (
					plan.direction === "push" ||
					plan.direction === "sync-up" ||
					plan.direction === "sync-two-way"
				) {
					this.recordUpload(item);
				}
				return;
			}
			this.emit("item-start", item);
			try {
				await this.executeItem(item, state, emitProgress);
				item.status = "completed";
				state.completedFiles++;
				this.transferRepo?.updateTaskStatus(item.id, "completed", item.size);
				this.emit("item-complete", item);
			} catch (error: unknown) {
				this.failItem(item, error, state, errors);
			}
		});
		await Promise.all(tasks.map((task) => this.workerPool.run(task)));

		this.transferRepo?.updateJobStatus(
			jobId,
			state.failedFiles === 0 ? "completed" : "failed",
			errors.map((error) => error.message).join("; "),
		);
		this.emitComplete(jobId, state, errors);
		return { success: state.failedFiles === 0, errors };
	}

	private createJob(
		plan: TransferPlan,
		jobId: string,
		totalFiles: number,
	): void {
		if (!this.transferRepo || this.options.dryRun) return;
		this.transferRepo.createJob(
			{
				id: jobId,
				profileName: this.options.profileName,
				direction: plan.direction,
				sourcePath: plan.items[0]?.sourcePath ?? "",
				targetPath: plan.items[0]?.targetPath ?? "",
				totalItems: totalFiles,
				totalBytes: plan.totalBytes,
				status: "in_progress",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			plan.items,
		);
	}

	private async executeItem(
		item: TransferItem,
		state: ProgressState,
		emitProgress: (activeItem?: string) => void,
	): Promise<void> {
		const onBytes = (bytes: number) => {
			state.transferredBytes += bytes;
			emitProgress(item.relativePath);
		};
		let uploadResult: PutObjectResult | undefined;
		if (item.action === "upload") {
			uploadResult = await this.uploader.upload(item, onBytes);
			this.recordUpload(item, uploadResult);
		} else if (item.action === "download") {
			await downloadItem(
				this.storage,
				this.options,
				this.retryOptions,
				item,
				onBytes,
			);
		} else if (item.action === "delete-remote") {
			await this.storage.deleteObject({
				bucket: this.options.bucket,
				key: item.targetPath,
			});
			emitProgress(item.relativePath);
		} else if (item.action === "delete-local") {
			if (existsSync(item.sourcePath)) unlinkSync(item.sourcePath);
			emitProgress(item.relativePath);
		}
	}

	private recordUpload(item: TransferItem, result?: PutObjectResult): void {
		recordSuccessfulUpload(
			this.uploadedFileRepo,
			this.options,
			item,
			result,
			(warningItem, message) =>
				this.emit("state-warning", { item: warningItem, message }),
		);
	}

	private failItem(
		item: TransferItem,
		failure: unknown,
		state: ProgressState,
		errors: Error[],
	): void {
		const error =
			failure instanceof Error ? failure : new Error(String(failure));
		item.status = "failed";
		item.error = error.message;
		state.failedFiles++;
		errors.push(error);
		this.transferRepo?.updateTaskStatus(item.id, "failed", 0, error.message);
		this.emit("item-fail", { item, error });
	}

	private emitComplete(
		jobId: string,
		state: ProgressState,
		errors: Error[],
	): void {
		this.emit("complete", { jobId, ...state, errors });
	}
}
