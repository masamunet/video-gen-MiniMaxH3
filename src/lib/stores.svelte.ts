import { browser } from '$app/environment';
import { DEFAULT_PARAMS, type GenParams } from './workflow';
import { DEFAULT_BUILDER, normalizeBuilder, type BuilderData } from './promptBuilder';

/** localStorage に自動保存されるリアクティブな値 */
class Persisted<T> {
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
	/** 生成にかかった秒数 */
	seconds: number;
	video: VideoFile | null;
}

export const settings = new Persisted<Settings>('vg:settings', {
	host: 'http://localhost:8000/',
	backend: 'comfy',
	runpodEndpointId: 'your-runpod-endpoint-id'
});

export const params = new Persisted<GenParams>('vg:params', DEFAULT_PARAMS);

/** 実行中ジョブ。リロードしてもポーリングを再開できるよう永続化する */
export interface PendingJob {
	id: string;
	params: GenParams;
	startedAt: number;
	/** 送信先バックエンド (旧データは undefined = comfy) */
	backend?: Backend;
	endpointId?: string;
	host?: string;
}

export const pending = new Persisted<PendingJob | null>('vg:pending', null);

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
