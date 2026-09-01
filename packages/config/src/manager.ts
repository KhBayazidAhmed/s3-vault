import { ConfigurationError } from "@S3-vault-CLI/domain";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { VaultPaths } from "./paths.js";
import {
	type GlobalConfig,
	GlobalConfigSchema,
	type StorageProfileConfig,
	StorageProfileSchema,
} from "./schema.js";

export class ConfigManager {
	private configPath: string;

	constructor(customConfigPath?: string) {
		this.configPath = customConfigPath ?? VaultPaths.getConfigPath();
	}

	load(): GlobalConfig {
		if (!existsSync(this.configPath)) {
			return {
				version: "1.0",
				profiles: {},
				defaultTransferSettings: {
					concurrency: 8,
					multipartThresholdBytes: 16 * 1024 * 1024,
					partSizeBytes: 8 * 1024 * 1024,
					maxRetries: 3,
					retryBaseDelayMs: 500,
					retryMaxDelayMs: 10000,
					verifyChecksum: true,
				},
			};
		}

		try {
			const raw = readFileSync(this.configPath, "utf-8");
			const parsed = JSON.parse(raw);
			return GlobalConfigSchema.parse(parsed);
		} catch (err: unknown) {
			throw new ConfigurationError(
				`Failed to parse configuration file at ${this.configPath}`,
				{
					path: this.configPath,
					cause: err instanceof Error ? err.message : String(err),
				},
				"Check that config.json contains valid JSON matching the schema.",
			);
		}
	}

	save(config: GlobalConfig): void {
		VaultPaths.ensureVaultDirs();
		const validated = GlobalConfigSchema.parse(config);
		writeFileSync(this.configPath, JSON.stringify(validated, null, 2), {
			mode: 0o600,
		});
	}

	getProfile(name?: string): StorageProfileConfig {
		const config = this.load();
		const profileName = name || config.activeProfile;

		if (!profileName) {
			const profiles = Object.keys(config.profiles);
			if (profiles.length === 1 && profiles[0]) {
				const singleProfile = config.profiles[profiles[0]];
				if (singleProfile) return singleProfile;
			}
			throw new ConfigurationError(
				"No active storage profile set and none specified.",
				{ availableProfiles: profiles },
				"Create a profile using `vault init` or select one with `vault profile use <name>`.",
			);
		}

		const profile = config.profiles[profileName];
		if (!profile) {
			throw new ConfigurationError(
				`Profile '${profileName}' does not exist.`,
				{
					profile: profileName,
					availableProfiles: Object.keys(config.profiles),
				},
				`Run 'vault profile list' to see available profiles or 'vault init --name ${profileName}' to create it.`,
			);
		}

		return profile;
	}

	listProfiles(): {
		name: string;
		isDefault: boolean;
		isActive: boolean;
		profile: StorageProfileConfig;
	}[] {
		const config = this.load();
		return Object.entries(config.profiles).map(([name, profile]) => ({
			name,
			isDefault: Boolean(profile.isDefault),
			isActive: config.activeProfile === name,
			profile,
		}));
	}

	saveProfile(profile: StorageProfileConfig): void {
		const validated = StorageProfileSchema.parse(profile);
		const config = this.load();

		const isFirstProfile = Object.keys(config.profiles).length === 0;

		const now = new Date().toISOString();
		const updatedProfile: StorageProfileConfig = {
			...validated,
			createdAt: config.profiles[profile.name]?.createdAt || now,
			updatedAt: now,
		};

		config.profiles[profile.name] = updatedProfile;

		if (isFirstProfile || profile.isDefault || !config.activeProfile) {
			config.activeProfile = profile.name;
		}

		this.save(config);
		VaultPaths.ensureVaultDirs(profile.name);
	}

	setActiveProfile(name: string): void {
		const config = this.load();
		if (!config.profiles[name]) {
			throw new ConfigurationError(
				`Cannot set active profile to '${name}': profile does not exist.`,
				{ profile: name },
			);
		}
		config.activeProfile = name;
		this.save(config);
	}

	removeProfile(name: string): void {
		const config = this.load();
		if (!config.profiles[name]) {
			throw new ConfigurationError(
				`Cannot remove profile '${name}': profile does not exist.`,
				{ profile: name },
			);
		}

		delete config.profiles[name];
		if (config.activeProfile === name) {
			const remaining = Object.keys(config.profiles);
			config.activeProfile = remaining[0];
		}

		this.save(config);
	}
}
