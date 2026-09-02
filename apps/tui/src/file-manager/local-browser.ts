import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { FileItem } from "./types.js";

export class LocalBrowser {
	static readDirectory(dirPath: string): FileItem[] {
		const absolutePath = resolve(dirPath);
		const items: FileItem[] = [];

		// If not at the filesystem root, prepend parent directory entry
		const parentDir = dirname(absolutePath);
		if (parentDir !== absolutePath) {
			items.push({
				name: "..",
				path: parentDir,
				isDirectory: true,
				size: 0,
				modifiedAt: "",
			});
		}

		try {
			const entries = readdirSync(absolutePath, { withFileTypes: true });

			const dirs: FileItem[] = [];
			const files: FileItem[] = [];

			for (const entry of entries) {
				// Ignore hidden dotfiles if needed or display them
				if (entry.name.startsWith(".") && entry.name !== "..") {
					// We can skip or show; let's show important dotfiles or skip .git
					if (entry.name === ".git" || entry.name === ".DS_Store") continue;
				}

				const fullPath = join(absolutePath, entry.name);
				try {
					const stats = statSync(fullPath);
					const isDir = entry.isDirectory();

					const mtime = stats.mtime;
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
					const formattedDate = `${month} ${day} ${hours}:${minutes}`;

					const item: FileItem = {
						name: entry.name,
						path: fullPath,
						isDirectory: isDir,
						size: isDir ? 0 : stats.size,
						modifiedAt: formattedDate,
						modifiedAtMs: stats.mtimeMs,
						deviceId: stats.dev,
						inode: stats.ino,
					};

					if (isDir) {
						dirs.push(item);
					} else {
						files.push(item);
					}
				} catch {
					// Skip unreadable files
				}
			}

			// Sort alphabetically
			dirs.sort((a, b) => a.name.localeCompare(b.name));
			files.sort((a, b) => a.name.localeCompare(b.name));

			items.push(...dirs, ...files);
		} catch {
			// Return just parent entry if directory read failed
		}

		return items;
	}
}
