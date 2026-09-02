import {
	DeleteUseCase,
	ListObjectsUseCase,
	ObjectInfoUseCase,
	SearchUseCase,
	type ServiceContext,
} from "@S3-vault-CLI/application";
import { colors, Formatter, logger } from "@S3-vault-CLI/output";
import type { Command } from "commander";
import type { HandleAction } from "./shared.js";

export function registerObjectCommands(
	program: Command,
	context: ServiceContext,
	handleAction: HandleAction,
): void {
	program
		.command("ls [path]")
		.description("List objects in bucket or prefix")
		.option("-r, --recursive", "List recursively", true)
		.option("-m, --max-keys <number>", "Maximum keys to list", (v) =>
			Number.parseInt(v, 10),
		)
		.action(async (path, cmdOpts) => {
			await handleAction(async (globalOpts) => {
				const objects = await new ListObjectsUseCase(context).execute({
					path,
					recursive: cmdOpts.recursive,
					maxKeys: cmdOpts.maxKeys,
					...globalOpts,
				});
				if (!globalOpts.json) {
					const rows = objects.map((obj) => [
						obj.key,
						Formatter.formatBytes(obj.size),
						Formatter.formatRelativeTime(obj.lastModified),
						obj.storageClass || "STANDARD",
					]);
					console.log(
						Formatter.renderTable(
							["KEY", "SIZE", "MODIFIED", "STORAGE CLASS"],
							rows,
						),
					);
				}
				return objects;
			});
		});

	program
		.command("info <path>")
		.description("Show object metadata, ETag, checksum, and timestamps")
		.action(async (path) => {
			await handleAction(async (globalOpts) => {
				const meta = await new ObjectInfoUseCase(context).execute(
					path,
					globalOpts,
				);
				if (!globalOpts.json) {
					console.log(colors.bold(`Object: ${meta.key}`));
					console.log(
						`  Size:           ${Formatter.formatBytes(meta.size)} (${meta.size} bytes)`,
					);
					console.log(
						`  Last Modified:  ${new Date(meta.lastModified).toISOString()}`,
					);
					console.log(`  ETag:           ${meta.etag}`);
					console.log(
						`  SHA-256:        ${meta.checksumSha256 || colors.dim("none")}`,
					);
					console.log(
						`  Content-Type:   ${meta.contentType || "application/octet-stream"}`,
					);
					console.log(`  Storage Class:  ${meta.storageClass || "STANDARD"}`);
					if (meta.userMetadata && Object.keys(meta.userMetadata).length > 0) {
						console.log(
							`  User Metadata:  ${JSON.stringify(meta.userMetadata)}`,
						);
					}
				}
				return meta;
			});
		});

	program
		.command("rm <path>")
		.alias("delete")
		.description("Delete remote object or directory prefix from storage")
		.option(
			"-r, --recursive",
			"Recursively delete all objects under prefix",
			false,
		)
		.option(
			"--dry-run",
			"Preview objects that would be deleted without removing them",
			false,
		)
		.action(async (path, cmdOpts) => {
			await handleAction(async (globalOpts) => {
				const result = await new DeleteUseCase(context).execute({
					path,
					recursive: cmdOpts.recursive,
					dryRun: cmdOpts.dryRun,
					...globalOpts,
				});
				if (!globalOpts.json) {
					if (result.dryRun) {
						logger.info(
							`[DRY-RUN] Would delete ${result.deletedCount} object(s):`,
						);
						for (const key of result.deletedKeys) {
							console.log(`  - ${key}`);
						}
					} else {
						logger.success(
							`Deleted ${result.deletedCount} object(s) from storage.`,
						);
					}
				}
				return result;
			});
		});

	program
		.command("search <query>")
		.description("Search objects by name, prefix, size, or date")
		.option("--prefix <prefix>", "Filter by prefix")
		.option("--min-size <bytes>", "Minimum size in bytes", (v) =>
			Number.parseInt(v, 10),
		)
		.option("--max-size <bytes>", "Maximum size in bytes", (v) =>
			Number.parseInt(v, 10),
		)
		.action(async (query, cmdOpts) => {
			await handleAction(async (globalOpts) => {
				const matches = await new SearchUseCase(context).execute({
					query,
					prefix: cmdOpts.prefix,
					minSizeBytes: cmdOpts.minSize,
					maxSizeBytes: cmdOpts.maxSize,
					...globalOpts,
				});
				if (!globalOpts.json) {
					const rows = matches.map((match) => [
						match.key,
						Formatter.formatBytes(match.size),
						Formatter.formatRelativeTime(match.lastModified),
					]);
					console.log(
						Formatter.renderTable(["MATCHING KEY", "SIZE", "MODIFIED"], rows),
					);
				}
				return matches;
			});
		});
}
