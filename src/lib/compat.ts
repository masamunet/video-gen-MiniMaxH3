// 非セキュアコンテキスト (https でも localhost でもない http://LAN ホストなど) では
// crypto.randomUUID / navigator.clipboard が使えないため、フォールバックを提供する。

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
