import type { ListObjectsUseCase } from "@S3-vault-CLI/application";
import type { FileItem } from "./types.js";

export class RemoteBrowser {
	static async listPrefix(
		listUseCase: ListObjectsUseCase,
		currentPrefix = "",
	): Promise<FileItem[]> {
		const items: FileItem[] = [];

		// Normalized prefix (e.g., "photos/" or "")
		let normalizedPrefix = currentPrefix.replace(/^\/+/, "");
		if (normalizedPrefix && !normalizedPrefix.endsWith("/")) {
			normalizedPrefix += "/";
		}

		// Parent directory navigation if in sub-prefix
		if (normalizedPrefix !== "") {
			const withoutTrailing = normalizedPrefix.slice(0, -1);
			const lastSlash = withoutTrailing.lastIndexOf("/");
			const parentPrefix =
				lastSlash >= 0 ? withoutTrailing.slice(0, lastSlash + 1) : "";

			items.push({
				name: "..",
				path: parentPrefix,
				isDirectory: true,
				size: 0,
				modifiedAt: "",
			});
		}

		try {
			const objects = await listUseCase.execute({
				path: normalizedPrefix,
				recursive: true,
			});

			const subDirMap = new Map<string, FileItem>();
			const files: FileItem[] = [];

			for (const obj of objects) {
				const key = obj.key;
				if (!key.startsWith(normalizedPrefix)) continue;

				const relative = key.slice(normalizedPrefix.length);
				if (!relative) continue;

				const slashIndex = relative.indexOf("/");
				if (slashIndex !== -1) {
					// Virtual directory folder
					const folderName = `${relative.slice(0, slashIndex)}/`;
					const folderPath = `${normalizedPrefix}${folderName}`;

					if (!subDirMap.has(folderName)) {
						subDirMap.set(folderName, {
							name: folderName,
							path: folderPath,
							isDirectory: true,
							size: 0,
							modifiedAt: "",
						});
					}
				} else {
					// Direct file item
					let modDate = "";
					if (obj.lastModified) {
						const mtime = new Date(obj.lastModified);
						const monthNames = [
							"Jan",
							"Feb",
							"Mar",
							"Apr",
							"May",
							"Jun",
							"Jul",
							"Aug",
							"Sep",
							"Oct",
							"Nov",
							"Dec",
						];
						const month = monthNames[mtime.getMonth()] ?? "Jan";
						const day = String(mtime.getDate()).padStart(2, "0");
						const hours = String(mtime.getHours()).padStart(2, "0");
						const minutes = String(mtime.getMinutes()).padStart(2, "0");
						modDate = `${month} ${day} ${hours}:${minutes}`;
					}

					files.push({
						name: relative,
						path: key,
						isDirectory: false,
						size: obj.size,
						modifiedAt: modDate,
						etag: obj.etag,
					});
				}
			}

			const dirs = Array.from(subDirMap.values()).sort((a, b) =>
				a.name.localeCompare(b.name),
			);
			files.sort((a, b) => a.name.localeCompare(b.name));

			items.push(...dirs, ...files);
		} catch (err: unknown) {
			// Catch connection/auth errors
		}

		return items;
	}
}
