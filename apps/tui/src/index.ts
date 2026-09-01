import { ServiceContext } from "@S3-vault-CLI/application";
import { createCliProgram } from "./cli.js";
import { runInteractiveTui } from "./tui-app.js";

const args = process.argv;

// If user ran bare `vault` without arguments in an interactive TTY, launch interactive TUI dashboard!
if (args.length <= 2 && process.stdout.isTTY && !process.env.CI) {
	const context = new ServiceContext();
	try {
		await runInteractiveTui(context);
	} catch {
		const program = createCliProgram(context);
		program.parse(process.argv);
	}
} else {
	const program = createCliProgram();
	program.parse(process.argv);
}
