import { z } from "zod";

export const StorageProviderSchema = z.enum([
	"aws-s3",
	"cloudflare-r2",
	"minio",
	"wasabi",
	"custom-s3",
	"mock",
]);

export const AddressingStyleSchema = z.enum([
	"auto",
	"virtual-hosted",
	"path-style",
]);

export const ChecksumAlgorithmSchema = z.enum([
	"sha256",
	"crc32",
	"crc32c",
	"md5",
	"none",
]);

export const TransferSettingsSchema = z.object({
	concurrency: z.number().int().min(1).max(64).default(8),
	multipartThresholdBytes: z
		.number()
		.int()
		.min(5 * 1024 * 1024)
		.default(16 * 1024 * 1024), // 16MB
	partSizeBytes: z
		.number()
		.int()
		.min(5 * 1024 * 1024)
		.default(8 * 1024 * 1024), // 8MB
	maxRetries: z.number().int().min(0).max(10).default(3),
	retryBaseDelayMs: z.number().int().min(100).default(500),
	retryMaxDelayMs: z.number().int().min(1000).default(10000),
	verifyChecksum: z.boolean().default(true),
});

export const StorageProfileSchema = z.object({
	name: z
		.string()
		.min(1)
		.regex(
			/^[a-zA-Z0-9_-]+$/,
			"Profile name must only contain alphanumeric characters, dashes, and underscores",
		),
	provider: StorageProviderSchema,
	bucket: z.string().min(1),
	region: z.string().optional(),
	endpoint: z.string().url().optional(),
	prefix: z.string().optional(),
	addressingStyle: AddressingStyleSchema.default("auto"),
	checksumAlgorithm: ChecksumAlgorithmSchema.default("sha256"),
	transferSettings: TransferSettingsSchema.default({
		concurrency: 8,
		multipartThresholdBytes: 16 * 1024 * 1024,
		partSizeBytes: 8 * 1024 * 1024,
		maxRetries: 3,
		retryBaseDelayMs: 500,
		retryMaxDelayMs: 10000,
		verifyChecksum: true,
	}),
	useSsl: z.boolean().default(true),
	isDefault: z.boolean().default(false),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
});

export const GlobalConfigSchema = z.object({
	version: z.literal("1.0"),
	activeProfile: z.string().optional(),
	profiles: z.record(z.string(), StorageProfileSchema).default({}),
	defaultTransferSettings: TransferSettingsSchema.default({
		concurrency: 8,
		multipartThresholdBytes: 16 * 1024 * 1024,
		partSizeBytes: 8 * 1024 * 1024,
		maxRetries: 3,
		retryBaseDelayMs: 500,
		retryMaxDelayMs: 10000,
		verifyChecksum: true,
	}),
});

export type StorageProfileConfig = z.infer<typeof StorageProfileSchema>;
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;
export type TransferSettingsConfig = z.infer<typeof TransferSettingsSchema>;
