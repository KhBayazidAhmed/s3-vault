const enabled = !process.env.NO_COLOR && process.env.TERM !== "dumb";

export const colors = {
	bold: (s: string) => (enabled ? `\x1b[1m${s}\x1b[22m` : s),
	dim: (s: string) => (enabled ? `\x1b[2m${s}\x1b[22m` : s),
	italic: (s: string) => (enabled ? `\x1b[3m${s}\x1b[23m` : s),
	underline: (s: string) => (enabled ? `\x1b[4m${s}\x1b[24m` : s),

	black: (s: string) => (enabled ? `\x1b[30m${s}\x1b[39m` : s),
	red: (s: string) => (enabled ? `\x1b[31m${s}\x1b[39m` : s),
	green: (s: string) => (enabled ? `\x1b[32m${s}\x1b[39m` : s),
	yellow: (s: string) => (enabled ? `\x1b[33m${s}\x1b[39m` : s),
	blue: (s: string) => (enabled ? `\x1b[34m${s}\x1b[39m` : s),
	magenta: (s: string) => (enabled ? `\x1b[35m${s}\x1b[39m` : s),
	cyan: (s: string) => (enabled ? `\x1b[36m${s}\x1b[39m` : s),
	white: (s: string) => (enabled ? `\x1b[37m${s}\x1b[39m` : s),
	gray: (s: string) => (enabled ? `\x1b[90m${s}\x1b[39m` : s),

	bgRed: (s: string) => (enabled ? `\x1b[41m${s}\x1b[49m` : s),
	bgGreen: (s: string) => (enabled ? `\x1b[42m${s}\x1b[49m` : s),
	bgYellow: (s: string) => (enabled ? `\x1b[43m${s}\x1b[49m` : s),
	bgBlue: (s: string) => (enabled ? `\x1b[44m${s}\x1b[49m` : s),
	bgMagenta: (s: string) => (enabled ? `\x1b[45m${s}\x1b[49m` : s),
	bgCyan: (s: string) => (enabled ? `\x1b[46m${s}\x1b[49m` : s),
	bgWhite: (s: string) => (enabled ? `\x1b[47m${s}\x1b[49m` : s),
	bgBlack: (s: string) => (enabled ? `\x1b[40m${s}\x1b[49m` : s),
	inverse: (s: string) => (enabled ? `\x1b[7m${s}\x1b[27m` : s),
};
