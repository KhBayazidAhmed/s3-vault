import type { CliConfigOverrides } from "@S3-vault-CLI/config";
import type { TransferPlan } from "@S3-vault-CLI/domain";
import { TransferEngine, TransferPlanner } from "@S3-vault-CLI/transfer";
import type { ServiceContext } from "../service-context.js";

export interface PullOptions extends CliConfigOverrides {
	source: string;
	target?: string;
	recursive?: boolean;
	dryRun?: boolean;
	onProgress?: (progress: any) => void;
}

export class PullUseCase {
	constructor(private context: ServiceContext) {}

	async plan(options: PullOptions): Promise<TransferPlan> {
		const { runtimeConfig, storage } =
			await this.context.resolveStorageWithCredentials(options);
		const localTarget = options.target ?? "./";

		return await TransferPlanner.plan(storage, {
			direction: "pull",
			localPath: localTarget,
			remoteBucket: runtimeConfig.bucket,
			remotePrefix: options.source,
			recursive: options.recursive,
		});
	}

	async execute(
		options: PullOptions,
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
				maxRetries: runtimeConfig.transferSettings.maxRetries,
				verifyChecksum: runtimeConfig.transferSettings.verifyChecksum,
				dryRun: options.dryRun,
			},
			{
				transferRepo: this.context.transferRepo,
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
