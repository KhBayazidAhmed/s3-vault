import type { CliConfigOverrides } from "@S3-vault-CLI/config";
import type { ServiceContext } from "../service-context.js";

export interface StatusResult {
	profileName: string;
	provider: string;
	bucket: string;
	region?: string;
	endpoint?: string;
	prefix?: string;
	addressingStyle: string;
	hasCredentials: boolean;
	health: {
		ok: boolean;
		latencyMs: number;
		bucketExists: boolean;
		error?: string;
	};
	capabilities: Record<string, boolean>;
}

export class StatusUseCase {
	constructor(private context: ServiceContext) {}

	async execute(overrides: CliConfigOverrides = {}): Promise<StatusResult> {
		const { runtimeConfig, credentials, storage } =
			await this.context.resolveStorageWithCredentials(overrides);

		const health = await storage.checkHealth(runtimeConfig.bucket);

		return {
			profileName: runtimeConfig.profileName,
			provider: runtimeConfig.provider,
			bucket: runtimeConfig.bucket,
			region: runtimeConfig.region,
			endpoint: runtimeConfig.endpoint,
			prefix: runtimeConfig.prefix,
			addressingStyle: runtimeConfig.addressingStyle,
			hasCredentials: Boolean(
				credentials?.accessKeyId || runtimeConfig.provider === "mock",
			),
			health,
			capabilities: storage.capabilities as any,
		};
	}
}
