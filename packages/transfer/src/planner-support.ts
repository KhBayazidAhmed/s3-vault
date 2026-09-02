import {
	ChecksumUtils,
	type ConflictPolicy,
	type TransferItem,
	type VaultObject,
} from "@S3-vault-CLI/domain";
import type { StorageBackend } from "@S3-vault-CLI/storage";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import type { PlanOptions } from "./planner.js";
import type { LocalFileInfo } from "./scanner.js";

export interface PlanCounts {
	additions: number;
	updates: number;
	deletions: number;
	conflicts: number;
	skips: number;
}

export interface PlanContext {
	storage: StorageBackend;
	options: PlanOptions;
	localMap: Map<string, LocalFileInfo>;
	remoteMap: Map<string, VaultObject>;
	remoteByKey: Map<string, VaultObject>;
	remotePrefix: string;
	items: TransferItem[];
	counts: PlanCounts;
}

export function makeItemId(index: number): string {
	return `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${index}`;
}

export function addItem(
	context: PlanContext,
	count: keyof PlanCounts,
	item: Omit<TransferItem, "id" | "bytesTransferred">,
): void {
	context.counts[count]++;
	context.items.push({
		id: makeItemId(context.items.length + 1),
		...item,
		bytesTransferred: 0,
	});
}

export async function loadRemoteObjects(
	storage: StorageBackend,
	bucket: string,
	remotePrefix: string,
): Promise<{
	remoteMap: Map<string, VaultObject>;
	remoteByKey: Map<string, VaultObject>;
}> {
	const remoteMap = new Map<string, VaultObject>();
	const remoteByKey = new Map<string, VaultObject>();
	for await (const obj of storage.listObjects({
		bucket,
		prefix: remotePrefix,
	})) {
		remoteByKey.set(obj.key, obj);
		let relativePath = obj.key;
		if (remotePrefix && relativePath.startsWith(remotePrefix)) {
			relativePath = relativePath
				.slice(remotePrefix.length)
				.replace(/^\/+/, "");
		}
		if (relativePath) remoteMap.set(relativePath, obj);
	}
	return { remoteMap, remoteByKey };
}

export async function computeLocalHash(
	localFile: LocalFileInfo,
	computeHash: boolean | undefined,
): Promise<string | undefined> {
	if (!computeHash || !existsSync(localFile.absolutePath)) return undefined;
	return (
		await ChecksumUtils.hashStream(
			createReadStream(localFile.absolutePath),
			"sha256",
		)
	).hash;
}

export function findDuplicateReason(
	localFile: LocalFileInfo,
	remoteObj: VaultObject,
	localHash: string | undefined,
): string | undefined {
	if (remoteObj.size !== localFile.size) return undefined;
	if (
		remoteObj.checksumSha256 &&
		localHash &&
		remoteObj.checksumSha256.toLowerCase() === localHash.toLowerCase()
	) {
		return "Duplicate file already exists on remote (matching SHA-256)";
	}
	if (remoteObj.etag && existsSync(localFile.absolutePath)) {
		const cleanEtag = remoteObj.etag.replace(/^"|"$/g, "");
		if (/^[a-fA-F0-9]{32}$/.test(cleanEtag)) {
			const localMd5 = ChecksumUtils.md5(readFileSync(localFile.absolutePath));
			if (cleanEtag.toLowerCase() === localMd5.toLowerCase()) {
				return "Duplicate file already exists on remote (matching MD5 checksum)";
			}
		}
	}
	const remoteTime = new Date(remoteObj.lastModified).getTime();
	const localTime = localFile.lastModified.getTime();
	if (Math.abs(remoteTime - localTime) < 2000 || remoteTime >= localTime) {
		return "Duplicate file already exists on remote (matching size and timestamp)";
	}
	return undefined;
}

export function conflictAction(
	policy: ConflictPolicy,
	localTime: number,
	remoteTime: number,
): "upload" | "download" | "conflict" {
	if (policy === "local-wins") return "upload";
	if (policy === "remote-wins") return "download";
	if (policy === "newer") return localTime > remoteTime ? "upload" : "download";
	return "conflict";
}
