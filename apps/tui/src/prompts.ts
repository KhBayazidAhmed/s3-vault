import { colors } from "@S3-vault-CLI/output";
import { createInterface, emitKeypressEvents, type Key } from "node:readline";

export class CliPrompts {
	private static rl: ReturnType<typeof createInterface> | null = null;
	private static lineQueue: string[] = [];
	private static waiters: ((line: string) => void)[] = [];

	private static getRl() {
		if (!CliPrompts.rl) {
			CliPrompts.rl = createInterface({
				input: process.stdin,
				output: process.stdout,
				terminal: false,
			});
			CliPrompts.rl.on("line", (line) => {
				if (CliPrompts.waiters.length > 0) {
					const resolve = CliPrompts.waiters.shift()!;
					resolve(line);
				} else {
					CliPrompts.lineQueue.push(line);
				}
			});
		}
		return CliPrompts.rl;
	}

	static async ask(question: string, defaultValue?: string): Promise<string> {
		const promptText = defaultValue
			? `${colors.bold(question)} ${colors.dim(`[${defaultValue}]`)}: `
			: `${colors.bold(question)}: `;

		process.stdout.write(promptText);
		CliPrompts.getRl();

		return new Promise<string>((resolve) => {
			if (CliPrompts.lineQueue.length > 0) {
				const line = CliPrompts.lineQueue.shift()!;
				resolve(line.trim() || defaultValue || "");
				return;
			}

			CliPrompts.waiters.push((line) => {
				resolve(line.trim() || defaultValue || "");
			});
		});
	}

	static async select(
		question: string,
		choices: { label: string; value: string }[],
		defaultIndex = 0,
	): Promise<string> {
		if (!process.stdin.isTTY) {
			return choices[defaultIndex]?.value || choices[0]?.value || "";
		}

		let selectedIndex = Math.max(0, Math.min(defaultIndex, choices.length - 1));
		const stdin = process.stdin;
		const stdout = process.stdout;

		// Hide cursor during navigation
		stdout.write("\x1b[?25l");

		const render = (firstTime = false) => {
			if (!firstTime) {
				// Move cursor up to redraw the menu
				stdout.write(`\x1b[${choices.length + 1}A\r`);
			}

			stdout.write(
				`${colors.bold(colors.cyan("?"))} ${colors.bold(question)} ${colors.dim("(Use ↑/↓ arrow keys, Enter to select)")}\x1b[K\n`,
			);

			choices.forEach((choice, idx) => {
				const isSelected = idx === selectedIndex;
				if (isSelected) {
					stdout.write(
						`${colors.cyan("❯")} ${colors.bold(colors.cyan(choice.label))}\x1b[K\n`,
					);
				} else {
					stdout.write(`  ${colors.dim(choice.label)}\x1b[K\n`);
				}
			});
		};

		render(true);

		return new Promise((resolve) => {
			emitKeypressEvents(stdin);
			const isRaw = stdin.isRaw ?? false;
			stdin.setRawMode(true);
			stdin.resume();

			const onKeypress = (_str: string, key: Key) => {
				if (key.ctrl && key.name === "c") {
					// Restore cursor on abort
					stdout.write("\x1b[?25h\n");
					process.exit(130);
				}

				if (key.name === "up" || key.name === "k") {
					selectedIndex = (selectedIndex - 1 + choices.length) % choices.length;
					render(false);
				} else if (key.name === "down" || key.name === "j") {
					selectedIndex = (selectedIndex + 1) % choices.length;
					render(false);
				} else if (key.name === "return" || key.name === "enter") {
					cleanup();

					// Clear choices menu lines and replace with selected answer
					stdout.write(`\x1b[${choices.length + 1}A\r`);
					stdout.write(
						`${colors.green("✔")} ${colors.bold(question)}: ${colors.cyan(choices[selectedIndex]?.label || "")}\x1b[K\n`,
					);
					for (let i = 0; i < choices.length; i++) {
						stdout.write("\x1b[K\n");
					}
					stdout.write(`\x1b[${choices.length}A\r`);

					// Restore cursor
					stdout.write("\x1b[?25h");

					resolve(choices[selectedIndex]?.value || choices[0]?.value || "");
				} else if (_str && /^[1-9]$/.test(_str)) {
					const num = Number.parseInt(_str, 10) - 1;
					if (num >= 0 && num < choices.length) {
						selectedIndex = num;
						render(false);
					}
				}
			};

			const cleanup = () => {
				stdin.removeListener("keypress", onKeypress);
				if (stdin.isTTY) {
					stdin.setRawMode(isRaw);
				}
				CliPrompts.lineQueue = [];
				stdin.resume();
			};

			stdin.on("keypress", onKeypress);
		});
	}

	static async confirm(question: string, defaultYes = true): Promise<boolean> {
		const defaultHint = defaultYes ? "Y/n" : "y/N";
		const answer = await CliPrompts.ask(`${question} (${defaultHint})`);
		if (!answer) return defaultYes;
		return answer.toLowerCase().startsWith("y");
	}
}
