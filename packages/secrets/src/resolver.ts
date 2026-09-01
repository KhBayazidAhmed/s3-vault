import { AuthenticationError } from "@S3-vault-CLI/domain";
import { EncryptedFileSecretProvider } from "./encrypted-file.js";
import { EnvironmentSecretProvider } from "./env.js";
import { KeychainSecretProvider } from "./keychain.js";
import type { SecretCredentials, SecretProvider } from "./types.js";

export class MultiTierSecretResolver {
	private providers: SecretProvider[];

	constructor(providers?: SecretProvider[]) {
		this.providers = providers ?? [
			new EnvironmentSecretProvider(),
			new KeychainSecretProvider(),
			new EncryptedFileSecretProvider(),
		];
	}

	async resolve(
		profileName: string,
		required = true,
	): Promise<SecretCredentials | null> {
		for (const provider of this.providers) {
			try {
				const available = await provider.isAvailable();
				if (!available) continue;

				const creds = await provider.getCredentials(profileName);
				if (creds && creds.accessKeyId && creds.secretAccessKey) {
					return creds;
				}
			} catch {
				// Fall through to next provider
			}
		}

		if (required) {
			throw new AuthenticationError(
				`No credentials found for profile '${profileName}'.`,
				{ profile: profileName },
				"Set AWS_ACCESS_KEY_ID & AWS_SECRET_ACCESS_KEY or store credentials with `vault init` / `vault profile`.",
			);
		}

		return null;
	}

	async save(
		profileName: string,
		credentials: SecretCredentials,
		preferKeychain = true,
	): Promise<string> {
		// Try keychain first if requested and available
		if (preferKeychain) {
			const keychain = this.providers.find((p) => p.name === "os-keychain");
			if (keychain && (await keychain.isAvailable())) {
				try {
					await keychain.setCredentials(profileName, credentials);
					return "os-keychain";
				} catch {
					// Fall back to encrypted file
				}
			}
		}

		// Fall back to encrypted file provider
		const fileProvider = this.providers.find(
			(p) => p.name === "encrypted-file",
		);
		if (fileProvider) {
			await fileProvider.setCredentials(profileName, credentials);
			return "encrypted-file";
		}

		throw new Error("No available storage provider to save credentials.");
	}

	async delete(profileName: string): Promise<void> {
		for (const provider of this.providers) {
			try {
				if (await provider.isAvailable()) {
					await provider.deleteCredentials(profileName);
				}
			} catch {
				// Ignore deletion failures
			}
		}
	}
}
