import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export class VaultPaths {
	static getVaultHome(): string {
		if (process.env.VAULT_HOME) {
			return process.env.VAULT_HOME;
		}
		if (process.env.XDG_CONFIG_HOME) {
			return join(process.env.XDG_CONFIG_HOME, "vault");
		}
		return join(homedir(), ".vault");
	}

	static getConfigPath(): string {
		return join(VaultPaths.getVaultHome(), "config.json");
	}

	static getStateDbPath(): string {
		return join(VaultPaths.getVaultHome(), "state.db");
	}

	static getSnapshotsDir(profileName?: string): string {
		const base = join(VaultPaths.getVaultHome(), "snapshots");
		return profileName ? join(base, profileName) : base;
	}

	static getLogsDir(): string {
		return join(VaultPaths.getVaultHome(), "logs");
	}

	static getCredentialsPath(): string {
		return join(VaultPaths.getVaultHome(), "credentials.enc");
	}

	static ensureVaultDirs(profileName?: string): void {
		const vaultHome = VaultPaths.getVaultHome();
		if (!existsSync(vaultHome)) {
			mkdirSync(vaultHome, { recursive: true, mode: 0o700 });
		}

		const snapshotsDir = VaultPaths.getSnapshotsDir(profileName);
		if (!existsSync(snapshotsDir)) {
			mkdirSync(snapshotsDir, { recursive: true, mode: 0o700 });
		}

		const logsDir = VaultPaths.getLogsDir();
		if (!existsSync(logsDir)) {
			mkdirSync(logsDir, { recursive: true, mode: 0o700 });
		}
	}
}
