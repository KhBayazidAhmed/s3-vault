import type { RetryOptions } from "./retry.js";

export interface TransferEngineOptions {
	profileName: string;
	bucket: string;
	concurrency?: number;
	multipartThresholdBytes?: number;
	partSizeBytes?: number;
	maxRetries?: number;
	retryBaseDelayMs?: number;
	retryMaxDelayMs?: number;
	verifyChecksum?: boolean;
	dryRun?: boolean;
}

export type ResolvedEngineOptions = Required<TransferEngineOptions>;

export function resolveEngineOptions(
	options: TransferEngineOptions,
): ResolvedEngineOptions {
	return {
		profileName: options.profileName,
		bucket: options.bucket,
		concurrency: options.concurrency ?? 8,
		multipartThresholdBytes:
			options.multipartThresholdBytes ?? 16 * 1024 * 1024,
		partSizeBytes: options.partSizeBytes ?? 8 * 1024 * 1024,
		maxRetries: options.maxRetries ?? 3,
		retryBaseDelayMs: options.retryBaseDelayMs ?? 500,
		retryMaxDelayMs: options.retryMaxDelayMs ?? 10000,
		verifyChecksum: options.verifyChecksum ?? true,
		dryRun: options.dryRun ?? false,
	};
}

export function makeRetryOptions(options: ResolvedEngineOptions): RetryOptions {
	return {
		maxRetries: options.maxRetries,
		baseDelayMs: options.retryBaseDelayMs,
		maxDelayMs: options.retryMaxDelayMs,
	};
}
