import type { StorageProfileConfig } from "@S3-vault-CLI/config";
import type { ServiceContext } from "../service-context.js";

export class ProfileUseCase {
	constructor(private context: ServiceContext) {}

	list(): {
		name: string;
		isDefault: boolean;
		isActive: boolean;
		profile: StorageProfileConfig;
	}[] {
		return this.context.configManager.listProfiles();
	}

	show(name?: string): StorageProfileConfig {
		return this.context.configManager.getProfile(name);
	}

	use(name: string): void {
		this.context.configManager.setActiveProfile(name);
	}

	remove(name: string): void {
		this.context.configManager.removeProfile(name);
	}
}
