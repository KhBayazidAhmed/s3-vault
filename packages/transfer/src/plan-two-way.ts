import type { ConflictPolicy, TransferAction } from "@S3-vault-CLI/domain";
import {
	addItem,
	conflictAction,
	type PlanContext,
} from "./planner-support.js";

function conflictReason(
	action: TransferAction,
	policy: ConflictPolicy,
): string {
	if (action === "upload") {
		return policy === "newer"
			? "Conflict: Local is newer"
			: "Conflict: Local wins";
	}
	if (action === "download") {
		return policy === "newer"
			? "Conflict: Remote is newer"
			: "Conflict: Remote wins";
	}
	return "Conflict: Both modified and conflict policy requires resolution";
}

export function planTwoWay(context: PlanContext): void {
	const allPaths = new Set([
		...context.localMap.keys(),
		...context.remoteMap.keys(),
	]);
	for (const relativePath of allPaths) {
		const localFile = context.localMap.get(relativePath);
		const remoteObj = context.remoteMap.get(relativePath);
		const remoteKey = context.remotePrefix
			? `${context.remotePrefix.replace(/\/+$/, "")}/${relativePath}`
			: relativePath;
		const localTarget = `${context.options.localPath.replace(/\/+$/, "")}/${relativePath}`;

		if (localFile && !remoteObj) {
			addItem(context, "additions", {
				sourcePath: localFile.absolutePath,
				targetPath: remoteKey,
				relativePath,
				size: localFile.size,
				action: "upload",
				reason: "Two-way: Upload new local file",
				localLastModified: localFile.lastModified,
				status: "pending",
			});
			continue;
		}
		if (!localFile && remoteObj) {
			addItem(context, "additions", {
				sourcePath: remoteObj.key,
				targetPath: localTarget,
				relativePath,
				size: remoteObj.size,
				action: "download",
				reason: "Two-way: Download new remote object",
				remoteLastModified: remoteObj.lastModified,
				status: "pending",
			});
			continue;
		}
		if (!localFile || !remoteObj) continue;

		const remoteTime = new Date(remoteObj.lastModified).getTime();
		const localTime = localFile.lastModified.getTime();
		if (
			remoteObj.size === localFile.size &&
			Math.abs(remoteTime - localTime) < 2000
		) {
			addItem(context, "skips", {
				sourcePath: localFile.absolutePath,
				targetPath: remoteKey,
				relativePath,
				size: localFile.size,
				action: "skip",
				reason: "Two-way: Matching size and timestamp",
				localLastModified: localFile.lastModified,
				remoteLastModified: remoteObj.lastModified,
				status: "skipped",
			});
			continue;
		}

		const policy = context.options.conflictPolicy ?? "newer";
		const action = conflictAction(policy, localTime, remoteTime);
		const isDownload = action === "download";
		addItem(context, action === "conflict" ? "conflicts" : "updates", {
			sourcePath: isDownload ? remoteObj.key : localFile.absolutePath,
			targetPath: isDownload ? localTarget : remoteKey,
			relativePath,
			size: isDownload ? remoteObj.size : localFile.size,
			action,
			reason: conflictReason(action, policy),
			localLastModified: localFile.lastModified,
			remoteLastModified: remoteObj.lastModified,
			status: action === "conflict" ? "failed" : "pending",
		});
	}
}
