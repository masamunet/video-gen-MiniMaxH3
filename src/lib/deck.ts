// デッキ: 入力設定のスナップショット (カード) を溜めておき、実行時に山札から引く。
//
// 引き方は「デッキ」の名のとおり非復元抽選 (シャッフル方式)。
// 重みは「山札に入る枚数」として扱い、重みが全部同じなら各カード1枚ずつの
// 山札になるよう約分する。そのため N 枚のデッキを N 回まわせば全カードが1回ずつ出る。
// 重み 0.3 のカードは 0.1 のカードの3倍の枚数が山札に入る。0 は山札に入らない。
// 山札を引き切ったら新しく切り直す。
import type { DeckCard } from './stores.svelte';
import type { GenParams } from './workflow';

/** 抽選対象 (重み > 0) のカード */
export function aliveCards(cards: DeckCard[]): DeckCard[] {
	return cards.filter((c) => c.weight > 0);
}

export function totalWeight(cards: DeckCard[]): number {
	return aliveCards(cards).reduce((s, c) => s + c.weight, 0);
}

/** カードの出現率 (0〜1)。長い目で見た割合 = 山札に占める枚数の割合 */
export function appearanceRate(card: DeckCard, cards: DeckCard[]): number {
	const total = totalWeight(cards);
	if (card.weight <= 0 || total <= 0) return 0;
	return card.weight / total;
}

function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b);
}

/**
 * 各カードが山札に入る枚数。
 * 重みを 0.1 単位の整数に直し、最大公約数で約分して最小の山札にする
 * (例: 0.5/0.5/0.5 → 1枚ずつ、0.3/0.1 → 3枚と1枚)。
 */
export function cardCopies(cards: DeckCard[]): { card: DeckCard; copies: number }[] {
	const alive = aliveCards(cards);
	if (alive.length === 0) return [];
	const units = alive.map((c) => Math.max(1, Math.round(c.weight * 10)));
	const g = units.reduce((a, b) => gcd(a, b));
	return alive.map((card, i) => ({ card, copies: units[i] / g }));
}

/** 山札1周分の枚数 */
export function pileSize(cards: DeckCard[]): number {
	return cardCopies(cards).reduce((s, c) => s + c.copies, 0);
}

/** 山札を作ってシャッフルする (Fisher-Yates) */
export function shufflePile(cards: DeckCard[], rand: () => number = Math.random): DeckCard[] {
	const pile: DeckCard[] = [];
	for (const { card, copies } of cardCopies(cards)) {
		for (let i = 0; i < copies; i++) pile.push(card);
	}
	for (let i = pile.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[pile[i], pile[j]] = [pile[j], pile[i]];
	}
	return pile;
}

/** count 回ぶん引いて、実行する params のリストを作る (引き切ったら切り直す) */
export function drawParams(
	cards: DeckCard[],
	count: number,
	rand: () => number = Math.random
): GenParams[] {
	const out: GenParams[] = [];
	let pile: DeckCard[] = [];
	for (let i = 0; i < count; i++) {
		if (pile.length === 0) {
			pile = shufflePile(cards, rand);
			if (pile.length === 0) break;
		}
		out.push(structuredClone(pile.pop()!.params));
	}
	return out;
}
