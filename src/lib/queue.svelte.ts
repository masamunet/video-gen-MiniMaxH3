// 生成キューの管理。
// ComfyUI の Batch Count と同じく「同じワークフローを N 回キューに積む」方式
// (API 側に一括投入は無く、ComfyUI 本体も内部で N 回 POST している)。
// 複数ジョブを並列にポーリングし、完了したものから履歴へ入れる。
import { browser } from '$app/environment';
import { jobs, history, settings, bossMode, type HistoryRecord, type QueueJob } from './stores.svelte';
import { buildWorkflow, type GenParams } from './workflow';
import { showNotification } from './compat';
import {
	parseOutputs,
	pollStatus,
	submitWorkflow,
	interrupt,
	targetFromSettings,
	type BackendTarget,
	type SubmitResult
} from './comfy';

export const MAX_BATCH = 10;

const POLL_INTERVAL = 1500;
/** history にもキューにも見つからない状態がこの回数続いたら諦める */
const UNKNOWN_LIMIT = 5;
/** 通信できない状態がこの回数続いたら諦める (1.5秒 × 80 ≒ 2分) */
const OFFLINE_LIMIT = 80;
/** 瞬断で警告を出さないよう、この回数続いてから「再接続待ち」を表示する */
const OFFLINE_NOTICE = 3;

/**
 * 通知の group。バッチ (最大10件) で通知が溢れないよう、完了は常に1件だけ残して
 * 件数を集約する。ただし完了のたびにバナーは出し直される (showNotification 参照)
 */
const NOTIFY_GROUP_DONE = 'vg:done';
const NOTIFY_GROUP_ERROR = 'vg:error';

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
	/** ユーザーがまだ画面を見ていない完了件数 (通知の集約カウントに使う) */
	#unseenDone = 0;

	constructor() {
		if (!browser) return;
		// リロードで中断されたジョブのポーリングを再開する
		queueMicrotask(() => this.resume());
		// オフラインやスリープでポーリングが途切れたジョブを拾い直す。
		// これが無いと監視の止まったジョブがキューに残り続け、
		// busy 扱いのまま「API サーバー」などの操作が効かなくなる
		const wake = () => this.resume();
		window.addEventListener('online', wake);
		// focus は「ユーザーが画面に戻ってきた」タイミングでもあるので、
		// online とは別に扱い未確認件数もここでリセットする
		window.addEventListener('focus', () => {
			wake();
			this.#unseenDone = 0;
		});
		document.addEventListener('visibilitychange', () => {
			if (!document.hidden) {
				wake();
				this.#unseenDone = 0;
			}
		});
	}

	/** 生成完了の通知。タブが見えている間は何もしない (見えていないときだけ集約通知する) */
	#notifyDone(record: HistoryRecord) {
		if (!settings.value.notifyOnComplete) return;
		if (document.hidden === false && document.hasFocus()) return;
		this.#unseenDone++;
		const title =
			this.#unseenDone > 1 ? `${this.#unseenDone}件の生成が完了しました` : '生成が完了しました';
		// ボスが来たモードで通知センターにプロンプトを出すと隠す意味が無くなるため本文は出さない
		let body: string | undefined;
		if (!bossMode.value) {
			const flat = record.params.prompt.replace(/\s+/g, ' ').trim();
			body = flat ? (flat.length > 60 ? `${flat.slice(0, 60)}…` : flat) : undefined;
		}
		showNotification({ title, body, group: NOTIFY_GROUP_DONE });
	}

	/** 生成失敗の通知。件数集約はしない (エラーは個別に内容を確認したいため) */
	#notifyError(message: string) {
		if (!settings.value.notifyOnComplete) return;
		if (document.hidden === false && document.hasFocus()) return;
		const body = message.length > 60 ? `${message.slice(0, 60)}…` : message;
		showNotification({ title: '生成に失敗しました', body, group: NOTIFY_GROUP_ERROR });
	}

	/** ポーリングが止まっているジョブの監視を再開する */
	resume() {
		for (const job of jobs.value) {
			if (!this.#polling.has(job.id)) this.#poll($state.snapshot(job));
		}
		this.#syncTicker();
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
		const n = Math.min(Math.max(1, Math.floor(count)), MAX_BATCH);
		return this.submitList(Array.from({ length: n }, () => params));
	}

	/** 複数の params (デッキ抽選の結果など) をまとめてキューに積む */
	async submitList(list: GenParams[]): Promise<number> {
		const target = targetFromSettings(settings.value);
		const items = list.slice(0, MAX_BATCH);
		this.error = '';
		this.batch = [];
		let queued = 0;

		for (let i = 0; i < items.length; i++) {
			// buildWorkflow はノイズシードとランダムプロンプトのシードを毎回振り直す
			let res: SubmitResult;
			try {
				res = await submitWorkflow(target, buildWorkflow(items[i]));
			} catch {
				this.error = 'サーバーに接続できませんでした';
				break;
			}
			if (res.error || !res.prompt_id) {
				this.error = res.error ?? '送信に失敗しました';
				break;
			}
			const job: QueueJob = {
				id: res.prompt_id,
				params: items[i],
				startedAt: Date.now(),
				backend: target.backend,
				endpointId: target.endpointId,
				host: target.host,
				state: 'queued',
				position: 0,
				index: i + 1,
				total: items.length
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
		try {
			await this.#pollLoop(job);
		} catch (e) {
			// 想定外の例外でループを抜けると、ジョブがキューに残ったまま二度と
			// 監視されず busy が解除されなくなるので、必ずキューから外す
			this.error = e instanceof Error ? e.message : 'ジョブの監視に失敗しました';
			this.#remove(job.id);
		} finally {
			// 再開 (resume) できるよう、抜けたら必ず監視中の印を消す
			this.#polling.delete(job.id);
		}
	}

	async #pollLoop(job: QueueJob) {
		const target: BackendTarget = {
			backend: job.backend,
			host: job.host,
			endpointId: job.endpointId
		};
		let unknown = 0;
		let offline = 0;
		let notice = '';

		while (this.#polling.has(job.id)) {
			await sleep(POLL_INTERVAL);
			if (!this.#polling.has(job.id)) return;

			const st = await pollStatus(target, job.id);
			if (!this.#polling.has(job.id)) return;

			if (st.state === 'done') {
				// 「この1本にかかった時間」を出す。連続投入では送信時刻からの経過だと
				// 前のジョブの待ち時間まで含んでしまうため、
				// サーバーが報告した実行時間 → 実行開始からの実測 → 送信からの実測 の順に採用する
				const current = jobs.value.find((j) => j.id === job.id);
				const runFrom = current?.runStartedAt ?? job.runStartedAt ?? job.startedAt;
				const measured = (Date.now() - runFrom) / 1000;
				const seconds =
					Math.round((st.execSeconds != null && st.execSeconds > 0 ? st.execSeconds : measured) * 10) /
					10;
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
				this.#notifyDone(record);
				this.#remove(job.id);
				return;
			}
			if (st.state === 'error') {
				this.error = st.message;
				this.#notifyError(st.message);
				this.#remove(job.id);
				return;
			}
			// 中断はエラーではないので静かにキューから外す
			if (st.state === 'cancelled') {
				this.#remove(job.id);
				return;
			}
			// 通信不能はジョブの失敗ではないので、しばらく待って再試行する
			if (st.state === 'offline') {
				offline++;
				if (offline >= OFFLINE_LIMIT) {
					this.error = `${st.message} (再接続できないため監視を打ち切りました)`;
					this.#remove(job.id);
					return;
				}
				if (offline === OFFLINE_NOTICE && this.error === '') {
					notice = `${st.message} · 再接続を待っています`;
					this.error = notice;
				}
				continue;
			}
			if (offline > 0) {
				offline = 0;
				// 自分で出した再接続待ちの表示だけを消す
				if (notice && this.error === notice) this.error = '';
				notice = '';
			}

			if (st.state === 'queued') {
				this.#update(job.id, { state: 'queued', position: st.position });
			} else if (st.state === 'running') {
				const cur = jobs.value.find((j) => j.id === job.id);
				this.#update(job.id, {
					state: 'running',
					runStartedAt: cur?.runStartedAt ?? Date.now()
				});
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

/**
 * ジョブの経過秒数。実行中は実行開始からの時間 (キュー待ちを含まない)、
 * 待機中は投入からの時間を返す。
 */
export function jobElapsed(job: QueueJob, now: number): number {
	const from = job.state === 'running' ? (job.runStartedAt ?? job.startedAt) : job.startedAt;
	return Math.max(0, (now - from) / 1000);
}
