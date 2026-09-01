import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EncryptedFileSecretProvider } from "../src/encrypted-file.js";
import { EnvironmentSecretProvider } from "../src/env.js";
import { RedactionEngine } from "../src/redaction.js";

describe("Secrets: Providers & Redaction", () => {
	let tempDir: string;
	let encFilePath: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "vault-secrets-test-"));
		encFilePath = join(tempDir, "credentials.enc");
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("reads credentials from profile-specific and generic environment variables", async () => {
		const envProvider = new EnvironmentSecretProvider({
			S3_VAULT_KEY_ID_PROD_R2: "r2-profile-key",
			S3_VAULT_SECRET_KEY_PROD_R2: "r2-profile-secret",
			AWS_ACCESS_KEY_ID: "aws-generic-key",
			AWS_SECRET_ACCESS_KEY: "aws-generic-secret",
		});

		const r2Creds = await envProvider.getCredentials("prod-r2");
		expect(r2Creds?.accessKeyId).toBe("r2-profile-key");
		expect(r2Creds?.secretAccessKey).toBe("r2-profile-secret");

		const fallbackCreds = await envProvider.getCredentials("other-profile");
		expect(fallbackCreds?.accessKeyId).toBe("aws-generic-key");
		expect(fallbackCreds?.secretAccessKey).toBe("aws-generic-secret");
	});

	it("encrypts and decrypts credentials in local file provider", async () => {
		const fileProvider = new EncryptedFileSecretProvider(encFilePath);
		await fileProvider.setCredentials("backup-profile", {
			accessKeyId: "KEY12345",
			secretAccessKey: "SECRET67890",
		});

		const loaded = await fileProvider.getCredentials("backup-profile");
		expect(loaded?.accessKeyId).toBe("KEY12345");
		expect(loaded?.secretAccessKey).toBe("SECRET67890");

		await fileProvider.deleteCredentials("backup-profile");
		const afterDelete = await fileProvider.getCredentials("backup-profile");
		expect(afterDelete).toBeNull();
	});

	it("redacts sensitive tokens, URLs, and secrets from text and objects", () => {
		const redactor = new RedactionEngine();
		redactor.registerSecret("super-secret-password-123");

		const textWithSecret =
			"User entered secret super-secret-password-123 in config";
		expect(redactor.redact(textWithSecret)).toBe(
			"User entered secret [REDACTED] in config",
		);

		const urlWithSignature =
			"https://s3.amazonaws.com/bucket/file.zip?X-Amz-Signature=abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789&AWSAccessKeyId=KEY";
		expect(redactor.redact(urlWithSignature)).toContain(
			"X-Amz-Signature=[REDACTED]",
		);

		const obj = {
			name: "profile1",
			secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
			nested: {
				password: "xyz",
				publicData: "visible",
			},
		};
		const redactedObj = redactor.redactObject(obj);
		expect(redactedObj.secretAccessKey).toBe("[REDACTED]");
		expect(redactedObj.nested.password).toBe("[REDACTED]");
		expect(redactedObj.nested.publicData).toBe("visible");
	});
});
