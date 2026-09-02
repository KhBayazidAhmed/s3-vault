import type { VaultObject } from "@S3-vault-CLI/domain";
import { existsSync, statSync } from "node:fs";
import {
	addItem,
	computeLocalHash,
	findDuplicateReason,
	type PlanContext,
} from "./planner-support.js";

async function findRemoteObject(
	context: PlanContext,
	remoteKey: string,
	relativePath: string,
	isSingleFile: boolean,
): Promise<VaultObject | undefined> {
	let remoteObj =
		context.remoteByKey.get(remoteKey) ?? context.remoteMap.get(relativePath);
	if (remoteObj || !isSingleFile || !context.storage.headObject)
		return remoteObj;
	try {
		const head = await context.storage.headObject({
			bucket: context.options.remoteBucket,
			key: remoteKey,
		});
		if (head) {
			remoteObj = {
				key: remoteKey,
				size: head.size,
				etag: head.etag,
				lastModified: head.lastModified,
				checksumSha256: head.checksumSha256,
			};
		}
	} catch {
		// An unavailable head is treated as an object that does not exist.
	}
	return remoteObj;
}

function remoteKeyFor(
	context: PlanContext,
	relativePath: string,
	isSingleFile: boolean,
): string {
	const { remotePrefix } = context.options;
	if (isSingleFile && remotePrefix && !remotePrefix.endsWith("/")) {
		return remotePrefix.replace(/^\/+/, "");
	}
	return context.remotePrefix
		? `${context.remotePrefix.replace(/\/+$/, "")}/${relativePath}`
		: relativePath;
}

export async function planPush(context: PlanContext): Promise<void> {
	const { options } = context;
	const isSingleFile =
		existsSync(options.localPath) && !statSync(options.localPath).isDirectory();

	for (const [relativePath, localFile] of context.localMap.entries()) {
		const remoteKey = remoteKeyFor(context, relativePath, isSingleFile);
		const remoteObj = await findRemoteObject(
			context,
			remoteKey,
			relativePath,
			isSingleFile,
		);
		const localHash = await computeLocalHash(localFile, options.computeHash);
		const common = {
			sourcePath: localFile.absolutePath,
			targetPath: remoteKey,
			relativePath,
			size: localFile.size,
			localLastModified: localFile.lastModified,
			localHash,
		};

		if (!remoteObj) {
			addItem(context, "additions", {
				...common,
				action: "upload",
				reason: "New local file",
				status: "pending",
			});
			continue;
		}
		const remoteDetails = {
			remoteLastModified: remoteObj.lastModified,
			remoteHash: remoteObj.checksumSha256 || remoteObj.etag,
		};
		if (options.force) {
			addItem(context, "updates", {
				...common,
				...remoteDetails,
				action: "upload",
				reason: "Forced upload (overwriting remote object)",
				status: "pending",
			});
			continue;
		}
		const duplicateReason = findDuplicateReason(
			localFile,
			remoteObj,
			localHash,
		);
		if (duplicateReason) {
			addItem(context, "skips", {
				...common,
				...remoteDetails,
				action: "skip",
				reason: duplicateReason,
				status: "skipped",
			});
		} else {
			addItem(context, "updates", {
				...common,
				...remoteDetails,
				action: "upload",
				reason: "Modified local file",
				status: "pending",
			});
		}
	}

	if (options.direction !== "sync-up" || options.deletePolicy !== "delete") {
		return;
	}
	for (const [relativePath, remoteObj] of context.remoteMap.entries()) {
		if (context.localMap.has(relativePath)) continue;
		addItem(context, "deletions", {
			sourcePath: "",
			targetPath: remoteObj.key,
			relativePath,
			size: remoteObj.size,
			action: "delete-remote",
			reason: "File deleted locally",
			remoteLastModified: remoteObj.lastModified,
			status: "pending",
		});
	}
}
