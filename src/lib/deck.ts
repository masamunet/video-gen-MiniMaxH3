// デッキ: 入力設定のスナップショット (カード) を溜めておき、実行時に山札から引く。
//
// 実行ボタン1回 = 1つのドロー・セッション。押すたびにその場のデッキから
// 新しくシャッフルした山札で引く。山札には各カードが1枚ずつ入り、引くときは
//   P(カード) = カードの重み / 残りカードの重みの合計
// の確率で1枚選び、引いたカードは山札から除く (重み付き非復元抽選)。
// そのため1回の実行で N 枚引けば必ず N 種類の別カードになる (N ≤ 山札枚数のとき)。
// 1回の実行内で山札を引き切った場合のみ、全カードを戻して引き直して続行する。
// 例: A=0.5, B=0.2, C=0.1 なら最初の1枚は A が 5/8、B が 2/8、C が 1/8。
import type { DeckCard } from './stores.svelte';
import type { GenParams } from './workflow';

/** 抽選対象 (重み > 0) のカード */
export function aliveCards(cards: DeckCard[]): DeckCard[] {
	return cards.filter((c) => c.weight > 0);
}

export function totalWeight(cards: DeckCard[]): number {
	return aliveCards(cards).reduce((s, c) => s + c.weight, 0);
}

/** カードの出現率 (0〜1) = 重み / デッキ全体の重みの合計 (山札がフルのとき次の1枚に選ばれる確率) */
export function appearanceRate(card: DeckCard, cards: DeckCard[]): number {
	const total = totalWeight(cards);
	if (card.weight <= 0 || total <= 0) return 0;
	return card.weight / total;
}

/** 山札1周分の枚数 = 抽選対象カードの種類数 */
export function pileSize(cards: DeckCard[]): number {
	return aliveCards(cards).length;
}

/**
 * 重み付き非復元で山札1周分の引き順を作る。
 * 各ステップで残りカードから P = 重み / 残り重みの合計 で1枚選ぶ。
 * 戻り値の先頭が最初に引かれるカード。
 */
export function weightedOrder(
	cards: DeckCard[],
	rand: () => number = Math.random
): DeckCard[] {
	const pool = [...aliveCards(cards)];
	const out: DeckCard[] = [];
	while (pool.length > 0) {
		const total = pool.reduce((s, c) => s + c.weight, 0);
		let r = rand() * total;
		let idx = pool.length - 1;
		for (let i = 0; i < pool.length; i++) {
			r -= pool[i].weight;
			if (r <= 0) {
				idx = i;
				break;
			}
		}
		out.push(pool[idx]);
		pool.splice(idx, 1);
	}
	return out;
}

/**
 * 1回の実行として count 枚引き、実行する params のリストを作る。
 * 呼び出しごとに新しい山札で始め、実行内で引き切った場合のみ引き直して続行する。
 */
export function drawParams(
	cards: DeckCard[],
	count: number,
	rand: () => number = Math.random
): GenParams[] {
	const out: GenParams[] = [];
	let remaining: DeckCard[] = [];
	for (let i = 0; i < count; i++) {
		if (remaining.length === 0) {
			remaining = weightedOrder(cards, rand);
			if (remaining.length === 0) break;
		}
		out.push(structuredClone(remaining.shift()!.params));
	}
	return out;
}
