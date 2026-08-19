// 本番サーバー (adapter-node) の起動ラッパー。
//
// 1) 待ち受けはループバックのみ。このアプリは同じマシンのブラウザからしか使わないので、
//    adapter-node 既定の 0.0.0.0 だと LAN の誰でも履歴 API を叩けてしまう。
//    HOST=localhost と書くと adapter-node は IPv6 の ::1 だけを掴み、127.0.0.1 宛の
//    接続が拒否されるため、IPv4 ループバックを明示する。
//    LAN に公開したくなったら HOST=0.0.0.0 を渡せば上書きできる。
// 2) 起動ログは待ち受けアドレスをそのまま出す (http://127.0.0.1:3000) ので、
//    ループバックのときだけ表示を localhost に直す。
process.env.HOST ??= '127.0.0.1';

const log = console.log;

console.log = (...args) => {
	log(
		...args.map((a) =>
			typeof a === 'string' ? a.replaceAll('127.0.0.1', 'localhost').replaceAll('[::1]', 'localhost') : a
		)
	);
	// 置き換えたいのは起動時の1行だけなので、出したらすぐ元に戻す
	// (アプリのログに含まれる IP を書き換えてしまわないため)
	if (args.some((a) => typeof a === 'string' && a.includes('Listening'))) console.log = log;
};

await import('./build/index.js');
