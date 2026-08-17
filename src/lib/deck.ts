// デッキ: 入力設定のスナップショット (カード) を溜めておき、
// 実行時に重みへ比例した確率で抽選して生成する (復元抽選)。
// 重み 0.3 のカードは 0.1 のカードより3倍出やすい。0 は出現しない。
import type { DeckCard } from './stores.svelte';
import type { GenParams } from './workflow';

/** 抽選対象 (重み > 0) のカード */
export function aliveCards(cards: DeckCard[]): DeckCard[] {
	return cards.filter((c) => c.weight > 0);
}

export function totalWeight(cards: DeckCard[]): number {
	return aliveCards(cards).reduce((s, c) => s + c.weight, 0);
}

/** カードの出現率 (0〜1) */
export function appearanceRate(card: DeckCard, cards: DeckCard[]): number {
	const total = totalWeight(cards);
	if (card.weight <= 0 || total <= 0) return 0;
	return card.weight / total;
}

/** 重みに比例した確率でカードを1枚引く */
export function drawCard(
	cards: DeckCard[],
	rand: () => number = Math.random
): DeckCard | null {
	const alive = aliveCards(cards);
	const total = totalWeight(alive);
	if (total <= 0) return null;
	let r = rand() * total;
	for (const c of alive) {
		r -= c.weight;
		if (r <= 0) return c;
	}
	return alive[alive.length - 1] ?? null;
}

/** count 回抽選して、実行する params のリストを作る */
export function drawParams(
	cards: DeckCard[],
	count: number,
	rand: () => number = Math.random
): GenParams[] {
	const out: GenParams[] = [];
	for (let i = 0; i < count; i++) {
		const c = drawCard(cards, rand);
		if (!c) break;
		out.push(structuredClone(c.params));
	}
	return out;
}
