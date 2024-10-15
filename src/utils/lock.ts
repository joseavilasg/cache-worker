type Unlock = () => Promise<void>
type Resolve<T> = (value: T | PromiseLike<T>) => void

export class LockMutex {
	#_locked: boolean = false;
	#_waiting: Array<Resolve<Unlock>> = [];

	#unlock: Unlock = async () => {
		if (this.#_waiting.length > 0) {
			const nextResolve = this.#_waiting.pop();
			nextResolve?.(this.#unlock);
		} else {
			this.#_locked = false;
		}
	};

	lock(): Promise<Unlock> {
		return new Promise((resolve) => {
			if (this.#_locked) {
				this.#_waiting.push(resolve);
			} else {
				this.#_locked = true;
				resolve(this.#unlock);
			}
		});
	}
}