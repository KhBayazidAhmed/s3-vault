import type { CliConfigOverrides } from "@S3-vault-CLI/config";
import type { TransferPlan } from "@S3-vault-CLI/domain";
import { TransferEngine, TransferPlanner } from "@S3-vault-CLI/transfer";
import type { ServiceContext } from "../service-context.js";

export interface PushOptions extends CliConfigOverrides {
	source: string;
	target?: string;
	recursive?: boolean;
	includes?: string[];
	excludes?: string[];
	dryRun?: boolean;
	verifyChecksum?: boolean;
	force?: boolean;
	share?: boolean;
	expiresInSeconds?: number;
	onProgress?: (progress: any) => void;
}

export interface PushResult {
	plan: TransferPlan;
	success: boolean;
	errors: Error[];
	shareUrl?: string;
	shareExpiresInSeconds?: number;
	sharedKey?: string;
}

export class PushUseCase {
	constructor(private context: ServiceContext) {}

	async plan(options: PushOptions): Promise<TransferPlan> {
		const { runtimeConfig, storage } =
			await this.context.resolveStorageWithCredentials(options);
		const remotePrefix = options.target ?? runtimeConfig.prefix;

		return await TransferPlanner.plan(storage, {
			direction: "push",
			localPath: options.source,
			remoteBucket: runtimeConfig.bucket,
			remotePrefix,
			includes: options.includes,
			excludes: options.excludes,
			recursive: options.recursive,
			computeHash:
				options.verifyChecksum ?? runtimeConfig.transferSettings.verifyChecksum,
			force: options.force,
		});
	}

	async execute(options: PushOptions): Promise<PushResult> {
		const { runtimeConfig, storage } =
			await this.context.resolveStorageWithCredentials(options);
		const plan = await this.plan(options);

		const engine = new TransferEngine(
			storage,
			{
				profileName: runtimeConfig.profileName,
				bucket: runtimeConfig.bucket,
				concurrency: runtimeConfig.transferSettings.concurrency,
				multipartThresholdBytes:
					runtimeConfig.transferSettings.multipartThresholdBytes,
				partSizeBytes: runtimeConfig.transferSettings.partSizeBytes,
				maxRetries: runtimeConfig.transferSettings.maxRetries,
				verifyChecksum: runtimeConfig.transferSettings.verifyChecksum,
				dryRun: options.dryRun,
			},
			{
				transferRepo: this.context.transferRepo,
				multipartRepo: this.context.multipartRepo,
			},
		);

		if (options.onProgress) {
			engine.on("progress", options.onProgress);
		}

		const res = await engine.execute(plan);

		let shareUrl: string | undefined;
		let shareExpiresInSeconds: number | undefined;
		let sharedKey: string | undefined;

		if (options.share && res.success && plan.items.length > 0) {
			const targetItem = plan.items[0];
			if (targetItem?.targetPath) {
				sharedKey = targetItem.targetPath.replace(/^\/+/, "");
				shareExpiresInSeconds = options.expiresInSeconds ?? 3600;
				shareUrl = await storage.createPresignedUrl({
					bucket: runtimeConfig.bucket,
					key: sharedKey,
					method: "GET",
					expiresInSeconds: shareExpiresInSeconds,
				});
			}
		}

		return {
			plan,
			success: res.success,
			errors: res.errors,
			shareUrl,
			shareExpiresInSeconds,
			sharedKey,
		};
	}
}
