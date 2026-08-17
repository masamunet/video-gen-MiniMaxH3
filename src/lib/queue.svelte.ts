// 生成キューの管理。
// ComfyUI の Batch Count と同じく「同じワークフローを N 回キューに積む」方式
// (API 側に一括投入は無く、ComfyUI 本体も内部で N 回 POST している)。
// 複数ジョブを並列にポーリングし、完了したものから履歴へ入れる。
import { browser } from '$app/environment';
import { jobs, history, settings, type HistoryRecord, type QueueJob } from './stores.svelte';
import { buildWorkflow, type GenParams } from './workflow';
import {
	parseOutputs,
	pollStatus,
	submitWorkflow,
	interrupt,
	targetFromSettings,
	type BackendTarget
} from './comfy';

export const MAX_BATCH = 10;

const POLL_INTERVAL = 1500;
/** history にもキューにも見つからない状態がこの回数続いたら諦める */
const UNKNOWN_LIMIT = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class QueueStore {
	/** 直近に完了したレコード (出力ペインの表示更新用) */
	lastCompleted = $state<HistoryRecord | null>(null);
	/** 直近の投入で完了したレコード (完了順)。カルーセルのバッチ表示に使う */
	batch = $state<HistoryRecord[]>([]);
	/** 直近のエラーメッセージ */
	error = $state('');
	/** 経過時間表示を進めるためのティック */
	now = $state(Date.now());

	#polling = new Set<string>();
	#ticker: ReturnType<typeof setInterval> | undefined;

	constructor() {
		if (!browser) return;
		// リロードで中断されたジョブのポーリングを再開する
		queueMicrotask(() => {
			for (const job of jobs.value) this.#poll($state.snapshot(job));
			this.#syncTicker();
		});
	}

	get list(): QueueJob[] {
		return jobs.value;
	}

	get active(): number {
		return jobs.value.length;
	}

	#syncTicker() {
		if (jobs.value.length > 0 && !this.#ticker) {
			this.#ticker = setInterval(() => (this.now = Date.now()), 500);
		} else if (jobs.value.length === 0 && this.#ticker) {
			clearInterval(this.#ticker);
			this.#ticker = undefined;
		}
	}

	#remove(id: string) {
		jobs.value = jobs.value.filter((j) => j.id !== id);
		this.#polling.delete(id);
		this.#syncTicker();
	}

	#update(id: string, patch: Partial<QueueJob>) {
		jobs.value = jobs.value.map((j) => (j.id === id ? { ...j, ...patch } : j));
	}

	/** params の内容で count 件をキューに積む。戻り値は投入できた件数 */
	async submit(params: GenParams, count: number): Promise<number> {
		const target = targetFromSettings(settings.value);
		const n = Math.min(Math.max(1, Math.floor(count)), MAX_BATCH);
		this.error = '';
		this.batch = [];
		let queued = 0;

		for (let i = 0; i < n; i++) {
			// buildWorkflow はノイズシードとランダムプロンプトのシードを毎回振り直す
			const res = await submitWorkflow(target, buildWorkflow(params));
			if (res.error || !res.prompt_id) {
				this.error = res.error ?? '送信に失敗しました';
				break;
			}
			const job: QueueJob = {
				id: res.prompt_id,
				params,
				startedAt: Date.now(),
				backend: target.backend,
				endpointId: target.endpointId,
				host: target.host,
				state: 'queued',
				position: 0,
				index: i + 1,
				total: n
			};
			jobs.value = [...jobs.value, job];
			queued++;
			this.#poll(job);
		}
		this.#syncTicker();
		return queued;
	}

	/** ジョブ1件をポーリングし、完了したら履歴に入れる */
	async #poll(job: QueueJob) {
		if (this.#polling.has(job.id)) return;
		this.#polling.add(job.id);

		const target: BackendTarget = {
			backend: job.backend,
			host: job.host,
			endpointId: job.endpointId
		};
		let unknown = 0;

		while (this.#polling.has(job.id)) {
			await sleep(POLL_INTERVAL);
			if (!this.#polling.has(job.id)) return;

			const st = await pollStatus(target, job.id);
			if (!this.#polling.has(job.id)) return;

			if (st.state === 'done') {
				const seconds = Math.round(((Date.now() - job.startedAt) / 1000) * 10) / 10;
				const parsed = parseOutputs(st.outputs);
				const record: HistoryRecord = {
					id: job.id,
					date: Date.now(),
					params: job.params,
					jpPrompt: parsed.jpPrompt,
					enPrompt: parsed.enPrompt,
					seconds,
					video: parsed.video,
					backend: job.backend,
					execSeconds: st.execSeconds ?? null
				};
				history.add(record);
				this.batch = [...this.batch, record];
				this.lastCompleted = record;
				this.#remove(job.id);
				return;
			}
			if (st.state === 'error') {
				this.error = st.message;
				this.#remove(job.id);
				return;
			}
			// 中断はエラーではないので静かにキューから外す
			if (st.state === 'cancelled') {
				this.#remove(job.id);
				return;
			}
			if (st.state === 'queued') {
				this.#update(job.id, { state: 'queued', position: st.position });
			} else if (st.state === 'running') {
				this.#update(job.id, { state: 'running' });
			}

			unknown = st.state === 'unknown' ? unknown + 1 : 0;
			if (unknown >= UNKNOWN_LIMIT) {
				this.error = 'ジョブが見つかりませんでした (サーバーが再起動された可能性があります)';
				this.#remove(job.id);
				return;
			}
		}
	}

	/** 指定ジョブをキャンセルする */
	async cancel(id: string) {
		const job = jobs.value.find((j) => j.id === id);
		this.#remove(id);
		if (!job) return;
		await interrupt(
			{ backend: job.backend, host: job.host, endpointId: job.endpointId },
			job.id
		);
	}

	/** キュー内のすべてをキャンセルする */
	async cancelAll() {
		const all = jobs.value.map((j) => $state.snapshot(j));
		jobs.value = [];
		this.#polling.clear();
		this.#syncTicker();
		for (const job of all) {
			await interrupt(
				{ backend: job.backend, host: job.host, endpointId: job.endpointId },
				job.id
			).catch(() => {});
		}
	}
}

export const queue = new QueueStore();

/** ジョブの経過秒数 */
export function jobElapsed(job: QueueJob, now: number): number {
	return Math.max(0, (now - job.startedAt) / 1000);
}
