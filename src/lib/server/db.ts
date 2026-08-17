// 生成履歴の永続化 (SQLite)。DB ファイルは data/history.sqlite に作成される。
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

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

const db = new Database(path.join(DATA_DIR, 'history.sqlite'));
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
