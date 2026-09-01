export enum ErrorCategory {
	CONFIGURATION = "configuration",
	AUTHENTICATION = "authentication",
	AUTHORIZATION = "authorization",
	NETWORK = "network",
	NOT_FOUND = "not_found",
	CONFLICT = "conflict",
	INTEGRITY = "integrity",
	STORAGE_LIMIT = "storage_limit",
	CANCELLATION = "cancellation",
	INTERNAL = "internal",
}

export interface ErrorDetails {
	path?: string;
	provider?: string;
	bucket?: string;
	key?: string;
	statusCode?: number;
	expectedChecksum?: string;
	actualChecksum?: string;
	[key: string]: unknown;
}

export class VaultError extends Error {
	readonly code: string;
	readonly category: ErrorCategory;
	readonly exitCode: number;
	readonly retryable: boolean;
	readonly details: ErrorDetails;
	readonly suggestion?: string;

	constructor(options: {
		message: string;
		code: string;
		category: ErrorCategory;
		exitCode?: number;
		retryable?: boolean;
		details?: ErrorDetails;
		suggestion?: string;
		cause?: unknown;
	}) {
		super(options.message, { cause: options.cause });
		this.name = "VaultError";
		this.code = options.code;
		this.category = options.category;
		this.exitCode = options.exitCode ?? 1;
		this.retryable = options.retryable ?? false;
		this.details = options.details ?? {};
		this.suggestion = options.suggestion;
	}

	toJSON() {
		return {
			name: this.name,
			code: this.code,
			category: this.category,
			message: this.message,
			exitCode: this.exitCode,
			retryable: this.retryable,
			suggestion: this.suggestion,
			details: this.details,
		};
	}
}

export class ConfigurationError extends VaultError {
	constructor(message: string, details?: ErrorDetails, suggestion?: string) {
		super({
			message,
			code: "ERR_CONFIGURATION",
			category: ErrorCategory.CONFIGURATION,
			exitCode: 2,
			retryable: false,
			details,
			suggestion:
				suggestion ??
				"Check your profile configuration with `vault profile show` or run `vault status`.",
		});
		this.name = "ConfigurationError";
	}
}

export class AuthenticationError extends VaultError {
	constructor(message: string, details?: ErrorDetails, suggestion?: string) {
		super({
			message,
			code: "ERR_AUTHENTICATION",
			category: ErrorCategory.AUTHENTICATION,
			exitCode: 3,
			retryable: false,
			details,
			suggestion:
				suggestion ??
				"Verify your access keys and secret keys in the environment or keychain.",
		});
		this.name = "AuthenticationError";
	}
}

export class AuthorizationError extends VaultError {
	constructor(message: string, details?: ErrorDetails, suggestion?: string) {
		super({
			message,
			code: "ERR_AUTHORIZATION",
			category: ErrorCategory.AUTHORIZATION,
			exitCode: 3,
			retryable: false,
			details,
			suggestion:
				suggestion ??
				"Ensure your credentials have permissions for the requested bucket and operation.",
		});
		this.name = "AuthorizationError";
	}
}

export class IntegrityError extends VaultError {
	constructor(message: string, details?: ErrorDetails, suggestion?: string) {
		super({
			message,
			code: "ERR_INTEGRITY",
			category: ErrorCategory.INTEGRITY,
			exitCode: 4,
			retryable: true,
			details,
			suggestion:
				suggestion ??
				"The transferred object failed checksum verification. Retry the transfer or inspect the file.",
		});
		this.name = "IntegrityError";
	}
}

export class NotFoundError extends VaultError {
	constructor(message: string, details?: ErrorDetails) {
		super({
			message,
			code: "ERR_NOT_FOUND",
			category: ErrorCategory.NOT_FOUND,
			exitCode: 1,
			retryable: false,
			details,
			suggestion: "Check that the specified path, object, or bucket exists.",
		});
		this.name = "NotFoundError";
	}
}

export class ConflictError extends VaultError {
	constructor(message: string, details?: ErrorDetails, suggestion?: string) {
		super({
			message,
			code: "ERR_CONFLICT",
			category: ErrorCategory.CONFLICT,
			exitCode: 1,
			retryable: false,
			details,
			suggestion:
				suggestion ??
				"Specify a conflict resolution strategy (--conflict newer|local-wins|remote-wins).",
		});
		this.name = "ConflictError";
	}
}

export class NetworkError extends VaultError {
	constructor(message: string, details?: ErrorDetails, cause?: unknown) {
		super({
			message,
			code: "ERR_NETWORK",
			category: ErrorCategory.NETWORK,
			exitCode: 1,
			retryable: true,
			details,
			suggestion: "Check your network connection and endpoint reachability.",
			cause,
		});
		this.name = "NetworkError";
	}
}

export class StorageLimitError extends VaultError {
	constructor(message: string, details?: ErrorDetails) {
		super({
			message,
			code: "ERR_STORAGE_LIMIT",
			category: ErrorCategory.STORAGE_LIMIT,
			exitCode: 1,
			retryable: false,
			details,
			suggestion:
				"Storage quota exceeded or rate limit hit. Wait before retrying or increase storage quota.",
		});
		this.name = "StorageLimitError";
	}
}

export class CancellationError extends VaultError {
	constructor(message = "Operation cancelled by user") {
		super({
			message,
			code: "ERR_CANCELLED",
			category: ErrorCategory.CANCELLATION,
			exitCode: 130,
			retryable: false,
		});
		this.name = "CancellationError";
	}
}

export class InternalError extends VaultError {
	constructor(message: string, details?: ErrorDetails, cause?: unknown) {
		super({
			message,
			code: "ERR_INTERNAL",
			category: ErrorCategory.INTERNAL,
			exitCode: 1,
			retryable: false,
			details,
			cause,
		});
		this.name = "InternalError";
	}
}
