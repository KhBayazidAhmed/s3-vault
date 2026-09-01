import {
	ChecksumUtils,
	type ConflictPolicy,
	type DeletePolicy,
	type TransferDirection,
	type TransferItem,
	type TransferPlan,
	type VaultObject,
} from "@S3-vault-CLI/domain";
import type { StorageBackend } from "@S3-vault-CLI/storage";
import { existsSync, readFileSync, statSync } from "node:fs";
import {
	type LocalFileInfo,
	LocalScanner,
	type ScanOptions,
} from "./scanner.js";

export interface PlanOptions extends ScanOptions {
	direction: TransferDirection;
	localPath: string;
	remoteBucket: string;
	remotePrefix?: string;
	conflictPolicy?: ConflictPolicy;
	deletePolicy?: DeletePolicy;
	computeHash?: boolean;
}

export class TransferPlanner {
	private static makeItemId(index: number): string {
		return `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${index}`;
	}

	static async plan(
		storage: StorageBackend,
		options: PlanOptions,
	): Promise<TransferPlan> {
		const localFiles = LocalScanner.scan(options.localPath, options);
		const localMap = new Map<string, LocalFileInfo>();
		for (const f of localFiles) {
			localMap.set(f.relativePath, f);
		}

		const remotePrefix = options.remotePrefix
			? options.remotePrefix.replace(/^\/+/, "")
			: "";
		const remoteObjects: VaultObject[] = [];
		for await (const obj of storage.listObjects({
			bucket: options.remoteBucket,
			prefix: remotePrefix,
		})) {
			remoteObjects.push(obj);
		}

		const remoteMap = new Map<string, VaultObject>();
		for (const obj of remoteObjects) {
			let rel = obj.key;
			if (remotePrefix && rel.startsWith(remotePrefix)) {
				rel = rel.slice(remotePrefix.length).replace(/^\/+/, "");
			}
			if (rel) {
				remoteMap.set(rel, obj);
			}
		}

		const items: TransferItem[] = [];
		let additions = 0;
		let updates = 0;
		let deletions = 0;
		let conflicts = 0;
		let skips = 0;

		const conflictPolicy = options.conflictPolicy ?? "newer";
		const deletePolicy = options.deletePolicy ?? "none";

		if (options.direction === "push" || options.direction === "sync-up") {
			const isSingleFile =
				existsSync(options.localPath) &&
				!statSync(options.localPath).isDirectory();

			// Local -> Remote
			for (const [relPath, localFile] of localMap.entries()) {
				let remoteKey: string;
				if (
					isSingleFile &&
					options.remotePrefix &&
					!options.remotePrefix.endsWith("/")
				) {
					remoteKey = options.remotePrefix.replace(/^\/+/, "");
				} else if (remotePrefix) {
					remoteKey = `${remotePrefix.replace(/\/+$/, "")}/${relPath}`;
				} else {
					remoteKey = relPath;
				}
				const remoteObj = remoteMap.get(relPath);

				const localHash =
					options.computeHash && existsSync(localFile.absolutePath)
						? ChecksumUtils.sha256(readFileSync(localFile.absolutePath))
						: undefined;

				if (!remoteObj) {
					additions++;
					items.push({
						id: TransferPlanner.makeItemId(items.length + 1),
						sourcePath: localFile.absolutePath,
						targetPath: remoteKey,
						relativePath: relPath,
						size: localFile.size,
						action: "upload",
						reason: "New local file",
						localLastModified: localFile.lastModified,
						localHash,
						status: "pending",
						bytesTransferred: 0,
					});
				} else {
					// Compare size & mtime
					const sizeMatch = remoteObj.size === localFile.size;
					const remoteTime = new Date(remoteObj.lastModified).getTime();
					const localTime = localFile.lastModified.getTime();

					if (sizeMatch && Math.abs(remoteTime - localTime) < 2000) {
						skips++;
						items.push({
							id: TransferPlanner.makeItemId(items.length + 1),
							sourcePath: localFile.absolutePath,
							targetPath: remoteKey,
							relativePath: relPath,
							size: localFile.size,
							action: "skip",
							reason: "Unmodified (matching size and timestamp)",
							localLastModified: localFile.lastModified,
							remoteLastModified: remoteObj.lastModified,
							localHash,
							remoteHash: remoteObj.checksumSha256 || remoteObj.etag,
							status: "skipped",
							bytesTransferred: 0,
						});
					} else {
						updates++;
						items.push({
							id: TransferPlanner.makeItemId(items.length + 1),
							sourcePath: localFile.absolutePath,
							targetPath: remoteKey,
							relativePath: relPath,
							size: localFile.size,
							action: "upload",
							reason: "Modified local file",
							localLastModified: localFile.lastModified,
							remoteLastModified: remoteObj.lastModified,
							localHash,
							remoteHash: remoteObj.checksumSha256 || remoteObj.etag,
							status: "pending",
							bytesTransferred: 0,
						});
					}
				}
			}

			// Handle deletions if sync-up with delete policy
			if (options.direction === "sync-up" && deletePolicy === "delete") {
				for (const [relPath, remoteObj] of remoteMap.entries()) {
					if (!localMap.has(relPath)) {
						deletions++;
						items.push({
							id: TransferPlanner.makeItemId(items.length + 1),
							sourcePath: "",
							targetPath: remoteObj.key,
							relativePath: relPath,
							size: remoteObj.size,
							action: "delete-remote",
							reason: "File deleted locally",
							remoteLastModified: remoteObj.lastModified,
							status: "pending",
							bytesTransferred: 0,
						});
					}
				}
			}
		} else if (
			options.direction === "pull" ||
			options.direction === "sync-down"
		) {
			// Remote -> Local
			for (const [relPath, remoteObj] of remoteMap.entries()) {
				const localFile = localMap.get(relPath);
				const localTarget = `${options.localPath.replace(/\/+$/, "")}/${relPath}`;

				if (!localFile) {
					additions++;
					items.push({
						id: TransferPlanner.makeItemId(items.length + 1),
						sourcePath: remoteObj.key,
						targetPath: localTarget,
						relativePath: relPath,
						size: remoteObj.size,
						action: "download",
						reason: "New remote object",
						remoteLastModified: remoteObj.lastModified,
						remoteHash: remoteObj.checksumSha256 || remoteObj.etag,
						status: "pending",
						bytesTransferred: 0,
					});
				} else {
					const sizeMatch = remoteObj.size === localFile.size;
					const remoteTime = new Date(remoteObj.lastModified).getTime();
					const localTime = localFile.lastModified.getTime();

					if (sizeMatch && Math.abs(remoteTime - localTime) < 2000) {
						skips++;
						items.push({
							id: TransferPlanner.makeItemId(items.length + 1),
							sourcePath: remoteObj.key,
							targetPath: localTarget,
							relativePath: relPath,
							size: remoteObj.size,
							action: "skip",
							reason: "Unmodified",
							localLastModified: localFile.lastModified,
							remoteLastModified: remoteObj.lastModified,
							status: "skipped",
							bytesTransferred: 0,
						});
					} else {
						updates++;
						items.push({
							id: TransferPlanner.makeItemId(items.length + 1),
							sourcePath: remoteObj.key,
							targetPath: localTarget,
							relativePath: relPath,
							size: remoteObj.size,
							action: "download",
							reason: "Modified remote object",
							localLastModified: localFile.lastModified,
							remoteLastModified: remoteObj.lastModified,
							status: "pending",
							bytesTransferred: 0,
						});
					}
				}
			}

			if (options.direction === "sync-down" && deletePolicy === "delete") {
				for (const [relPath, localFile] of localMap.entries()) {
					if (!remoteMap.has(relPath)) {
						deletions++;
						items.push({
							id: TransferPlanner.makeItemId(items.length + 1),
							sourcePath: localFile.absolutePath,
							targetPath: "",
							relativePath: relPath,
							size: localFile.size,
							action: "delete-local",
							reason: "Object deleted remotely",
							localLastModified: localFile.lastModified,
							status: "pending",
							bytesTransferred: 0,
						});
					}
				}
			}
		} else if (options.direction === "sync-two-way") {
			// Two-way reconciliation
			const allPaths = new Set([...localMap.keys(), ...remoteMap.keys()]);

			for (const relPath of allPaths) {
				const localFile = localMap.get(relPath);
				const remoteObj = remoteMap.get(relPath);
				const remoteKey = remotePrefix
					? `${remotePrefix.replace(/\/+$/, "")}/${relPath}`
					: relPath;
				const localTarget = `${options.localPath.replace(/\/+$/, "")}/${relPath}`;

				if (localFile && !remoteObj) {
					additions++;
					items.push({
						id: TransferPlanner.makeItemId(items.length + 1),
						sourcePath: localFile.absolutePath,
						targetPath: remoteKey,
						relativePath: relPath,
						size: localFile.size,
						action: "upload",
						reason: "Two-way: Upload new local file",
						localLastModified: localFile.lastModified,
						status: "pending",
						bytesTransferred: 0,
					});
				} else if (!localFile && remoteObj) {
					additions++;
					items.push({
						id: TransferPlanner.makeItemId(items.length + 1),
						sourcePath: remoteObj.key,
						targetPath: localTarget,
						relativePath: relPath,
						size: remoteObj.size,
						action: "download",
						reason: "Two-way: Download new remote object",
						remoteLastModified: remoteObj.lastModified,
						status: "pending",
						bytesTransferred: 0,
					});
				} else if (localFile && remoteObj) {
					const sizeMatch = remoteObj.size === localFile.size;
					const remoteTime = new Date(remoteObj.lastModified).getTime();
					const localTime = localFile.lastModified.getTime();

					if (sizeMatch && Math.abs(remoteTime - localTime) < 2000) {
						skips++;
						items.push({
							id: TransferPlanner.makeItemId(items.length + 1),
							sourcePath: localFile.absolutePath,
							targetPath: remoteKey,
							relativePath: relPath,
							size: localFile.size,
							action: "skip",
							reason: "Two-way: Matching size and timestamp",
							localLastModified: localFile.lastModified,
							remoteLastModified: remoteObj.lastModified,
							status: "skipped",
							bytesTransferred: 0,
						});
					} else {
						// Conflict resolution
						if (conflictPolicy === "local-wins") {
							updates++;
							items.push({
								id: TransferPlanner.makeItemId(items.length + 1),
								sourcePath: localFile.absolutePath,
								targetPath: remoteKey,
								relativePath: relPath,
								size: localFile.size,
								action: "upload",
								reason: "Conflict: Local wins",
								localLastModified: localFile.lastModified,
								remoteLastModified: remoteObj.lastModified,
								status: "pending",
								bytesTransferred: 0,
							});
						} else if (conflictPolicy === "remote-wins") {
							updates++;
							items.push({
								id: TransferPlanner.makeItemId(items.length + 1),
								sourcePath: remoteObj.key,
								targetPath: localTarget,
								relativePath: relPath,
								size: remoteObj.size,
								action: "download",
								reason: "Conflict: Remote wins",
								localLastModified: localFile.lastModified,
								remoteLastModified: remoteObj.lastModified,
								status: "pending",
								bytesTransferred: 0,
							});
						} else if (conflictPolicy === "newer") {
							updates++;
							if (localTime > remoteTime) {
								items.push({
									id: TransferPlanner.makeItemId(items.length + 1),
									sourcePath: localFile.absolutePath,
									targetPath: remoteKey,
									relativePath: relPath,
									size: localFile.size,
									action: "upload",
									reason: "Conflict: Local is newer",
									localLastModified: localFile.lastModified,
									remoteLastModified: remoteObj.lastModified,
									status: "pending",
									bytesTransferred: 0,
								});
							} else {
								items.push({
									id: TransferPlanner.makeItemId(items.length + 1),
									sourcePath: remoteObj.key,
									targetPath: localTarget,
									relativePath: relPath,
									size: remoteObj.size,
									action: "download",
									reason: "Conflict: Remote is newer",
									localLastModified: localFile.lastModified,
									remoteLastModified: remoteObj.lastModified,
									status: "pending",
									bytesTransferred: 0,
								});
							}
						} else {
							conflicts++;
							items.push({
								id: TransferPlanner.makeItemId(items.length + 1),
								sourcePath: localFile.absolutePath,
								targetPath: remoteKey,
								relativePath: relPath,
								size: localFile.size,
								action: "conflict",
								reason:
									"Conflict: Both modified and conflict policy requires resolution",
								localLastModified: localFile.lastModified,
								remoteLastModified: remoteObj.lastModified,
								status: "failed",
								bytesTransferred: 0,
							});
						}
					}
				}
			}
		}

		const totalBytes = items.reduce(
			(acc, i) => (i.action !== "skip" ? acc + i.size : acc),
			0,
		);

		return {
			direction: options.direction,
			items,
			totalCount: items.length,
			totalBytes,
			additions,
			updates,
			deletions,
			conflicts,
			skips,
		};
	}
}
