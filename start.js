// 本番サーバー (adapter-node) の起動ラッパー。
//
// adapter-node は LAN の他マシンから http://ホスト名:3000 で見えるよう 0.0.0.0 で
// 待ち受ける。この待ち受け先は変えられない (localhost に絞ると LAN から繋がらなくなる) が、
// 起動ログの "Listening on http://0.0.0.0:3000" はそのままではクリックしても開けないため、
// 表示だけを localhost に置き換える。
const log = console.log;

console.log = (...args) => {
	log(...args.map((a) => (typeof a === 'string' ? a.replaceAll('0.0.0.0', 'localhost') : a)));
	// 置き換えたいのは起動時の1行だけなので、出したらすぐ元に戻す
	// (アプリのログに含まれる IP を書き換えてしまわないため)
	if (args.some((a) => typeof a === 'string' && a.includes('Listening'))) console.log = log;
};

await import('./build/index.js');
