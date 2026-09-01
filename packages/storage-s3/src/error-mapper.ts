import {
	AuthenticationError,
	AuthorizationError,
	ConfigurationError,
	NetworkError,
	NotFoundError,
	StorageLimitError,
	VaultError,
} from "@S3-vault-CLI/domain";

export class S3ErrorMapper {
	static toDomainError(
		err: unknown,
		context: { bucket?: string; key?: string; operation?: string } = {},
	): VaultError {
		if (err instanceof VaultError) {
			return err;
		}

		const error = err as {
			name?: string;
			code?: string;
			$metadata?: { httpStatusCode?: number };
			message?: string;
		};
		const name = error.name || error.code || "";
		const statusCode = error.$metadata?.httpStatusCode;
		const message = error.message || String(err);

		// 1. Not Found
		if (
			name === "NoSuchBucket" ||
			(context.operation === "headBucket" &&
				(statusCode === 404 || name === "NotFound")) ||
			(!context.key && (statusCode === 404 || name === "NotFound"))
		) {
			return new NotFoundError(
				`Bucket '${context.bucket || "unknown"}' does not exist.`,
				{ ...context, statusCode },
			);
		}

		if (name === "NoSuchKey" || name === "NotFound" || statusCode === 404) {
			return new NotFoundError(
				`Object '${context.key || "unknown"}' not found in bucket '${context.bucket || "unknown"}'.`,
				{ ...context, statusCode },
			);
		}

		// 2. Authentication & Authorization
		if (
			name === "InvalidAccessKeyId" ||
			name === "SignatureDoesNotMatch" ||
			name === "InvalidToken" ||
			name === "ExpiredToken"
		) {
			return new AuthenticationError(
				`Authentication failed: ${message}`,
				{ ...context, statusCode },
				"Check your access key, secret key, and token validity.",
			);
		}

		if (name === "AccessDenied" || statusCode === 403) {
			return new AuthorizationError(
				`Access denied to bucket '${context.bucket || "unknown"}': ${message}`,
				{ ...context, statusCode },
				"Ensure your credentials have permissions for this S3 operation.",
			);
		}

		// 3. Rate limiting & Quotas
		if (
			name === "SlowDown" ||
			statusCode === 503 ||
			name === "TooManyRequestsException"
		) {
			return new StorageLimitError(
				`Storage rate limit or quota exceeded: ${message}`,
				{ ...context, statusCode },
			);
		}

		// 4. Network & Connection
		if (
			name === "NetworkingError" ||
			name === "TimeoutError" ||
			name === "ECONNREFUSED" ||
			name === "ENOTFOUND" ||
			name === "ETIMEDOUT" ||
			(statusCode && statusCode >= 500)
		) {
			return new NetworkError(
				`Network or server connection failed: ${message}`,
				{ ...context, statusCode },
				err,
			);
		}

		// 5. Bucket / Configuration errors
		if (
			name === "InvalidBucketName" ||
			name === "IllegalLocationConstraintException" ||
			name === "PermanentRedirect" ||
			statusCode === 301
		) {
			return new ConfigurationError(
				`Invalid bucket, region, or endpoint configuration: ${message}`,
				{ ...context, statusCode },
				"Verify the bucket name, region, endpoint URL, and addressing style.",
			);
		}

		return new VaultError({
			message: `S3 Error (${name || "Unknown"}): ${message}`,
			code: "ERR_S3_OPERATION",
			category:
				statusCode && statusCode >= 500
					? ("network" as any)
					: ("internal" as any),
			retryable: Boolean(statusCode && statusCode >= 500),
			details: { ...context, statusCode, originalName: name },
			cause: err,
		});
	}
}
