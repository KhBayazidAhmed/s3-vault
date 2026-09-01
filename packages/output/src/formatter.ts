import { colors } from "./colors.js";

export class Formatter {
	static formatBytes(bytes: number): string {
		if (bytes === 0) return "0 B";
		const k = 1024;
		const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		const val = Number.parseFloat((bytes / k ** i).toFixed(2));
		return `${val} ${sizes[i]}`;
	}

	static formatSpeed(bytesPerSec: number): string {
		return `${Formatter.formatBytes(bytesPerSec)}/s`;
	}

	static formatDuration(seconds: number): string {
		if (seconds < 1) return "< 1s";
		if (seconds < 60) return `${Math.round(seconds)}s`;
		const mins = Math.floor(seconds / 60);
		const remainingSec = Math.round(seconds % 60);
		if (mins < 60) return `${mins}m ${remainingSec}s`;
		const hours = Math.floor(mins / 60);
		const remMins = mins % 60;
		return `${hours}h ${remMins}m`;
	}

	static formatRelativeTime(date: Date | string): string {
		const d = typeof date === "string" ? new Date(date) : date;
		const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);

		if (diffSec < 60) return "just now";
		if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
		if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
		return `${Math.floor(diffSec / 86400)}d ago`;
	}

	static renderTable(headers: string[], rows: (string | number)[][]): string {
		if (rows.length === 0) return colors.dim("No items found.");

		// Compute column widths
		const colWidths = headers.map((h, colIndex) => {
			let max = h.length;
			for (const row of rows) {
				const cell = String(row[colIndex] ?? "");
				// Strip ANSI for length
				const len = cell.replace(/\x1b\[[0-9;]*m/g, "").length;
				if (len > max) max = len;
			}
			return max + 2; // padding
		});

		const headerLine = headers
			.map((h, i) => colors.bold(h.padEnd(colWidths[i] ?? h.length)))
			.join("");

		const dividerLine = colWidths.map((w) => "─".repeat(w)).join("");

		const bodyLines = rows.map((row) =>
			row
				.map((cell, i) => {
					const str = String(cell ?? "");
					const rawLen = str.replace(/\x1b\[[0-9;]*m/g, "").length;
					const targetW = colWidths[i] ?? rawLen;
					const pad = Math.max(0, targetW - rawLen);
					return str + " ".repeat(pad);
				})
				.join(""),
		);

		return [headerLine, colors.dim(dividerLine), ...bodyLines].join("\n");
	}

	static renderTree(
		rootName: string,
		items: { path: string; size?: number; isDir?: boolean }[],
	): string {
		const lines: string[] = [colors.bold(colors.blue(rootName))];

		// Build directory tree
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (!item) continue;
			const isLast = i === items.length - 1;
			const branch = isLast ? "└── " : "├── ";
			const sizeStr =
				item.size !== undefined
					? colors.dim(` (${Formatter.formatBytes(item.size)})`)
					: "";
			const icon = item.isDir ? colors.cyan("📁 ") : colors.gray("📄 ");
			lines.push(`${colors.dim(branch)}${icon}${item.path}${sizeStr}`);
		}

		return lines.join("\n");
	}
}
