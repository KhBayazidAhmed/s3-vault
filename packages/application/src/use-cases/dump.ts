import type { CliConfigOverrides } from "@S3-vault-CLI/config";
import type { ServiceContext } from "../service-context.js";
import { SnapshotsUseCase } from "./snapshots.js";

export interface DumpOptions extends CliConfigOverrides {
	sourcePrefix?: string;
	format?: "json" | "csv";
}

export class DumpUseCase {
	constructor(private context: ServiceContext) {}

	async execute(options: DumpOptions = {}): Promise<string> {
		const snapshotsUseCase = new SnapshotsUseCase(this.context);
		const manifest = await snapshotsUseCase.create(
			options.sourcePrefix,
			options,
		);
		const format = options.format ?? "json";

		return this.context.snapshotRepo.exportManifest(manifest, format);
	}
}
