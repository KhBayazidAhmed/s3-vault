import {
	type ServiceContext,
	SnapshotsUseCase,
} from "@S3-vault-CLI/application";
import { colors, Formatter, logger } from "@S3-vault-CLI/output";
import type { Command } from "commander";
import type { HandleAction } from "./shared.js";

export function registerSnapshotCommands(
	program: Command,
	context: ServiceContext,
	handleAction: HandleAction,
): void {
	const snapCmd = program
		.command("snapshots")
		.description("Manage point-in-time manifests");

	snapCmd
		.command("create [prefix]")
		.description("Create a point-in-time snapshot manifest")
		.action(async (prefix) => {
			await handleAction(async (globalOpts) => {
				const manifest = await new SnapshotsUseCase(context).create(
					prefix,
					globalOpts,
				);
				if (!globalOpts.json) {
					logger.success(
						`Snapshot '${manifest.id}' created with ${manifest.totalObjects} objects (${Formatter.formatBytes(manifest.totalSizeBytes)})`,
					);
					console.log(
						colors.dim(
							`  Root Checksum (SHA-256): ${manifest.rootChecksumSha256}`,
						),
					);
				}
				return manifest;
			});
		});

	snapCmd
		.command("list")
		.description("List all snapshot manifests")
		.action(async () => {
			await handleAction(async (globalOpts) => {
				const list = new SnapshotsUseCase(context).list();
				if (!globalOpts.json) {
					const rows = list.map((snapshot) => [
						snapshot.id,
						`${snapshot.totalObjects} objects`,
						Formatter.formatBytes(snapshot.totalSizeBytes),
						snapshot.prefix || "(root)",
						Formatter.formatRelativeTime(snapshot.createdAt),
					]);
					console.log(
						Formatter.renderTable(
							["SNAPSHOT ID", "OBJECTS", "TOTAL SIZE", "PREFIX", "CREATED"],
							rows,
						),
					);
				}
				return list;
			});
		});

	snapCmd
		.command("inspect <id>")
		.description("Inspect snapshot contents")
		.action(async (id) => {
			await handleAction(async (globalOpts) => {
				const snapshot = new SnapshotsUseCase(context).inspect(id);
				if (!globalOpts.json) {
					console.log(colors.bold(`Snapshot: ${snapshot.id}`));
					console.log(`  Created:       ${snapshot.createdAt}`);
					console.log(`  Total Objects: ${snapshot.totalObjects}`);
					console.log(
						`  Total Size:    ${Formatter.formatBytes(snapshot.totalSizeBytes)}`,
					);
					console.log(`  Root SHA-256:  ${snapshot.rootChecksumSha256}`);
					const rows = snapshot.entries
						.slice(0, 20)
						.map((entry) => [
							entry.path,
							Formatter.formatBytes(entry.size),
							entry.etag,
							entry.checksumSha256 || "-",
						]);
					console.log(
						Formatter.renderTable(["PATH", "SIZE", "ETAG", "SHA-256"], rows),
					);
					if (snapshot.entries.length > 20) {
						console.log(
							colors.dim(
								`... and ${snapshot.entries.length - 20} more objects.`,
							),
						);
					}
				}
				return snapshot;
			});
		});

	snapCmd
		.command("compare <idA> <idB>")
		.description("Compare two snapshot manifests")
		.action(async (idA, idB) => {
			await handleAction(async (globalOpts) => {
				const diff = new SnapshotsUseCase(context).compare(idA, idB);
				if (!globalOpts.json) {
					console.log(colors.bold(`Snapshot Diff: ${idA} -> ${idB}`));
					console.log(`  Added:     ${colors.green(`+${diff.added.length}`)}`);
					console.log(`  Removed:   ${colors.red(`-${diff.removed.length}`)}`);
					console.log(
						`  Modified:  ${colors.yellow(`~${diff.modified.length}`)}`,
					);
					console.log(`  Unchanged: ${diff.unchangedCount}`);
					console.log(
						`  Size Delta: ${Formatter.formatBytes(diff.totalSizeDelta)}`,
					);
				}
				return diff;
			});
		});
}
