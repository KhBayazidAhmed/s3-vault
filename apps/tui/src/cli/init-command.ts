import {
	InitProfileUseCase,
	type ServiceContext,
} from "@S3-vault-CLI/application";
import { colors, logger } from "@S3-vault-CLI/output";
import type { Command } from "commander";
import { CliPrompts } from "../prompts.js";
import type { HandleAction } from "./shared.js";

export function registerInitCommand(
	program: Command,
	context: ServiceContext,
	handleAction: HandleAction,
): void {
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

				if (!name && process.stdin.isTTY) {
					name = await CliPrompts.ask("Profile name", "default");
				}

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

				if (!bucket && process.stdin.isTTY) {
					bucket = await CliPrompts.ask("Bucket name");
				}
				const prefix = cmdOpts.prefix;

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
}
