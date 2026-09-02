import {
	PullUseCase,
	PushUseCase,
	type ServiceContext,
	SyncUseCase,
} from "@S3-vault-CLI/application";
import {
	ClipboardUtils,
	colors,
	Formatter,
	logger,
	TerminalProgressBar,
} from "@S3-vault-CLI/output";
import { type Command, InvalidArgumentError } from "commander";
import { type HandleAction, parseMiB, parsePositiveInteger } from "./shared.js";

export function registerTransferCommands(
	program: Command,
	context: ServiceContext,
	handleAction: HandleAction,
): void {
	program
		.command("push <source> [target]")
		.description("Upload files or directories to object storage")
		.option("-r, --recursive", "Upload directories recursively", true)
		.option("--include <pattern...>", "Include glob patterns")
		.option("--exclude <pattern...>", "Exclude glob patterns")
		.option("--dry-run", "Show upload plan without executing transfers")
		.option("--no-verify", "Skip post-transfer checksum verification")
		.option(
			"--concurrency <count>",
			"Parallel file uploads and shared multipart part limit",
			parsePositiveInteger,
		)
		.option(
			"--part-size-mib <mib>",
			"Multipart part size in MiB (minimum: 5)",
			parseMiB,
		)
		.option(
			"--multipart-threshold-mib <mib>",
			"Use multipart uploads for files at or above this size in MiB",
			parseMiB,
		)
		.option(
			"--max-retries <count>",
			"Retry attempts for transient upload failures",
			(value: string) => {
				const parsed = Number(value);
				if (!Number.isInteger(parsed) || parsed < 0) {
					throw new InvalidArgumentError("Expected a non-negative integer.");
				}
				return parsed;
			},
		)
		.option(
			"-s, --share",
			"Generate a presigned shareable link immediately after upload",
		)
		.option(
			"-e, --expires <seconds>",
			"Expiration in seconds for shareable link (default: 3600)",
			(v) => Number.parseInt(v, 10),
			3600,
		)
		.option(
			"-f, --force",
			"Force upload even if duplicate remote object exists",
		)
		.action(async (source, target, cmdOpts) => {
			await handleAction(async (globalOpts) => {
				const progressBar = new TerminalProgressBar();
				const result = await new PushUseCase(context).execute({
					source,
					target,
					recursive: cmdOpts.recursive,
					includes: cmdOpts.include,
					excludes: cmdOpts.exclude,
					dryRun: cmdOpts.dryRun,
					verifyChecksum: cmdOpts.verify !== false,
					concurrency: cmdOpts.concurrency,
					partSizeBytes: cmdOpts.partSizeMib,
					multipartThresholdBytes: cmdOpts.multipartThresholdMib,
					maxRetries: cmdOpts.maxRetries,
					force: cmdOpts.force,
					share: cmdOpts.share,
					expiresInSeconds: cmdOpts.expires,
					...globalOpts,
					onProgress: (p) => {
						if (!globalOpts.quiet) progressBar.update(p);
					},
				});

				if (!globalOpts.json) {
					if (result.success) {
						const uploadedCount = result.plan.items.filter(
							(i) => i.action !== "skip",
						).length;
						const skippedCount = result.plan.skips;
						let summary = `✔ Push completed: ${uploadedCount} item(s) uploaded (${Formatter.formatBytes(result.plan.totalBytes)})`;
						if (skippedCount > 0) {
							summary += `, ${skippedCount} duplicate(s) skipped`;
						}
						progressBar.finish(colors.green(summary));
						if (result.shareUrl) {
							const durationStr = Formatter.formatDuration(
								result.shareExpiresInSeconds ?? 3600,
							);
							const copied = await ClipboardUtils.copy(result.shareUrl);
							console.log();
							logger.success(`Shareable link (expires in ${durationStr}):`);
							console.log(colors.cyan(result.shareUrl));
							if (copied) {
								console.log(colors.dim("📋 Copied link to clipboard!"));
							}
						}
					} else {
						progressBar.finish(
							colors.red(`✖ Push failed with ${result.errors.length} error(s)`),
						);
					}
				}
				return result;
			});
		});

	program
		.command("pull <source> [target]")
		.description("Download objects from storage to local filesystem")
		.option("-r, --recursive", "Download recursively", true)
		.option("--dry-run", "Preview download plan without writing local files")
		.action(async (source, target, cmdOpts) => {
			await handleAction(async (globalOpts) => {
				const progressBar = new TerminalProgressBar();
				const result = await new PullUseCase(context).execute({
					source,
					target,
					recursive: cmdOpts.recursive,
					dryRun: cmdOpts.dryRun,
					...globalOpts,
					onProgress: (p) => {
						if (!globalOpts.quiet) progressBar.update(p);
					},
				});
				if (!globalOpts.json) {
					progressBar.finish(
						result.success
							? colors.green(
									`✔ Pull completed: ${result.plan.items.length} items downloaded`,
								)
							: colors.red(
									`✖ Pull failed with ${result.errors.length} error(s)`,
								),
					);
				}
				return result;
			});
		});

	program
		.command("sync <local> <remote>")
		.description("Reconcile local directory and remote object prefix")
		.option("-d, --direction <dir>", "Direction: up, down, or two-way", "up")
		.option(
			"-c, --conflict <policy>",
			"Conflict resolution: ask, newer, local-wins, remote-wins, fail",
			"newer",
		)
		.option(
			"--delete",
			"Delete extraneous files/objects on destination side",
			false,
		)
		.option(
			"--dry-run",
			"Preview reconciliation plan without mutating files",
			false,
		)
		.action(async (local, remote, cmdOpts) => {
			await handleAction(async (globalOpts) => {
				const progressBar = new TerminalProgressBar();
				const result = await new SyncUseCase(context).execute({
					localPath: local,
					remotePath: remote,
					direction: cmdOpts.direction,
					conflictPolicy: cmdOpts.conflict,
					deletePolicy: cmdOpts.delete ? "delete" : "none",
					dryRun: cmdOpts.dryRun,
					...globalOpts,
					onProgress: (p) => {
						if (!globalOpts.quiet) progressBar.update(p);
					},
				});
				if (!globalOpts.json) {
					progressBar.finish(
						result.success
							? colors.green(
									`✔ Sync (${cmdOpts.direction}) completed: +${result.plan.additions} ~${result.plan.updates} -${result.plan.deletions}`,
								)
							: colors.red(
									`✖ Sync failed with ${result.errors.length} error(s)`,
								),
					);
				}
				return result;
			});
		});
}
