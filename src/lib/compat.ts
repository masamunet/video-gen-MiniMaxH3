// 非セキュアコンテキスト (https でも localhost でもない http://LAN ホストなど) では
// crypto.randomUUID / navigator.clipboard が使えないため、フォールバックを提供する。
// Notification API も同様に非セキュアコンテキストでは使えないため、ここで吸収する。

/** crypto.randomUUID の非セキュアコンテキスト対応版 */
export function randomId(): string {
	// 非セキュアコンテキストでは randomUUID が存在しないため型どおりに頼れない
	const c = crypto as Partial<Crypto> & Pick<Crypto, 'getRandomValues'>;
	if (typeof c.randomUUID === 'function') {
		return c.randomUUID();
	}
	// getRandomValues は非セキュアコンテキストでも使える。UUID v4 を自前で組む
	const b = c.getRandomValues(new Uint8Array(16));
	b[6] = (b[6] & 0x0f) | 0x40;
	b[8] = (b[8] & 0x3f) | 0x80;
	const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
	return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`;
}

/** クリップボードへコピー。Clipboard API が使えない環境では execCommand にフォールバック */
export async function copyText(text: string): Promise<boolean> {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		// フォールバックへ
	}
	const ta = document.createElement('textarea');
	ta.value = text;
	ta.style.position = 'fixed';
	ta.style.opacity = '0';
	document.body.appendChild(ta);
	ta.focus();
	ta.select();
	let ok = false;
	try {
		ok = document.execCommand('copy');
	} catch {
		ok = false;
	}
	ta.remove();
	return ok;
}

/**
 * Notification API が使えるか。`isSecureContext` を必ず見る必要がある —
 * Chrome は非セキュアコンテキストでも `Notification` オブジェクト自体は
 * window に露出しているが、`requestPermission()` を呼ぶと即座に 'denied' になる
 * (ユーザーに許可ダイアログすら出ない) ため、`'Notification' in window` だけでは
 * 対応可否を誤判定してしまう。
 */
export function notifySupported(): boolean {
	return typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext === true;
}

/** 現在の通知許可状態。非対応環境では 'unsupported' を返す */
export function notifyPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
	if (!notifySupported()) return 'unsupported';
	return Notification.permission;
}

/** 通知の許可をユーザーに要求する。非対応環境では要求せず 'unsupported' を返す */
export async function requestNotifyPermission(): Promise<
	'granted' | 'denied' | 'default' | 'unsupported'
> {
	if (!notifySupported()) return 'unsupported';
	try {
		// requestPermission は仕様上 Promise を返すが、古い実装はコールバック版しか
		// 持たない。1回の呼び出しで両方に対応するため、コールバックを渡しつつ
		// 戻り値が Promise であればそちらの解決も拾う (二重にダイアログを
		// 出さないよう requestPermission 自体は1回しか呼ばない)
		return await new Promise<NotificationPermission>((resolve, reject) => {
			const p = Notification.requestPermission(resolve);
			if (p && typeof p.then === 'function') {
				p.then(resolve, reject);
			}
		});
	} catch {
		return 'denied';
	}
}

/** group ごとに直前に出した通知。次を出すときに閉じて通知センターに積み上げないため */
const lastNotification = new Map<string, Notification>();
/** 通知ごとに違う tag を振るための連番 */
let notifySeq = 0;

/**
 * デスクトップ通知を表示する。許可されていない・非対応・生成失敗のいずれでも
 * 例外を投げず false を返す (呼び出し元はキュー監視ループなど、
 * 例外で処理が壊れると困る場所から呼ばれるため)。
 *
 * group を渡すと「同じ group の通知は常に1件だけ」になる。
 * 同一 tag による OS の上書きを使わないのは、上書きではバナーが出し直されず
 * 音も鳴らないため — 連続生成の2件目以降にユーザーが気づけなくなる。
 * 代わりに毎回ユニークな tag で新規通知として出し (必ず再通知される)、
 * 直前の1件は自分で閉じて積み上がりを防ぐ。
 */
export function showNotification(opts: { title: string; body?: string; group?: string }): boolean {
	if (notifyPermission() !== 'granted') return false;
	try {
		const group = opts.group;
		if (group) lastNotification.get(group)?.close();
		// icon は指定しない。static/favicon.svg は SVG のため
		// Chrome の通知アイコンとしては描画されない (ラスター画像が必要)
		const n = new Notification(opts.title, {
			body: opts.body,
			tag: group ? `${group}:${++notifySeq}` : undefined
		});
		n.onclick = () => {
			window.focus();
			n.close();
		};
		if (group) {
			lastNotification.set(group, n);
			// 閉じられた通知の参照を持ち続けない
			n.onclose = () => {
				if (lastNotification.get(group) === n) lastNotification.delete(group);
			};
		}
		return true;
	} catch {
		return false;
	}
}
