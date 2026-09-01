import { VaultPaths } from "@S3-vault-CLI/config";
import {
	createCipheriv,
	createDecipheriv,
	pbkdf2Sync,
	randomBytes,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import type { SecretCredentials, SecretProvider } from "./types.js";

interface EncryptedVaultPayload {
	version: "1.0";
	salt: string; // hex
	iv: string; // hex
	authTag: string; // hex
	ciphertext: string; // hex
}

export class EncryptedFileSecretProvider implements SecretProvider {
	name = "encrypted-file";
	private filePath: string;

	constructor(customPath?: string) {
		this.filePath = customPath ?? VaultPaths.getCredentialsPath();
	}

	async isAvailable(): Promise<boolean> {
		return true;
	}

	private deriveKey(salt: Buffer): Buffer {
		// Generate machine & user specific master passphrase
		const machineId = `${userInfo().username}:${hostname()}:s3-vault-secret-store`;
		return pbkdf2Sync(machineId, salt, 100000, 32, "sha256");
	}

	private readAll(): Record<string, SecretCredentials> {
		if (!existsSync(this.filePath)) {
			return {};
		}

		try {
			const raw = readFileSync(this.filePath, "utf-8");
			const payload: EncryptedVaultPayload = JSON.parse(raw);

			const salt = Buffer.from(payload.salt, "hex");
			const iv = Buffer.from(payload.iv, "hex");
			const authTag = Buffer.from(payload.authTag, "hex");
			const ciphertext = Buffer.from(payload.ciphertext, "hex");

			const key = this.deriveKey(salt);
			const decipher = createDecipheriv("aes-256-gcm", key, iv);
			decipher.setAuthTag(authTag);

			const decrypted = Buffer.concat([
				decipher.update(ciphertext),
				decipher.final(),
			]);
			return JSON.parse(decrypted.toString("utf-8"));
		} catch {
			return {};
		}
	}

	private writeAll(data: Record<string, SecretCredentials>): void {
		VaultPaths.ensureVaultDirs();

		const salt = randomBytes(16);
		const iv = randomBytes(12);
		const key = this.deriveKey(salt);

		const cipher = createCipheriv("aes-256-gcm", key, iv);
		const plaintext = Buffer.from(JSON.stringify(data), "utf-8");

		const ciphertext = Buffer.concat([
			cipher.update(plaintext),
			cipher.final(),
		]);
		const authTag = cipher.getAuthTag();

		const payload: EncryptedVaultPayload = {
			version: "1.0",
			salt: salt.toString("hex"),
			iv: iv.toString("hex"),
			authTag: authTag.toString("hex"),
			ciphertext: ciphertext.toString("hex"),
		};

		writeFileSync(this.filePath, JSON.stringify(payload, null, 2), {
			mode: 0o600,
		});
	}

	async getCredentials(profileName: string): Promise<SecretCredentials | null> {
		const all = this.readAll();
		return all[profileName] || null;
	}

	async setCredentials(
		profileName: string,
		credentials: SecretCredentials,
	): Promise<void> {
		const all = this.readAll();
		all[profileName] = credentials;
		this.writeAll(all);
	}

	async deleteCredentials(profileName: string): Promise<void> {
		const all = this.readAll();
		if (all[profileName]) {
			delete all[profileName];
			this.writeAll(all);
		}
	}
}
