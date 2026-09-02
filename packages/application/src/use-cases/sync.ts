import type { CliConfigOverrides } from "@S3-vault-CLI/config";
import type {
	ConflictPolicy,
	DeletePolicy,
	TransferDirection,
	TransferPlan,
} from "@S3-vault-CLI/domain";
import { TransferEngine, TransferPlanner } from "@S3-vault-CLI/transfer";
import type { ServiceContext } from "../service-context.js";

export interface SyncOptions extends CliConfigOverrides {
	localPath: string;
	remotePath?: string;
	direction?: "up" | "down" | "two-way";
	conflictPolicy?: ConflictPolicy;
	deletePolicy?: DeletePolicy;
	dryRun?: boolean;
	onProgress?: (progress: any) => void;
}

export class SyncUseCase {
	constructor(private context: ServiceContext) {}

	private mapDirection(
		dir: "up" | "down" | "two-way" = "up",
	): TransferDirection {
		if (dir === "down") return "sync-down";
		if (dir === "two-way") return "sync-two-way";
		return "sync-up";
	}

	async plan(options: SyncOptions): Promise<TransferPlan> {
		const { runtimeConfig, storage } =
			await this.context.resolveStorageWithCredentials(options);
		const direction = this.mapDirection(options.direction);
		const remotePrefix = options.remotePath ?? runtimeConfig.prefix;

		return await TransferPlanner.plan(storage, {
			direction,
			localPath: options.localPath,
			remoteBucket: runtimeConfig.bucket,
			remotePrefix,
			conflictPolicy: options.conflictPolicy ?? "newer",
			deletePolicy: options.deletePolicy ?? "none",
			computeHash: direction === "sync-up" || direction === "sync-two-way",
		});
	}

	async execute(
		options: SyncOptions,
	): Promise<{ plan: TransferPlan; success: boolean; errors: Error[] }> {
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
				uploadedFileRepo: this.context.uploadedFileRepo,
			},
		);

		if (options.onProgress) {
			engine.on("progress", options.onProgress);
		}

		const res = await engine.execute(plan);
		return {
			plan,
			success: res.success,
			errors: res.errors,
		};
	}
}
