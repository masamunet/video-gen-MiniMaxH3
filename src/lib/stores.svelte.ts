import { browser } from '$app/environment';
import { DEFAULT_PARAMS, type GenParams } from './workflow';
import { DEFAULT_BUILDER, normalizeBuilder, type BuilderData } from './promptBuilder';

/**
 * RunPod の実行タイムアウト既定値 (分)。RunPod 側の既定は 10 分しかなく、
 * メガピクセルや duration を上げた生成が executionTimeout で打ち切られる。
 */
export const DEFAULT_EXEC_TIMEOUT_MIN = 30;

/** localStorage に自動保存されるリアクティブな値 */
export class Persisted<T> {
	value = $state() as T;

	constructor(key: string, initial: T) {
		let v = initial;
		if (browser) {
			try {
				const raw = localStorage.getItem(key);
				if (raw != null) {
					const parsed = JSON.parse(raw) as T;
					v =
						!Array.isArray(initial) && typeof initial === 'object' && initial !== null
							? { ...initial, ...(parsed as object) }
							: parsed;
				}
			} catch {
				// 壊れた保存値は初期値で上書き
			}
		}
		this.value = v;

		if (browser) {
			$effect.root(() => {
				$effect(() => {
					localStorage.setItem(key, JSON.stringify(this.value));
				});
			});
		}
	}
}

export type Backend = 'comfy' | 'runpod';

export interface Settings {
	host: string;
	/** 生成に使う API サーバー */
	backend: Backend;
	/** RunPod Serverless の Endpoint ID (API キーはサーバー側の環境変数 RUNPOD_API_KEY) */
	runpodEndpointId: string;
	/** RunPod ワーカーの時間単価 (USD/hr) */
	runpodCostPerHour: number;
	/** RunPod ジョブ1件あたりの実行タイムアウト (分)。超えると TIMED_OUT で失敗する */
	runpodExecutionTimeoutMin: number;
	/** ドル円レート */
	usdJpy: number;
	/** 生成完了時にデスクトップ通知を出すか (タブが非表示・非フォーカスのときだけ通知する) */
	notifyOnComplete: boolean;
}

export interface VideoFile {
	filename: string;
	subfolder: string;
	type: string;
}

export interface HistoryRecord {
	id: string;
	date: number;
	params: GenParams;
	/** ランダムプロンプト整形後の最終日本語プロンプト */
	jpPrompt: string;
	/** 翻訳・タグ復元後の最終英語プロンプト */
	enPrompt: string;
	/** この1本の生成にかかった秒数 (キュー待ち時間は含まない) */
	seconds: number;
	video: VideoFile | null;
	/** 生成に使ったバックエンド (旧データは undefined = comfy) */
	backend?: Backend;
	/** サーバーが報告した実行秒数 (RunPod は課金対象時間、ComfyUI は execution_start〜success) */
	execSeconds?: number | null;
}

export const settings = new Persisted<Settings>('vg:settings', {
	host: 'http://localhost:8000/',
	backend: 'comfy',
	runpodEndpointId: 'your-runpod-endpoint-id',
	runpodCostPerHour: 1.1,
	runpodExecutionTimeoutMin: DEFAULT_EXEC_TIMEOUT_MIN,
	usdJpy: 165,
	notifyOnComplete: false
});

export const params = new Persisted<GenParams>('vg:params', DEFAULT_PARAMS);

/**
 * キューに積まれた生成ジョブ。リロードしてもポーリングを再開できるよう永続化する。
 * ComfyUI の Batch Count と同様、1回の操作で複数ジョブを投入できる。
 */
export interface QueueJob {
	id: string;
	params: GenParams;
	startedAt: number;
	backend: Backend;
	endpointId: string;
	host: string;
	state: 'queued' | 'running';
	/** 実際に実行が始まった時刻 (ポーリングで running を最初に見た時)。待ち時間を除いた計測に使う */
	runStartedAt?: number;
	/** ComfyUI のキュー待ち順 (0 なら不明) */
	position: number;
	/** 同時投入したバッチ内の位置 (1 始まり) と総数 */
	index: number;
	total: number;
}

export const jobs = new Persisted<QueueJob[]>('vg:jobs', []);

/**
 * デッキのカード。入力設定のスナップショットと出現率の重み。
 * デッキ実行時に重みに比例した確率で抽選され、選ばれたカードの設定で生成される。
 */
export interface DeckCard {
	id: string;
	/** カードの表示名 (空ならプロンプトを表示) */
	title?: string;
	params: GenParams;
	/** 出現率の重み (0〜1、0.1刻み)。0 のカードは出現しない */
	weight: number;
	createdAt: number;
}

export const deck = new Persisted<DeckCard[]>('vg:deck', []);

/**
 * 構築中デッキとして読み込んでいる保存済みデッキの ID。
 * 生成画面とデッキ管理画面で共有し、上書き保存の対象になる。
 */
export const editingDeckId = new Persisted<string | null>('vg:editingDeckId', null);

/** デッキライブラリに保存されたデッキ (サーバー側 SQLite に永続化) */
export interface SavedDeck {
	id: string;
	name: string;
	cards: DeckCard[];
	createdAt: number;
	updatedAt: number;
}

// 旧形式 (単一の実行中ジョブ) が残っていればキューへ移す
if (browser) {
	try {
		const raw = localStorage.getItem('vg:pending');
		const old = raw ? JSON.parse(raw) : null;
		if (old?.id && !jobs.value.some((j) => j.id === old.id)) {
			jobs.value = [
				...jobs.value,
				{
					id: old.id,
					params: old.params,
					startedAt: old.startedAt ?? Date.now(),
					backend: old.backend ?? 'comfy',
					endpointId: old.endpointId ?? '',
					host: old.host ?? '',
					state: 'queued',
					position: 0,
					index: 1,
					total: 1
				}
			];
		}
		if (raw) localStorage.removeItem('vg:pending');
	} catch {
		// 壊れた保存値は無視
	}
}

/** プロンプトビルダーの下書き (前回を記憶)。旧形式の保存値は正規化して読み込む */
export const builder = new Persisted<BuilderData>('vg:builder', DEFAULT_BUILDER);
if (browser) builder.value = normalizeBuilder(builder.value);

/**
 * ボスが来たモード。ON の間はすべての動画をグレーのプレースホルダーで表示する。
 * ロゴクリックで ON、メニューの「生成」クリックで OFF (リロードしても維持)。
 */
export const bossMode = new Persisted<boolean>('vg:boss', false);

/** 生成履歴。サーバー側の SQLite (/api/history) に保存する */
class HistoryStore {
	value = $state<HistoryRecord[]>([]);
	loaded = $state(false);

	constructor() {
		if (browser) this.load();
	}

	private async load() {
		await this.migrateFromLocalStorage();
		try {
			const res = await fetch('/api/history');
			if (res.ok) this.value = await res.json();
		} catch {
			// サーバー未起動時などは空のまま
		}
		this.loaded = true;
	}

	/** 旧バージョンが localStorage に残した履歴を一度だけ SQLite へ移す */
	private async migrateFromLocalStorage() {
		try {
			const raw = localStorage.getItem('vg:history');
			if (!raw) return;
			const old = JSON.parse(raw) as HistoryRecord[];
			for (const rec of old) {
				await fetch('/api/history', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(rec)
				});
			}
			localStorage.removeItem('vg:history');
		} catch {
			// 移行失敗時は localStorage を残して次回に再試行
		}
	}

	add(record: HistoryRecord) {
		this.value = [record, ...this.value];
		fetch('/api/history', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(record)
		}).catch(() => {});
	}

	remove(id: string) {
		this.value = this.value.filter((r) => r.id !== id);
		fetch(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
	}

	/** まとめて削除する (ComfyUI サーバー上の動画ファイルは残る) */
	removeMany(ids: string[]) {
		if (ids.length === 0) return;
		const set = new Set(ids);
		this.value = this.value.filter((r) => !set.has(r.id));
		fetch('/api/history', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids })
		}).catch(() => {});
	}
}

export const history = new HistoryStore();
