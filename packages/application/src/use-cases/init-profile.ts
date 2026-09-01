import {
	ConfigResolver,
	type StorageProfileConfig,
	StorageProfileSchema,
} from "@S3-vault-CLI/config";
import type { SecretCredentials } from "@S3-vault-CLI/secrets";
import { BackendFactory } from "../backend-factory.js";
import type { ServiceContext } from "../service-context.js";

export interface InitProfileInput {
	name: string;
	provider: StorageProfileConfig["provider"];
	bucket: string;
	region?: string;
	endpoint?: string;
	prefix?: string;
	addressingStyle?: StorageProfileConfig["addressingStyle"];
	checksumAlgorithm?: StorageProfileConfig["checksumAlgorithm"];
	useSsl?: boolean;
	isDefault?: boolean;
	credentials?: SecretCredentials;
	saveToKeychain?: boolean;
}

export interface InitProfileResult {
	profile: StorageProfileConfig;
	credentialStore?: string;
	connectionTest: { ok: boolean; latencyMs: number; error?: string };
}

export class InitProfileUseCase {
	constructor(private context: ServiceContext) {}

	async execute(input: InitProfileInput): Promise<InitProfileResult> {
		const profile: StorageProfileConfig = StorageProfileSchema.parse({
			name: input.name,
			provider: input.provider,
			bucket: input.bucket,
			region: input.region,
			endpoint: input.endpoint,
			prefix: input.prefix,
			addressingStyle: input.addressingStyle ?? "auto",
			checksumAlgorithm: input.checksumAlgorithm ?? "sha256",
			useSsl: input.useSsl ?? true,
			isDefault: input.isDefault ?? false,
		});

		let credentialStore: string | undefined;
		if (
			input.credentials &&
			input.credentials.accessKeyId &&
			input.credentials.secretAccessKey
		) {
			credentialStore = await this.context.secretResolver.save(
				input.name,
				input.credentials,
				input.saveToKeychain ?? true,
			);
		}

		this.context.configManager.saveProfile(profile);

		// Test connection
		const runtimeConfig = ConfigResolver.resolve(profile);
		const storage = BackendFactory.create(runtimeConfig, input.credentials);
		const health = await storage.checkHealth(profile.bucket);

		return {
			profile,
			credentialStore,
			connectionTest: {
				ok: health.ok,
				latencyMs: health.latencyMs,
				error: health.error,
			},
		};
	}
}
