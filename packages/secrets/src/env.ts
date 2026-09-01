import type { SecretCredentials, SecretProvider } from "./types.js";

export class EnvironmentSecretProvider implements SecretProvider {
	name = "environment";
	private env: Record<string, string | undefined>;

	constructor(env: Record<string, string | undefined> = process.env) {
		this.env = env;
	}

	async isAvailable(): Promise<boolean> {
		return true;
	}

	async getCredentials(profileName: string): Promise<SecretCredentials | null> {
		// 1. Profile-specific environment variables: S3_VAULT_KEY_ID_<PROFILE>
		const sanitizedProfile = profileName
			.toUpperCase()
			.replace(/[^A-Z0-9]/g, "_");
		const profileKeyId = this.env[`S3_VAULT_KEY_ID_${sanitizedProfile}`];
		const profileSecret = this.env[`S3_VAULT_SECRET_KEY_${sanitizedProfile}`];
		const profileToken = this.env[`S3_VAULT_SESSION_TOKEN_${sanitizedProfile}`];

		if (profileKeyId && profileSecret) {
			return {
				accessKeyId: profileKeyId,
				secretAccessKey: profileSecret,
				sessionToken: profileToken,
			};
		}

		// 2. Generic AWS environment variables
		const awsKeyId =
			this.env.AWS_ACCESS_KEY_ID || this.env.S3_VAULT_ACCESS_KEY_ID;
		const awsSecret =
			this.env.AWS_SECRET_ACCESS_KEY || this.env.S3_VAULT_SECRET_ACCESS_KEY;
		const awsToken =
			this.env.AWS_SESSION_TOKEN || this.env.S3_VAULT_SESSION_TOKEN;

		if (awsKeyId && awsSecret) {
			return {
				accessKeyId: awsKeyId,
				secretAccessKey: awsSecret,
				sessionToken: awsToken,
			};
		}

		return null;
	}

	async setCredentials(): Promise<void> {
		// Environment variables are read-only at runtime
	}

	async deleteCredentials(): Promise<void> {
		// Environment variables cannot be deleted permanently
	}
}
