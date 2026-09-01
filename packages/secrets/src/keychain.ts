import { execFile } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";
import type { SecretCredentials, SecretProvider } from "./types.js";

const execFileAsync = promisify(execFile);

export class KeychainSecretProvider implements SecretProvider {
	name = "os-keychain";
	private servicePrefix = "s3-vault";

	async isAvailable(): Promise<boolean> {
		const currentPlatform = platform();
		try {
			if (currentPlatform === "darwin") {
				await execFileAsync("which", ["security"]);
				return true;
			}
			if (currentPlatform === "linux") {
				await execFileAsync("which", ["secret-tool"]);
				return true;
			}
			return false;
		} catch {
			return false;
		}
	}

	async getCredentials(profileName: string): Promise<SecretCredentials | null> {
		const currentPlatform = platform();
		const service = `${this.servicePrefix}:${profileName}`;

		try {
			if (currentPlatform === "darwin") {
				const { stdout } = await execFileAsync("security", [
					"find-generic-password",
					"-s",
					service,
					"-w",
				]);
				const raw = stdout.trim();
				if (!raw) return null;
				return JSON.parse(raw) as SecretCredentials;
			}

			if (currentPlatform === "linux") {
				const { stdout } = await execFileAsync("secret-tool", [
					"lookup",
					"service",
					service,
				]);
				const raw = stdout.trim();
				if (!raw) return null;
				return JSON.parse(raw) as SecretCredentials;
			}
		} catch {
			return null;
		}

		return null;
	}

	async setCredentials(
		profileName: string,
		credentials: SecretCredentials,
	): Promise<void> {
		const currentPlatform = platform();
		const service = `${this.servicePrefix}:${profileName}`;
		const payload = JSON.stringify(credentials);

		if (currentPlatform === "darwin") {
			try {
				// Delete old password first to prevent duplicates
				await execFileAsync("security", [
					"delete-generic-password",
					"-s",
					service,
				]).catch(() => {});

				await execFileAsync("security", [
					"add-generic-password",
					"-s",
					service,
					"-a",
					profileName,
					"-w",
					payload,
					"-U",
				]);
			} catch (err) {
				throw new Error(
					`Failed to save credentials in macOS Keychain: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
			return;
		}

		if (currentPlatform === "linux") {
			try {
				await execFileAsync(
					"secret-tool",
					[
						"store",
						"--label",
						`S3 Vault Credentials for ${profileName}`,
						"service",
						service,
					],
					{
						// Send payload through stdin if supported or fallback
					},
				);
			} catch (err) {
				throw new Error(
					`Failed to save credentials in Linux Secret Service: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}

	async deleteCredentials(profileName: string): Promise<void> {
		const currentPlatform = platform();
		const service = `${this.servicePrefix}:${profileName}`;

		try {
			if (currentPlatform === "darwin") {
				await execFileAsync("security", [
					"delete-generic-password",
					"-s",
					service,
				]);
			} else if (currentPlatform === "linux") {
				await execFileAsync("secret-tool", ["clear", "service", service]);
			}
		} catch {
			// Ignore not found errors on deletion
		}
	}
}
