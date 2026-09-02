import { addItem, type PlanContext } from "./planner-support.js";

export function planPull(context: PlanContext): void {
	const { options } = context;
	for (const [relativePath, remoteObj] of context.remoteMap.entries()) {
		const localFile = context.localMap.get(relativePath);
		const localTarget = `${options.localPath.replace(/\/+$/, "")}/${relativePath}`;
		const common = {
			sourcePath: remoteObj.key,
			targetPath: localTarget,
			relativePath,
			size: remoteObj.size,
			remoteLastModified: remoteObj.lastModified,
		};
		if (!localFile) {
			addItem(context, "additions", {
				...common,
				action: "download",
				reason: "New remote object",
				remoteHash: remoteObj.checksumSha256 || remoteObj.etag,
				status: "pending",
			});
			continue;
		}
		const sizeMatch = remoteObj.size === localFile.size;
		const remoteTime = new Date(remoteObj.lastModified).getTime();
		const localTime = localFile.lastModified.getTime();
		if (sizeMatch && Math.abs(remoteTime - localTime) < 2000) {
			addItem(context, "skips", {
				...common,
				action: "skip",
				reason: "Unmodified",
				localLastModified: localFile.lastModified,
				status: "skipped",
			});
		} else {
			addItem(context, "updates", {
				...common,
				action: "download",
				reason: "Modified remote object",
				localLastModified: localFile.lastModified,
				status: "pending",
			});
		}
	}

	if (options.direction !== "sync-down" || options.deletePolicy !== "delete") {
		return;
	}
	for (const [relativePath, localFile] of context.localMap.entries()) {
		if (context.remoteMap.has(relativePath)) continue;
		addItem(context, "deletions", {
			sourcePath: localFile.absolutePath,
			targetPath: "",
			relativePath,
			size: localFile.size,
			action: "delete-local",
			reason: "Object deleted remotely",
			localLastModified: localFile.lastModified,
			status: "pending",
		});
	}
}
