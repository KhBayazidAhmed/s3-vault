import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export interface LocalFileInfo {
	absolutePath: string;
	relativePath: string;
	size: number;
	lastModified: Date;
}

export interface ScanOptions {
	recursive?: boolean;
	includes?: string[];
	excludes?: string[];
}

export class LocalScanner {
	static matchesPatterns(
		relPath: string,
		includes?: string[],
		excludes?: string[],
	): boolean {
		const normalized = relPath.replace(/\\/g, "/");

		if (excludes && excludes.length > 0) {
			for (const pattern of excludes) {
				if (LocalScanner.simpleGlobMatch(normalized, pattern)) {
					return false;
				}
			}
		}

		if (includes && includes.length > 0) {
			for (const pattern of includes) {
				if (LocalScanner.simpleGlobMatch(normalized, pattern)) {
					return true;
				}
			}
			return false;
		}

		return true;
	}

	private static simpleGlobMatch(str: string, pattern: string): boolean {
		if (pattern === "*" || pattern === "**/*") return true;
		const regexStr = pattern
			.replace(/[.+^${}()|[\]\\]/g, "\\$&")
			.replace(/\*\*/g, ".*")
			.replace(/\*/g, "[^/]*")
			.replace(/\?/g, ".");
		return new RegExp(`^${regexStr}$`, "i").test(str);
	}

	static scan(targetPath: string, options: ScanOptions = {}): LocalFileInfo[] {
		const absPath = resolve(targetPath);
		if (!existsSync(absPath)) {
			return [];
		}

		const stats = statSync(absPath);
		if (!stats.isDirectory()) {
			const rel = relative(process.cwd(), absPath).replace(/\\/g, "/");
			return [
				{
					absolutePath: absPath,
					relativePath: rel.startsWith("..") ? targetPath : rel,
					size: stats.size,
					lastModified: stats.mtime,
				},
			];
		}

		const results: LocalFileInfo[] = [];
		const walk = (currentDir: string) => {
			const entries = readdirSync(currentDir, { withFileTypes: true });
			for (const entry of entries) {
				const full = join(currentDir, entry.name);
				const rel = relative(absPath, full).replace(/\\/g, "/");

				if (entry.isDirectory()) {
					if (options.recursive !== false) {
						walk(full);
					}
				} else if (entry.isFile()) {
					if (
						LocalScanner.matchesPatterns(
							rel,
							options.includes,
							options.excludes,
						)
					) {
						const fStats = statSync(full);
						results.push({
							absolutePath: full,
							relativePath: rel,
							size: fStats.size,
							lastModified: fStats.mtime,
						});
					}
				}
			}
		};

		walk(absPath);
		return results;
	}
}
