// 生成履歴・レシピの永続化 (SQLite)。
//
// 開発環境と本番環境で DB ファイルは完全に分離される:
//   - 開発 (vite dev):        data/dev.sqlite
//   - 本番 (build 後の実行):   data/prod.sqlite
//   - 環境変数 VIDEO_GEN_DB_PATH でパスを明示的に上書き可能
//
// ⚠️ 本番 DB (prod.sqlite / VIDEO_GEN_DB_PATH の指す先) には機密情報が含まれる。
//    AI エージェントはいかなる手段でも本番 DB を読んではならない (CLAUDE.md 参照)。
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

export interface HistoryRow {
	id: string;
	date: number;
	params: string; // GenParams JSON
	jpPrompt: string;
	enPrompt: string;
	seconds: number;
	video: string | null; // VideoFile JSON
}

const DATA_DIR = path.resolve('data');
mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH =
	env.VIDEO_GEN_DB_PATH || path.join(DATA_DIR, dev ? 'dev.sqlite' : 'prod.sqlite');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
	CREATE TABLE IF NOT EXISTS history (
		id TEXT PRIMARY KEY,
		date INTEGER NOT NULL,
		params TEXT NOT NULL,
		jpPrompt TEXT NOT NULL DEFAULT '',
		enPrompt TEXT NOT NULL DEFAULT '',
		seconds REAL NOT NULL DEFAULT 0,
		video TEXT
	);
	CREATE INDEX IF NOT EXISTS idx_history_date ON history(date DESC);
	CREATE TABLE IF NOT EXISTS recipes (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		data TEXT NOT NULL,
		rating INTEGER NOT NULL DEFAULT 0,
		favorite INTEGER NOT NULL DEFAULT 0,
		comment TEXT NOT NULL DEFAULT '',
		createdAt INTEGER NOT NULL,
		updatedAt INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_recipes_updated ON recipes(favorite DESC, updatedAt DESC);
`);

const insertStmt = db.prepare(`
	INSERT OR REPLACE INTO history (id, date, params, jpPrompt, enPrompt, seconds, video)
	VALUES (@id, @date, @params, @jpPrompt, @enPrompt, @seconds, @video)
`);
const listStmt = db.prepare('SELECT * FROM history ORDER BY date DESC');
const deleteStmt = db.prepare('DELETE FROM history WHERE id = ?');

export function listHistory(): HistoryRow[] {
	return listStmt.all() as HistoryRow[];
}

export function insertHistory(row: HistoryRow): void {
	insertStmt.run(row);
}

export function deleteHistory(id: string): void {
	deleteStmt.run(id);
}

/** 履歴をまとめて削除する (ComfyUI サーバー上の動画ファイルは消さない) */
export function deleteHistoryMany(ids: string[]): number {
	const run = db.transaction((list: string[]) => {
		let n = 0;
		for (const id of list) n += deleteStmt.run(id).changes;
		return n;
	});
	return run(ids);
}

// ── レシピ (プロンプトビルダー) ──

export interface RecipeRow {
	id: string;
	name: string;
	data: string; // BuilderData JSON
	rating: number;
	favorite: number; // 0 | 1
	comment: string;
	createdAt: number;
	updatedAt: number;
}

const recipeUpsert = db.prepare(`
	INSERT OR REPLACE INTO recipes (id, name, data, rating, favorite, comment, createdAt, updatedAt)
	VALUES (@id, @name, @data, @rating, @favorite, @comment, @createdAt, @updatedAt)
`);
const recipeList = db.prepare('SELECT * FROM recipes ORDER BY favorite DESC, updatedAt DESC');
const recipeDelete = db.prepare('DELETE FROM recipes WHERE id = ?');

export function listRecipes(): RecipeRow[] {
	return recipeList.all() as RecipeRow[];
}

export function upsertRecipe(row: RecipeRow): void {
	recipeUpsert.run(row);
}

export function deleteRecipe(id: string): void {
	recipeDelete.run(id);
}
