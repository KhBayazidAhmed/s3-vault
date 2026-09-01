export type StorageProviderType =
	| "aws-s3"
	| "cloudflare-r2"
	| "minio"
	| "wasabi"
	| "custom-s3"
	| "mock";

export type AddressingStyle = "auto" | "virtual-hosted" | "path-style";

export type ChecksumAlgorithm = "sha256" | "crc32" | "crc32c" | "md5" | "none";

export interface TransferSettings {
	concurrency?: number;
	multipartThresholdBytes?: number;
	partSizeBytes?: number;
	maxRetries?: number;
	retryBaseDelayMs?: number;
	retryMaxDelayMs?: number;
	verifyChecksum?: boolean;
}

export interface StorageProfile {
	name: string;
	provider: StorageProviderType;
	bucket: string;
	region?: string;
	endpoint?: string;
	prefix?: string;
	addressingStyle?: AddressingStyle;
	checksumAlgorithm?: ChecksumAlgorithm;
	transferSettings?: TransferSettings;
	useSsl?: boolean;
	isDefault?: boolean;
	createdAt?: string;
	updatedAt?: string;
}
