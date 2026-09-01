import {
	DeleteUseCase,
	DumpUseCase,
	HistoryUseCase,
	InitProfileUseCase,
	ListObjectsUseCase,
	ObjectInfoUseCase,
	ProfileUseCase,
	PullUseCase,
	PushUseCase,
	SearchUseCase,
	ServiceContext,
	ShareUseCase,
	SnapshotsUseCase,
	StatusUseCase,
	SyncUseCase,
	VerifyUseCase,
} from "@S3-vault-CLI/application";
import { VaultError } from "@S3-vault-CLI/domain";
import {
	ClipboardUtils,
	colors,
	Formatter,
	JsonOutput,
	logger,
	TerminalProgressBar,
} from "@S3-vault-CLI/output";
import { Command } from "commander";
import { CliPrompts } from "./prompts.js";
import { runInteractiveTui } from "./tui-app.js";

export function createCliProgram(
	context: ServiceContext = new ServiceContext(),
): Command {
	const program = new Command();

	program
		.name("vault")
		.description(
			"S3 Vault CLI: Provider-neutral, scriptable file vault for S3-compatible object storage",
		)
		.version("0.1.0")
		.option("--json", "Output results in stable JSON envelope for scripts")
		.option("-q, --quiet", "Suppress progress meters and non-essential output")
		.option("-p, --profile <name>", "Override the active storage profile")
		.option("-b, --bucket <name>", "Override bucket name")
		.option("-r, --region <name>", "Override region")
		.option("-e, --endpoint <url>", "Override endpoint URL")
		.action(async () => {
			if (process.stdout.isTTY && !process.env.CI) {
				await runInteractiveTui(context);
			} else {
				program.outputHelp();
			}
		});

	// Helper to handle command output & errors with exit codes
	const handleAction = async (action: (opts: any) => Promise<any>) => {
		const globalOpts = program.opts();
		try {
			const result = await action(globalOpts);
			if (globalOpts.json && result !== undefined) {
				console.log(JsonOutput.success(result));
			}
			process.exit(0);
		} catch (err: unknown) {
			if (globalOpts.json) {
				console.log(JsonOutput.error(err));
			} else {
				const message = err instanceof Error ? err.message : String(err);
				logger.error(message, err);
				if (err instanceof VaultError && err.suggestion) {
					console.log(colors.dim(`💡 Suggestion: ${err.suggestion}`));
				}
			}

			const exitCode = err instanceof VaultError ? err.exitCode : 1;
			process.exit(exitCode);
		}
	};

	// 1. vault init
	program
		.command("init")
		.description("Create or select a storage profile")
		.option("-n, --name <name>", "Profile name")
		.option(
			"--provider <provider>",
			"Provider (aws-s3, cloudflare-r2, minio, wasabi, custom-s3, mock)",
		)
		.option("-b, --bucket <bucket>", "Bucket name")
		.option("-r, --region <region>", "Region")
		.option("-e, --endpoint <endpoint>", "Custom endpoint URL")
		.option("--prefix <prefix>", "Default prefix/folder")
		.option(
			"--addressing-style <style>",
			"Addressing style (auto, virtual-hosted, path-style)",
		)
		.option("--key <key>", "Access Key ID")
		.option("--secret <secret>", "Secret Access Key")
		.option("--default", "Set as default active profile")
		.action(async (cmdOpts) => {
			await handleAction(async (globalOpts) => {
				let name = cmdOpts.name;
				let provider = cmdOpts.provider;
				let bucket = cmdOpts.bucket || globalOpts.bucket;
				let region = cmdOpts.region || globalOpts.region;
				let endpoint = cmdOpts.endpoint || globalOpts.endpoint;
				let addressingStyle = cmdOpts.addressingStyle;
				let useSsl = true;
				let accessKey = cmdOpts.key;
				let secretKey = cmdOpts.secret;

				// 1. Profile Name
				if (!name && process.stdin.isTTY) {
					name = await CliPrompts.ask("Profile name", "default");
				}

				// 2. Select Storage Provider
				if (!provider && process.stdin.isTTY) {
					provider = await CliPrompts.select("Select storage provider", [
						{ label: "AWS S3 (Amazon Web Services)", value: "aws-s3" },
						{ label: "Cloudflare R2", value: "cloudflare-r2" },
						{ label: "MinIO (Self-hosted)", value: "minio" },
						{ label: "Wasabi Hot Cloud Storage", value: "wasabi" },
						{ label: "Custom S3 Compatible Storage", value: "custom-s3" },
						{
							label: "Mock In-Memory / Local Backend (Testing)",
							value: "mock",
						},
					]);
				}

				// 3. Provider-specific prompts
				if (provider === "custom-s3" && process.stdin.isTTY) {
					if (!endpoint) {
						endpoint = await CliPrompts.ask(
							"Server Endpoint URL (e.g. https://s3.example.com or http://localhost:9000)",
						);
					}
					region = region || "us-east-1";
					addressingStyle = addressingStyle || "path-style";
				} else if (provider === "minio" && process.stdin.isTTY) {
					if (!endpoint) {
						endpoint = await CliPrompts.ask(
							"MinIO Server URL",
							"http://localhost:9000",
						);
					}
					region = region || "us-east-1";
					addressingStyle = addressingStyle || "path-style";
				} else if (provider === "cloudflare-r2" && process.stdin.isTTY) {
					if (!endpoint) {
						const r2Input = await CliPrompts.ask(
							"Cloudflare Account ID or R2 Endpoint URL",
						);
						if (r2Input) {
							if (r2Input.includes("://") || r2Input.includes(".")) {
								endpoint = r2Input;
							} else {
								endpoint = `https://${r2Input}.r2.cloudflarestorage.com`;
							}
						}
					}
					region = region || "auto";
					addressingStyle = addressingStyle || "auto";
				} else if (provider === "wasabi" && process.stdin.isTTY) {
					if (!region) {
						region = await CliPrompts.ask("Wasabi Region", "us-east-1");
					}
				} else if (provider === "aws-s3" && process.stdin.isTTY) {
					if (!region) {
						region = await CliPrompts.ask("AWS Region", "us-east-1");
					}
				}

				// Normalize endpoint URL and infer SSL setting
				if (endpoint) {
					let clean = endpoint.trim().replace(/\/+$/, "");
					if (!/^https?:\/\//i.test(clean)) {
						const isLocal =
							clean.startsWith("localhost") ||
							clean.startsWith("127.0.0.1") ||
							clean.startsWith("0.0.0.0");
						clean = `${isLocal ? "http" : "https"}://${clean}`;
					}
					useSsl = clean.startsWith("https://");
					endpoint = clean;
				}

				// 4. Bucket Name
				if (!bucket && process.stdin.isTTY) {
					bucket = await CliPrompts.ask("Bucket name");
				}

				// 5. Default prefix / folder
				const prefix = cmdOpts.prefix;

				// 6. Access Credentials
				if (provider !== "mock" && !accessKey && process.stdin.isTTY) {
					accessKey = await CliPrompts.ask(
						"Access Key ID (leave empty if using environment variables)",
					);
				}
				if (
					provider !== "mock" &&
					accessKey &&
					!secretKey &&
					process.stdin.isTTY
				) {
					secretKey = await CliPrompts.ask("Secret Access Key");
				}

				// 7. Default profile option
				let isDefault = Boolean(cmdOpts.default);
				if (!isDefault && process.stdin.isTTY) {
					const existingProfiles = context.configManager.listProfiles();
					if (existingProfiles.length === 0) {
						isDefault = true;
					} else {
						isDefault = await CliPrompts.confirm(
							"Set as default active profile?",
							false,
						);
					}
				}

				const useCase = new InitProfileUseCase(context);
				const result = await useCase.execute({
					name: name || "default",
					provider: (provider as any) || "aws-s3",
					bucket: bucket || "my-vault-bucket",
					region,
					endpoint,
					prefix,
					addressingStyle,
					useSsl,
					isDefault,
					credentials:
						accessKey && secretKey
							? { accessKeyId: accessKey, secretAccessKey: secretKey }
							: undefined,
				});

				if (!globalOpts.json) {
					logger.success(
						`Profile '${result.profile.name}' initialized successfully!`,
					);
					if (result.credentialStore) {
						console.log(
							colors.dim(
								`  🔐 Credentials securely saved in ${result.credentialStore}`,
							),
						);
					}
					if (result.connectionTest.ok) {
						console.log(
							colors.green(
								`  ✔ Storage connectivity verified (${result.connectionTest.latencyMs}ms)`,
							),
						);
					} else {
						console.log(
							colors.yellow(
								`  ⚠ Note: Connection test returned: ${result.connectionTest.error || "Unknown"}`,
							),
						);
					}
				}

				return result;
			});
		});

	// 2. vault profile
	const profileCmd = program
		.command("profile")
		.description("Manage storage profiles");

	profileCmd
		.command("list")
		.description("List all configured profiles")
		.action(async () => {
			await handleAction(async (globalOpts) => {
				const useCase = new ProfileUseCase(context);
				const profiles = useCase.list();

				if (!globalOpts.json) {
					const rows = profiles.map((p) => [
						p.isActive ? colors.cyan(`* ${p.name}`) : `  ${p.name}`,
						p.profile.provider,
						p.profile.bucket,
						p.profile.region || "-",
						p.profile.endpoint || "-",
					]);
					console.log(
						Formatter.renderTable(
							["PROFILE", "PROVIDER", "BUCKET", "REGION", "ENDPOINT"],
							rows,
						),
					);
				}
				return profiles;
			});
		});

	profileCmd
		.command("show [name]")
		.description("Show profile details")
		.action(async (name) => {
			await handleAction(async (globalOpts) => {
				const useCase = new ProfileUseCase(context);
				const profile = useCase.show(name);
				if (!globalOpts.json) {
					console.log(colors.bold(`Profile: ${profile.name}`));
					console.log(`  Provider:   ${profile.provider}`);
					console.log(`  Bucket:     ${profile.bucket}`);
					console.log(`  Region:     ${profile.region || "default"}`);
					console.log(`  Endpoint:   ${profile.endpoint || "default"}`);
					console.log(`  Prefix:     ${profile.prefix || "(root)"}`);
					console.log(`  Addressing: ${profile.addressingStyle}`);
				}
				return profile;
			});
		});

	profileCmd
		.command("use <name>")
		.description("Switch active profile")
		.action(async (name) => {
			await handleAction(async (globalOpts) => {
				const useCase = new ProfileUseCase(context);
				useCase.use(name);
				if (!globalOpts.json) {
					logger.success(`Switched active profile to '${name}'.`);
				}
				return { activeProfile: name };
			});
		});

	profileCmd
		.command("remove <name>")
		.description("Remove a profile")
		.action(async (name) => {
			await handleAction(async (globalOpts) => {
				const useCase = new ProfileUseCase(context);
				useCase.remove(name);
				if (!globalOpts.json) {
					logger.success(`Profile '${name}' removed.`);
				}
				return { removed: name };
			});
		});

	// 3. vault status
	program
		.command("status")
		.description(
			"Diagnose active profile connectivity, permissions, and latency",
		)
		.action(async () => {
			await handleAction(async (globalOpts) => {
				const useCase = new StatusUseCase(context);
				const status = await useCase.execute(globalOpts);

				if (!globalOpts.json) {
					const healthIcon = status.health.ok
						? colors.green("✔ OK")
						: colors.red("✖ FAIL");
					console.log(colors.bold("Vault Profile Status:"));
					console.log(`  Profile:      ${status.profileName}`);
					console.log(`  Provider:     ${status.provider}`);
					console.log(`  Bucket:       ${status.bucket}`);
					console.log(
						`  Health:       ${healthIcon} (${status.health.latencyMs}ms)`,
					);
					console.log(
						`  Credentials:  ${status.hasCredentials ? colors.green("Loaded") : colors.yellow("Missing / Unset")}`,
					);
					if (status.health.error) {
						console.log(`  Error:        ${colors.red(status.health.error)}`);
					}
				}
				return status;
			});
		});

	// 4. vault push <source> [target]
	program
		.command("push <source> [target]")
		.description("Upload files or directories to object storage")
		.option("-r, --recursive", "Upload directories recursively", true)
		.option("--include <pattern...>", "Include glob patterns")
		.option("--exclude <pattern...>", "Exclude glob patterns")
		.option("--dry-run", "Show upload plan without executing transfers")
		.option("--no-verify", "Skip post-transfer checksum verification")
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
				const useCase = new PushUseCase(context);
				const progressBar = new TerminalProgressBar();

				const result = await useCase.execute({
					source,
					target,
					recursive: cmdOpts.recursive,
					includes: cmdOpts.include,
					excludes: cmdOpts.exclude,
					dryRun: cmdOpts.dryRun,
					verifyChecksum: cmdOpts.verify !== false,
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

	// 5. vault pull <source> [target]
	program
		.command("pull <source> [target]")
		.description("Download objects from storage to local filesystem")
		.option("-r, --recursive", "Download recursively", true)
		.option("--dry-run", "Preview download plan without writing local files")
		.action(async (source, target, cmdOpts) => {
			await handleAction(async (globalOpts) => {
				const useCase = new PullUseCase(context);
				const progressBar = new TerminalProgressBar();

				const result = await useCase.execute({
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

	// 6. vault sync <local> <remote>
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
				const useCase = new SyncUseCase(context);
				const progressBar = new TerminalProgressBar();

				const result = await useCase.execute({
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

	// 7. vault ls [path]
	program
		.command("ls [path]")
		.description("List objects in bucket or prefix")
		.option("-r, --recursive", "List recursively", true)
		.option("-m, --max-keys <number>", "Maximum keys to list", (v) =>
			Number.parseInt(v, 10),
		)
		.action(async (path, cmdOpts) => {
			await handleAction(async (globalOpts) => {
				const useCase = new ListObjectsUseCase(context);
				const objects = await useCase.execute({
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

	// 8. vault info <path>
	program
		.command("info <path>")
		.description("Show object metadata, ETag, checksum, and timestamps")
		.action(async (path) => {
			await handleAction(async (globalOpts) => {
				const useCase = new ObjectInfoUseCase(context);
				const meta = await useCase.execute(path, globalOpts);

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

	// 9. vault rm <path>
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
				const useCase = new DeleteUseCase(context);
				const result = await useCase.execute({
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
						for (const k of result.deletedKeys) {
							console.log(`  - ${k}`);
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

	// 10. vault search <query>
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
				const useCase = new SearchUseCase(context);
				const matches = await useCase.execute({
					query,
					prefix: cmdOpts.prefix,
					minSizeBytes: cmdOpts.minSize,
					maxSizeBytes: cmdOpts.maxSize,
					...globalOpts,
				});

				if (!globalOpts.json) {
					const rows = matches.map((m) => [
						m.key,
						Formatter.formatBytes(m.size),
						Formatter.formatRelativeTime(m.lastModified),
					]);
					console.log(
						Formatter.renderTable(["MATCHING KEY", "SIZE", "MODIFIED"], rows),
					);
				}

				return matches;
			});
		});

	// 10. vault share <path>
	program
		.command("share <path>")
		.description("Generate a temporary presigned access URL")
		.option(
			"-e, --expires <seconds>",
			"Expiration in seconds",
			(v) => Number.parseInt(v, 10),
			3600,
		)
		.option("-m, --method <method>", "HTTP Method (GET or PUT)", "GET")
		.action(async (path, cmdOpts) => {
			await handleAction(async (globalOpts) => {
				const useCase = new ShareUseCase(context);
				const result = await useCase.execute({
					key: path,
					expiresInSeconds: cmdOpts.expires,
					method: cmdOpts.method.toUpperCase(),
					...globalOpts,
				});

				if (!globalOpts.json) {
					const copied = await ClipboardUtils.copy(result.url);
					logger.success(
						`Presigned URL generated (expires in ${Formatter.formatDuration(result.expiresInSeconds)}):`,
					);
					console.log(colors.cyan(result.url));
					if (copied) {
						console.log(colors.dim("📋 Copied link to clipboard!"));
					}
				}

				return result;
			});
		});

	// 11. vault verify <path> <remoteKey>
	program
		.command("verify <path> <remoteKey>")
		.description(
			"Validate local and remote integrity with checksum verification",
		)
		.action(async (path, remoteKey) => {
			await handleAction(async (globalOpts) => {
				const useCase = new VerifyUseCase(context);
				const result = await useCase.execute(path, remoteKey, globalOpts);

				if (!globalOpts.json) {
					if (result.isMatch) {
						logger.success(
							`Integrity verified! Local and remote ${result.algorithm.toUpperCase()} match: ${result.localChecksum}`,
						);
					} else {
						logger.error(`Integrity mismatch for ${result.remoteKey}!`);
						console.log(`  Local Checksum:  ${result.localChecksum}`);
						console.log(`  Remote Checksum: ${result.remoteChecksum}`);
						if (result.repairHint) {
							console.log(colors.yellow(`  Repair: ${result.repairHint}`));
						}
					}
				}

				return result;
			});
		});

	// 12. vault history
	program
		.command("history")
		.description("Show local transfer history")
		.option(
			"-l, --limit <number>",
			"Limit number of records",
			(v) => Number.parseInt(v, 10),
			20,
		)
		.action(async (cmdOpts) => {
			await handleAction(async (globalOpts) => {
				const useCase = new HistoryUseCase(context);
				const history = useCase.execute({ limit: cmdOpts.limit });

				if (!globalOpts.json) {
					const rows = history.map((h) => [
						h.id,
						h.direction.toUpperCase(),
						h.status === "completed"
							? colors.green("completed")
							: h.status === "failed"
								? colors.red("failed")
								: h.status,
						`${h.totalItems} items`,
						Formatter.formatBytes(h.totalBytes),
						Formatter.formatRelativeTime(h.createdAt),
					]);
					console.log(
						Formatter.renderTable(
							["JOB ID", "DIRECTION", "STATUS", "ITEMS", "TOTAL BYTES", "WHEN"],
							rows,
						),
					);
				}

				return history;
			});
		});

	// 13. vault snapshots
	const snapCmd = program
		.command("snapshots")
		.description("Manage point-in-time manifests");

	snapCmd
		.command("create [prefix]")
		.description("Create a point-in-time snapshot manifest")
		.action(async (prefix) => {
			await handleAction(async (globalOpts) => {
				const useCase = new SnapshotsUseCase(context);
				const manifest = await useCase.create(prefix, globalOpts);
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
				const useCase = new SnapshotsUseCase(context);
				const list = useCase.list();
				if (!globalOpts.json) {
					const rows = list.map((s) => [
						s.id,
						`${s.totalObjects} objects`,
						Formatter.formatBytes(s.totalSizeBytes),
						s.prefix || "(root)",
						Formatter.formatRelativeTime(s.createdAt),
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
				const useCase = new SnapshotsUseCase(context);
				const snap = useCase.inspect(id);
				if (!globalOpts.json) {
					console.log(colors.bold(`Snapshot: ${snap.id}`));
					console.log(`  Created:       ${snap.createdAt}`);
					console.log(`  Total Objects: ${snap.totalObjects}`);
					console.log(
						`  Total Size:    ${Formatter.formatBytes(snap.totalSizeBytes)}`,
					);
					console.log(`  Root SHA-256:  ${snap.rootChecksumSha256}`);
					const rows = snap.entries
						.slice(0, 20)
						.map((e) => [
							e.path,
							Formatter.formatBytes(e.size),
							e.etag,
							e.checksumSha256 || "-",
						]);
					console.log(
						Formatter.renderTable(["PATH", "SIZE", "ETAG", "SHA-256"], rows),
					);
					if (snap.entries.length > 20) {
						console.log(
							colors.dim(`... and ${snap.entries.length - 20} more objects.`),
						);
					}
				}
				return snap;
			});
		});

	snapCmd
		.command("compare <idA> <idB>")
		.description("Compare two snapshot manifests")
		.action(async (idA, idB) => {
			await handleAction(async (globalOpts) => {
				const useCase = new SnapshotsUseCase(context);
				const diff = useCase.compare(idA, idB);
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

	// 14. vault dump [source]
	program
		.command("dump [source]")
		.description("Export a manifest or snapshot as JSON or CSV")
		.option("-f, --format <format>", "Format (json or csv)", "json")
		.action(async (source, cmdOpts) => {
			await handleAction(async (globalOpts) => {
				const useCase = new DumpUseCase(context);
				const output = await useCase.execute({
					sourcePrefix: source,
					format: cmdOpts.format,
					...globalOpts,
				});

				if (globalOpts.json && cmdOpts.format === "json") {
					console.log(output);
					return undefined; // raw output printed
				}

				console.log(output);
				return undefined;
			});
		});

	// 15. vault tui
	program
		.command("tui")
		.description("Launch interactive terminal dashboard")
		.action(async () => {
			await runInteractiveTui(context);
		});

	return program;
}
