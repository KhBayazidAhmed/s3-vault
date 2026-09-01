import { VaultError } from "@S3-vault-CLI/domain";

export interface RetryOptions {
	maxRetries: number;
	baseDelayMs: number;
	maxDelayMs: number;
	shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export class RetryUtils {
	static async withRetry<T>(
		operation: (attempt: number) => Promise<T>,
		options: RetryOptions,
	): Promise<T> {
		let attempt = 0;
		while (true) {
			attempt++;
			try {
				return await operation(attempt);
			} catch (err: unknown) {
				const isRetryable =
					err instanceof VaultError
						? err.retryable
						: options.shouldRetry
							? options.shouldRetry(err, attempt)
							: true;

				if (!isRetryable || attempt > options.maxRetries) {
					throw err;
				}

				// Exponential backoff with jitter: delay = min(maxDelay, baseDelay * 2^(attempt - 1) + jitter)
				const exponential = options.baseDelayMs * 2 ** (attempt - 1);
				const jitter = Math.random() * (options.baseDelayMs / 2);
				const delay = Math.min(options.maxDelayMs, exponential + jitter);

				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}
}
