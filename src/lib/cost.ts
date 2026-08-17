// RunPod Serverless の生成コスト計算。
// RunPod はワーカーの実行時間で課金されるため、可能なら RunPod が返す
// executionTime (execSeconds) を使い、無ければ実測の経過秒数で概算する。

export interface CostSettings {
	/** ワーカーの時間単価 (USD/hr) */
	costPerHour: number;
	/** ドル円レート */
	usdJpy: number;
}

export function costUsd(seconds: number, costPerHour: number): number {
	if (!(seconds > 0) || !(costPerHour > 0)) return 0;
	return (seconds * costPerHour) / 3600;
}

/** 表示用に "¥9.1 ($0.055)" の形にする */
export function fmtCost(seconds: number, s: CostSettings): string {
	const usd = costUsd(seconds, s.costPerHour);
	const jpy = usd * (s.usdJpy || 0);
	return `¥${jpy.toFixed(1)} ($${usd.toFixed(3)})`;
}

/** 合計表示用 (円は整数、ドルは小数2桁) */
export function fmtCostTotal(seconds: number, s: CostSettings): string {
	const usd = costUsd(seconds, s.costPerHour);
	const jpy = usd * (s.usdJpy || 0);
	return `¥${Math.round(jpy).toLocaleString('ja-JP')} ($${usd.toFixed(2)})`;
}

/** コスト計算に使う秒数 (RunPod の実行時間が分かればそれを優先) */
export function billableSeconds(rec: { seconds: number; execSeconds?: number | null }): number {
	return rec.execSeconds != null && rec.execSeconds > 0 ? rec.execSeconds : rec.seconds;
}
