import type { CliConfigOverrides } from "@S3-vault-CLI/config";
import type { SnapshotDiff, SnapshotManifest } from "@S3-vault-CLI/domain";
import type { ServiceContext } from "../service-context.js";
import { ListObjectsUseCase } from "./list-objects.js";

export class SnapshotsUseCase {
	constructor(private context: ServiceContext) {}

	async create(
		prefix?: string,
		options: CliConfigOverrides = {},
	): Promise<SnapshotManifest> {
		const { runtimeConfig } =
			await this.context.resolveStorageWithCredentials(options);
		const listUseCase = new ListObjectsUseCase(this.context);
		const objects = await listUseCase.execute({ ...options, path: prefix });

		const entries = objects.map((obj) => ({
			path: obj.key,
			size: obj.size,
			lastModified: new Date(obj.lastModified).toISOString(),
			etag: obj.etag,
			checksumSha256: obj.checksumSha256,
			storageClass: obj.storageClass,
			metadata: obj.userMetadata,
		}));

		return this.context.snapshotRepo.createSnapshot(
			runtimeConfig.profileName,
			runtimeConfig.bucket,
			entries,
			prefix,
		);
	}

	list(profileName?: string): SnapshotManifest[] {
		const profile = this.context.configManager.getProfile(profileName);
		return this.context.snapshotRepo.listSnapshots(profile.name);
	}

	inspect(snapshotId: string, profileName?: string): SnapshotManifest {
		const profile = this.context.configManager.getProfile(profileName);
		return this.context.snapshotRepo.getSnapshot(profile.name, snapshotId);
	}

	compare(
		snapshotAId: string,
		snapshotBId: string,
		profileName?: string,
	): SnapshotDiff {
		const profile = this.context.configManager.getProfile(profileName);
		return this.context.snapshotRepo.compareSnapshots(
			profile.name,
			snapshotAId,
			snapshotBId,
		);
	}
}
