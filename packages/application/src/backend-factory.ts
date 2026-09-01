import { type ResolvedRuntimeConfig, VaultPaths } from "@S3-vault-CLI/config";
import type { SecretCredentials } from "@S3-vault-CLI/secrets";
import type { StorageBackend } from "@S3-vault-CLI/storage";
import { S3StorageBackend } from "@S3-vault-CLI/storage-s3";
import { LocalFileSystemStorageBackend } from "@S3-vault-CLI/test-backend";
import { join } from "node:path";

export class BackendFactory {
	static create(
		config: ResolvedRuntimeConfig,
		credentials?: SecretCredentials | null,
	): StorageBackend {
		if (config.provider === "mock") {
			const rootPath = config.endpoint?.startsWith("file://")
				? config.endpoint.replace("file://", "")
				: join(VaultPaths.getVaultHome(), "mock-storage");
			return new LocalFileSystemStorageBackend(rootPath);
		}

		return new S3StorageBackend(
			{
				provider: config.provider,
				bucket: config.bucket,
				region: config.region,
				endpoint: config.endpoint,
				addressingStyle: config.addressingStyle,
				useSsl: config.useSsl,
			},
			credentials ?? undefined,
		);
	}
}
