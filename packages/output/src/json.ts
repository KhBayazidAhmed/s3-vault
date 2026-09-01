import { VaultError } from "@S3-vault-CLI/domain";
import { defaultRedactor } from "@S3-vault-CLI/secrets";

export interface JsonSuccessEnvelope<T = unknown> {
	success: true;
	code: "OK";
	data: T;
	timestamp: string;
}

export interface JsonErrorEnvelope {
	success: false;
	code: string;
	category: string;
	message: string;
	exitCode: number;
	retryable: boolean;
	suggestion?: string;
	details?: Record<string, unknown>;
	timestamp: string;
}

export class JsonOutput {
	static success<T>(data: T): string {
		const envelope: JsonSuccessEnvelope<T> = {
			success: true,
			code: "OK",
			data,
			timestamp: new Date().toISOString(),
		};

		const redacted = defaultRedactor.redactObject(envelope);
		return JSON.stringify(redacted, null, 2);
	}

	static error(err: unknown): string {
		const isVault = err instanceof VaultError;
		const errorObj = isVault
			? err
			: new VaultError({
					message: err instanceof Error ? err.message : String(err),
					code: "ERR_UNKNOWN",
					category: "internal" as any,
					exitCode: 1,
				});

		const envelope: JsonErrorEnvelope = {
			success: false,
			code: errorObj.code,
			category: errorObj.category,
			message: errorObj.message,
			exitCode: errorObj.exitCode,
			retryable: errorObj.retryable,
			suggestion: errorObj.suggestion,
			details: errorObj.details,
			timestamp: new Date().toISOString(),
		};

		const redacted = defaultRedactor.redactObject(envelope);
		return JSON.stringify(redacted, null, 2);
	}
}
