import type {
	AddressingStyle,
	ChecksumAlgorithm,
	StorageProviderType,
} from "@S3-vault-CLI/domain";
import type { StorageProfileConfig, TransferSettingsConfig } from "./schema.js";

export interface CliConfigOverrides {
	profile?: string;
	bucket?: string;
	region?: string;
	endpoint?: string;
	prefix?: string;
	provider?: StorageProviderType;
	addressingStyle?: AddressingStyle;
	checksumAlgorithm?: ChecksumAlgorithm;
	concurrency?: number;
	multipartThresholdBytes?: number;
	partSizeBytes?: number;
	maxRetries?: number;
	verifyChecksum?: boolean;
	useSsl?: boolean;
}

export interface ResolvedRuntimeConfig {
	profileName: string;
	provider: StorageProviderType;
	bucket: string;
	region?: string;
	endpoint?: string;
	prefix: string;
	addressingStyle: AddressingStyle;
	checksumAlgorithm: ChecksumAlgorithm;
	useSsl: boolean;
	transferSettings: TransferSettingsConfig;
}

export class ConfigResolver {
	static resolve(
		profile: StorageProfileConfig,
		cliOverrides: CliConfigOverrides = {},
		env: Record<string, string | undefined> = process.env,
	): ResolvedRuntimeConfig {
		const bucket =
			cliOverrides.bucket ||
			env.AWS_BUCKET ||
			env.S3_VAULT_BUCKET ||
			profile.bucket;

		const region =
			cliOverrides.region ||
			env.AWS_REGION ||
			env.AWS_DEFAULT_REGION ||
			env.S3_VAULT_REGION ||
			profile.region;

		const endpoint =
			cliOverrides.endpoint ||
			env.AWS_ENDPOINT_URL ||
			env.AWS_ENDPOINT_URL_S3 ||
			env.S3_VAULT_ENDPOINT ||
			profile.endpoint;

		const prefix =
			cliOverrides.prefix ?? env.S3_VAULT_PREFIX ?? profile.prefix ?? "";

		const provider: StorageProviderType =
			cliOverrides.provider ||
			(env.S3_VAULT_PROVIDER as StorageProviderType) ||
			profile.provider;

		const addressingStyle: AddressingStyle =
			cliOverrides.addressingStyle ||
			(env.S3_VAULT_ADDRESSING_STYLE as AddressingStyle) ||
			profile.addressingStyle ||
			"auto";

		const checksumAlgorithm: ChecksumAlgorithm =
			cliOverrides.checksumAlgorithm ||
			(env.S3_VAULT_CHECKSUM_ALGO as ChecksumAlgorithm) ||
			profile.checksumAlgorithm ||
			"sha256";

		const useSsl =
			cliOverrides.useSsl !== undefined
				? cliOverrides.useSsl
				: env.S3_VAULT_USE_SSL !== undefined
					? env.S3_VAULT_USE_SSL !== "false" && env.S3_VAULT_USE_SSL !== "0"
					: (profile.useSsl ?? true);

		const transferSettings: TransferSettingsConfig = {
			concurrency:
				cliOverrides.concurrency ||
				(env.S3_VAULT_CONCURRENCY
					? Number.parseInt(env.S3_VAULT_CONCURRENCY, 10)
					: undefined) ||
				profile.transferSettings?.concurrency ||
				8,
			multipartThresholdBytes:
				cliOverrides.multipartThresholdBytes ||
				(env.S3_VAULT_MULTIPART_THRESHOLD
					? Number.parseInt(env.S3_VAULT_MULTIPART_THRESHOLD, 10)
					: undefined) ||
				profile.transferSettings?.multipartThresholdBytes ||
				16 * 1024 * 1024,
			partSizeBytes:
				cliOverrides.partSizeBytes ||
				(env.S3_VAULT_PART_SIZE
					? Number.parseInt(env.S3_VAULT_PART_SIZE, 10)
					: undefined) ||
				profile.transferSettings?.partSizeBytes ||
				8 * 1024 * 1024,
			maxRetries:
				cliOverrides.maxRetries ??
				(env.S3_VAULT_MAX_RETRIES
					? Number.parseInt(env.S3_VAULT_MAX_RETRIES, 10)
					: undefined) ??
				profile.transferSettings?.maxRetries ??
				3,
			retryBaseDelayMs: profile.transferSettings?.retryBaseDelayMs ?? 500,
			retryMaxDelayMs: profile.transferSettings?.retryMaxDelayMs ?? 10000,
			verifyChecksum:
				cliOverrides.verifyChecksum !== undefined
					? cliOverrides.verifyChecksum
					: env.S3_VAULT_VERIFY_CHECKSUM !== undefined
						? env.S3_VAULT_VERIFY_CHECKSUM !== "false" &&
							env.S3_VAULT_VERIFY_CHECKSUM !== "0"
						: (profile.transferSettings?.verifyChecksum ?? true),
		};

		return {
			profileName: profile.name,
			provider,
			bucket,
			region,
			endpoint,
			prefix,
			addressingStyle,
			checksumAlgorithm,
			useSsl,
			transferSettings,
		};
	}
}
