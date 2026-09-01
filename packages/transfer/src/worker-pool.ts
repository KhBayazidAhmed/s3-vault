export class WorkerPool {
	private concurrency: number;
	private running = 0;
	private queue: (() => Promise<void>)[] = [];

	constructor(concurrency = 8) {
		this.concurrency = Math.max(1, concurrency);
	}

	async run<T>(task: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const execute = async () => {
				this.running++;
				try {
					const result = await task();
					resolve(result);
				} catch (err) {
					reject(err);
				} finally {
					this.running--;
					this.processNext();
				}
			};

			if (this.running < this.concurrency) {
				execute();
			} else {
				this.queue.push(execute);
			}
		});
	}

	private processNext(): void {
		if (this.queue.length > 0 && this.running < this.concurrency) {
			const next = this.queue.shift();
			if (next) next();
		}
	}
}
