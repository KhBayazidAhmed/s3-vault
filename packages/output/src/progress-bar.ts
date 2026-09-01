import type { TransferProgress } from "@S3-vault-CLI/domain";
import { colors } from "./colors.js";
import { Formatter } from "./formatter.js";

export class TerminalProgressBar {
	private isInteractive: boolean;
	private lastRender = 0;

	constructor() {
		this.isInteractive = Boolean(
			process.stdout.isTTY && !process.env.CI && process.env.TERM !== "dumb",
		);
	}

	update(progress: TransferProgress): void {
		if (!this.isInteractive) return;

		const now = Date.now();
		if (now - this.lastRender < 80) return; // Throttle to ~12fps
		this.lastRender = now;

		const percent =
			progress.totalBytes > 0
				? Math.min(
						100,
						Math.round((progress.transferredBytes / progress.totalBytes) * 100),
					)
				: 0;

		const barWidth = 25;
		const filledWidth = Math.round((percent / 100) * barWidth);
		const emptyWidth = barWidth - filledWidth;
		const bar =
			colors.cyan("█".repeat(filledWidth)) + colors.dim("░".repeat(emptyWidth));

		const filesStr = `${progress.completedFiles}/${progress.totalFiles} files`;
		const bytesStr = `${Formatter.formatBytes(progress.transferredBytes)} / ${Formatter.formatBytes(progress.totalBytes)}`;
		const speedStr = Formatter.formatSpeed(progress.speedBytesPerSec);
		const etaStr =
			progress.estimatedRemainingSec > 0
				? `ETA: ${Formatter.formatDuration(progress.estimatedRemainingSec)}`
				: "ETA: 0s";

		const itemStr = progress.activeItem
			? colors.dim(`(${progress.activeItem.slice(-30)})`)
			: "";

		const line = `\r[${bar}] ${colors.bold(`${percent}%`)} | ${filesStr} | ${bytesStr} | ${colors.green(speedStr)} | ${colors.yellow(etaStr)} ${itemStr}`;

		process.stdout.write(line);
	}

	clear(): void {
		if (this.isInteractive) {
			process.stdout.write("\r\x1b[K");
		}
	}

	finish(summary: string): void {
		this.clear();
		console.log(summary);
	}
}
