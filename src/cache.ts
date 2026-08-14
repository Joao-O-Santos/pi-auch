import type { ProviderId, ProviderReader, QuotaResult, QuotaState } from "./types.js";

export class QuotaCache {
	private readonly readers: Map<ProviderId, ProviderReader>;
	private readonly states = new Map<ProviderId, QuotaState>();
	private readonly pending = new Map<ProviderId, Promise<QuotaState>>();
	private readonly controllers = new Set<AbortController>();

	constructor(readers: ProviderReader[]) {
		this.readers = new Map(readers.map((reader) => [reader.id, reader]));
	}

	get(provider: ProviderId): QuotaState | undefined {
		return this.states.get(provider);
	}

	store(value: QuotaResult): void {
		this.states.set(value.provider, { status: "ready", value, stale: false });
	}

	refresh(provider: ProviderId): Promise<QuotaState> {
		const existing = this.pending.get(provider);
		if (existing) return existing;
		const reader = this.readers.get(provider);
		if (!reader)
			return Promise.resolve({
				status: "unavailable",
				error: "unsupported provider",
			});

		const controller = new AbortController();
		this.controllers.add(controller);
		const task = reader
			.read(controller.signal)
			.then<QuotaState>((value) => ({ status: "ready", value, stale: false }))
			.catch((error: unknown): QuotaState => {
				const message = error instanceof Error ? error.message : "quota refresh failed";
				const previous = this.states.get(provider);
				return previous?.status === "ready"
					? {
							status: "ready",
							value: previous.value,
							stale: true,
							error: message,
						}
					: { status: "unavailable", error: message };
			})
			.then((state) => {
				this.states.set(provider, state);
				return state;
			})
			.finally(() => {
				this.pending.delete(provider);
				this.controllers.delete(controller);
			});
		this.pending.set(provider, task);
		return task;
	}

	async refreshAll(): Promise<Map<ProviderId, QuotaState>> {
		const entries = await Promise.all(
			[...this.readers.keys()].map(
				async (provider) => [provider, await this.refresh(provider)] as const,
			),
		);
		return new Map(entries);
	}

	abort(): void {
		for (const controller of this.controllers) controller.abort();
		this.controllers.clear();
	}
}
