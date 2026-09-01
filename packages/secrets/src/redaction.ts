export class RedactionEngine {
	private knownSecrets: Set<string> = new Set();

	registerSecret(secret?: string): void {
		if (secret && secret.length > 3) {
			this.knownSecrets.add(secret);
		}
	}

	redact(input: string): string {
		let result = input;

		// 1. Redact known registered secrets
		for (const secret of this.knownSecrets) {
			result = result.replaceAll(secret, "[REDACTED]");
		}

		// 2. Redact AWS Secret Keys (40-character base64/alphanumeric strings)
		result = result.replace(
			/(AWS_SECRET_ACCESS_KEY\s*[:=]\s*)[A-Za-z0-9/+=]{30,}/gi,
			"$1[REDACTED]",
		);
		result = result.replace(
			/(secretAccessKey\s*[:=]\s*['"])[A-Za-z0-9/+=]{30,}(['"])/gi,
			"$1[REDACTED]$2",
		);

		// 3. Redact AWS S3 Authorization Headers
		result = result.replace(
			/(AWS4-HMAC-SHA256\s+Credential=[^,]+,\s*SignedHeaders=[^,]+,\s*Signature=)[a-f0-9]{64}/gi,
			"$1[REDACTED]",
		);

		// 4. Redact Presigned URL query params (X-Amz-Signature, X-Amz-Security-Token, X-Amz-Credential)
		result = result.replace(/(X-Amz-Signature=)[a-f0-9]{64}/gi, "$1[REDACTED]");
		result = result.replace(
			/(X-Amz-Security-Token=)[A-Za-z0-9%_+/=-]+/gi,
			"$1[REDACTED]",
		);

		// 5. Redact Bearer / API tokens
		result = result.replace(/(Bearer\s+)[A-Za-z0-9._-]{20,}/gi, "$1[REDACTED]");

		return result;
	}

	redactObject<T>(obj: T): T {
		if (obj === null || obj === undefined) return obj;
		if (typeof obj === "string") return this.redact(obj) as unknown as T;
		if (typeof obj !== "object") return obj;

		if (Array.isArray(obj)) {
			return obj.map((item) => this.redactObject(item)) as unknown as T;
		}

		const copy: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
			const lowerKey = key.toLowerCase();
			if (
				lowerKey.includes("secret") ||
				lowerKey.includes("password") ||
				lowerKey.includes("token") ||
				(lowerKey.includes("key") &&
					(lowerKey.includes("access") || lowerKey.includes("private")))
			) {
				copy[key] = "[REDACTED]";
			} else {
				copy[key] = this.redactObject(val);
			}
		}

		return copy as T;
	}
}

export const defaultRedactor = new RedactionEngine();
