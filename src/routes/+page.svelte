<script lang="ts">
	import Clapperboard from '@lucide/svelte/icons/clapperboard';
	import Play from '@lucide/svelte/icons/play';
	import Download from '@lucide/svelte/icons/download';
	import Timer from '@lucide/svelte/icons/timer';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';
	import CircleStop from '@lucide/svelte/icons/circle-stop';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Languages from '@lucide/svelte/icons/languages';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import History from '@lucide/svelte/icons/history';
	import CircleDollarSign from '@lucide/svelte/icons/circle-dollar-sign';
	import ListVideo from '@lucide/svelte/icons/list-video';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Clock from '@lucide/svelte/icons/clock';
	import X from '@lucide/svelte/icons/x';

	import { settings, params, history, bossMode, type HistoryRecord } from '$lib/stores.svelte';
	import { copyText } from '$lib/compat';
	import { billableSeconds, fmtCost } from '$lib/cost';
	import { FALLBACK_ASPECT_RATIOS } from '$lib/workflow';
	import { videoUrl, fetchResolutionOptions, fmtSeconds } from '$lib/comfy';
	import { queue, jobElapsed, MAX_BATCH } from '$lib/queue.svelte';
	import { previewVideo } from '$lib/media';
	import VideoModal from '$lib/components/VideoModal.svelte';
	import TestPattern from '$lib/components/TestPattern.svelte';

	const host = $derived(settings.value.host);
	const boss = $derived(bossMode.value);

	/** 同時に投入する本数 (ComfyUI の Batch Count 相当) */
	let batchCount = $state(1);
	let submitting = $state(false);

	const activeJobs = $derived(queue.list);
	const busy = $derived(activeJobs.length > 0 || submitting);
	const runningJob = $derived(activeJobs.find((j) => j.state === 'running') ?? activeJobs[0]);
	const errorMsg = $derived(queue.error);

	let viewRecord = $state<HistoryRecord | null>(history.value[0] ?? null);

	// 履歴のロード完了後、未表示なら最新の結果を出力ペインに表示する
	$effect(() => {
		if (history.loaded && !viewRecord && !busy) {
			viewRecord = history.value[0] ?? null;
		}
	});
	// ジョブが完了するたびに出力ペインを最新の結果に切り替える
	$effect(() => {
		const done = queue.lastCompleted;
		if (done) viewRecord = done;
	});
	let modalOpen = $state(false);
	let copied = $state(false);

	/**
	 * 生成中は経過秒数のパネルを出すが、履歴サムネイルやカルーセルを操作したときは
	 * 結果表示に切り替える (長いキューの間ずっと結果を見られないのを避ける)。
	 * 新しい投入時とキューが空になったときに解除する。
	 */
	let previewOverride = $state(false);
	$effect(() => {
		if (activeJobs.length === 0) previewOverride = false;
	});

	// ── 出力ペインのカルーセル (履歴を新しい順にたどる) ──
	const viewIndex = $derived(
		viewRecord ? history.value.findIndex((r) => r.id === viewRecord!.id) : -1
	);
	const canPrev = $derived(viewIndex > 0); // より新しい方へ
	const canNext = $derived(viewIndex >= 0 && viewIndex < history.value.length - 1);

	function showPrev() {
		if (canPrev) select(history.value[viewIndex - 1]);
	}
	function showNext() {
		if (canNext) select(history.value[viewIndex + 1]);
	}
	/** 結果を選んで表示する (生成中でも結果表示に切り替える) */
	function select(rec: HistoryRecord) {
		viewRecord = rec;
		if (busy) previewOverride = true;
	}

	/** 直近の投入で生成された何本目かを示す (バッチが複数本のときだけ) */
	const batchPos = $derived(
		viewRecord ? queue.batch.findIndex((r) => r.id === viewRecord!.id) : -1
	);

	// ←→ キーでも切り替えられるようにする (入力欄にフォーカスがあるときは無効)
	function onKeydown(e: KeyboardEvent) {
		const el = e.target as HTMLElement | null;
		if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
		if (modalOpen) return;
		if (e.key === 'ArrowLeft') showPrev();
		else if (e.key === 'ArrowRight') showNext();
	}

	// ── 選択肢を ComfyUI 本体から取得(API JSONと必ず一致させる) ──
	let aspectOptions = $state<string[]>(FALLBACK_ASPECT_RATIOS);
	let optsFromServer = $state(false);
	// メガピクセルは実用域に固定 (ComfyUI 側の広い定義域はそのままだと使いにくい)
	const MP_RANGE = { min: 0.1, max: 2, step: 0.1 };

	// 旧設定で範囲外の値が保存されている場合に備えて丸める
	$effect(() => {
		const p = params.value;
		const mp = Math.min(MP_RANGE.max, Math.max(MP_RANGE.min, Math.round(p.megapixels * 10) / 10));
		const duration = Math.min(20, Math.max(5, Math.round(p.duration)));
		const steps = Math.min(35, Math.max(4, Math.round(p.steps)));
		if (mp !== p.megapixels || duration !== p.duration || steps !== p.steps) {
			params.value = { ...p, megapixels: mp, duration, steps };
		}
	});

	$effect(() => {
		const h = host;
		fetchResolutionOptions(h).then((opts) => {
			if (!opts) return;
			aspectOptions = opts.aspectRatios;
			optsFromServer = true;
			if (!opts.aspectRatios.includes(params.value.aspectRatio)) {
				params.value = { ...params.value, aspectRatio: opts.aspectRatios[0] };
			}
		});
	});

	// ── 生成 (ComfyUI の Batch Count と同じく N 件をキューに積む) ──
	async function generate() {
		if (submitting || !params.value.prompt.trim()) return;
		submitting = true;
		previewOverride = false;
		try {
			await queue.submit($state.snapshot(params.value), batchCount);
		} finally {
			submitting = false;
		}
	}

	const cancelAll = () => queue.cancelAll();

	function restoreParams(record: HistoryRecord) {
		params.value = { ...record.params };
	}

	async function copyJp() {
		if (!viewRecord?.jpPrompt) return;
		if (await copyText(viewRecord.jpPrompt)) {
			copied = true;
			setTimeout(() => (copied = false), 1500);
		}
	}

	function fill(v: number, min: number, max: number) {
		return `--fill: ${((v - min) / (max - min)) * 100}%`;
	}

	function onPromptKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			generate();
		}
	}

	const recent = $derived(history.value.slice(0, 12));
	/** 下ペインのタブ */
	let bottomTab = $state<'history' | 'queue'>('history');
	// 0件→投入でキュータブへ、空になったら履歴へ。
	// 途中の完了では切り替えない (手動でタブを選んだ状態を尊重する)
	let prevJobCount = 0;
	$effect(() => {
		const n = activeJobs.length;
		if (prevJobCount === 0 && n > 0) bottomTab = 'queue';
		else if (n === 0 && prevJobCount > 0) bottomTab = 'history';
		prevJobCount = n;
	});

	function jobLabel(state: string, position: number): string {
		if (state === 'running') return '生成中';
		return position > 0 ? `キュー待ち #${position}` : 'キュー待ち';
	}

	const headLabel = $derived(
		submitting
			? '送信中…'
			: runningJob
				? jobLabel(runningJob.state, runningJob.position)
				: '生成中'
	);
	const headElapsed = $derived(runningJob ? jobElapsed(runningJob, queue.now) : 0);

	// ブラウザタブで進捗が分かるようにタイトルを動的に更新する
	const tabTitle = $derived(
		busy
			? `⏳ ${headLabel}${activeJobs.length > 1 ? ` (残${activeJobs.length}件)` : ''} ${Math.floor(headElapsed)}s | MiniMax H3`
			: errorMsg
				? '⚠️ 生成エラー | MiniMax H3'
				: viewRecord
					? `✅ 生成完了 (${fmtSeconds(viewRecord.seconds)}) | MiniMax H3`
					: 'MiniMax H3 Studio'
	);
</script>

<svelte:head>
	<title>{tabTitle}</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<!-- 列を minmax(0,1fr) で固定しないと、履歴が増えたときにグリッドごと横に広がってページに横スクロールが出る -->
<main class="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto]">
	<div class="grid min-h-0 grid-cols-[400px_minmax(0,1fr)]">
		<!-- ══════════ 左: 入力 ══════════ -->
		<section class="flex min-h-0 flex-col overflow-y-auto border-r border-edge bg-panel/40">
			<div class="flex items-center gap-2 border-b border-edge px-5 py-3">
				<span class="font-mono text-[10px] font-semibold tracking-[0.25em] text-faint uppercase">
					Input
				</span>
				{#if !optsFromServer}
					<span
						class="ml-auto flex items-center gap-1 rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 text-[10px] text-amber"
						title="ComfyUI に接続できないため既定の選択肢を表示しています"
					>
						<TriangleAlert size={10} />オフライン選択肢
					</span>
				{/if}
			</div>

			<div class="flex flex-col gap-5 p-5">
				<!-- APIサーバー -->
				<div>
					<label class="mb-1.5 block text-xs font-medium text-mute" for="backend">
						API サーバー
					</label>
					<select
						id="backend"
						class="field-input"
						bind:value={settings.value.backend}
						disabled={busy}
					>
						<option value="comfy">デスクトップマシン (ComfyUI)</option>
						<option value="runpod">RunPod Serverless</option>
					</select>
				</div>

				<!-- プロンプト -->
				<div>
					<label class="mb-1.5 block text-xs font-medium text-mute" for="prompt">
						プロンプト
					</label>
					<textarea
						id="prompt"
						class="field-input min-h-40 resize-y leading-relaxed"
						bind:value={params.value.prompt}
						onkeydown={onPromptKeydown}
						placeholder="例: 屋上、背景には山と街"
					></textarea>
					<p class="mt-1 text-right font-mono text-[10px] text-faint">⌘+Enter で生成</p>
				</div>

				<!-- アスペクト比 -->
				<div>
					<label class="mb-1.5 block text-xs font-medium text-mute" for="aspect">
						アスペクト比
					</label>
					<select id="aspect" class="field-input" bind:value={params.value.aspectRatio}>
						{#each aspectOptions as opt (opt)}
							<option value={opt}>{opt}</option>
						{/each}
					</select>
				</div>

				<!-- メガピクセル -->
				<div>
					<label class="mb-1.5 block text-xs font-medium text-mute" for="mp">
						メガピクセル
						<span class="ml-1 font-mono text-amber">{params.value.megapixels}</span>
					</label>
					<div class="flex items-center gap-3">
						<input
							id="mp"
							type="range"
							class="fader flex-1"
							min={MP_RANGE.min}
							max={MP_RANGE.max}
							step={MP_RANGE.step}
							bind:value={params.value.megapixels}
							style={fill(params.value.megapixels, MP_RANGE.min, MP_RANGE.max)}
						/>
						<input
							type="number"
							class="field-input w-20 text-center font-mono text-xs"
							min={MP_RANGE.min}
							max={MP_RANGE.max}
							step={MP_RANGE.step}
							bind:value={params.value.megapixels}
						/>
					</div>
				</div>

				<!-- duration / steps -->
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="mb-1.5 block text-xs font-medium text-mute" for="duration">
							Duration
							<span class="ml-1 font-mono text-amber">{params.value.duration}s</span>
						</label>
						<div class="flex items-center gap-2">
							<input
								id="duration"
								type="range"
								class="fader flex-1"
								min="5"
								max="20"
								step="1"
								bind:value={params.value.duration}
								style={fill(params.value.duration, 5, 20)}
							/>
							<input
								type="number"
								class="field-input w-14 px-1 text-center font-mono text-xs"
								min="5"
								max="20"
								step="1"
								bind:value={params.value.duration}
							/>
						</div>
					</div>
					<div>
						<label class="mb-1.5 block text-xs font-medium text-mute" for="steps">
							Steps
							<span class="ml-1 font-mono text-amber">{params.value.steps}</span>
						</label>
						<div class="flex items-center gap-2">
							<input
								id="steps"
								type="range"
								class="fader flex-1"
								min="4"
								max="35"
								step="1"
								bind:value={params.value.steps}
								style={fill(params.value.steps, 4, 35)}
							/>
							<input
								type="number"
								class="field-input w-14 px-1 text-center font-mono text-xs"
								min="4"
								max="35"
								step="1"
								bind:value={params.value.steps}
							/>
						</div>
					</div>
				</div>

				<!-- 生成回数 (ComfyUI の Batch Count 相当) -->
				<div>
					<label class="mb-1.5 block text-xs font-medium text-mute" for="batch">
						生成回数
						<span class="ml-1 font-mono text-amber">{batchCount}</span>
						<span class="ml-1 font-normal text-faint">回ぶんキューに積む</span>
					</label>
					<div class="flex items-center gap-2">
						<input
							id="batch"
							type="range"
							class="fader flex-1"
							min="1"
							max={MAX_BATCH}
							step="1"
							bind:value={batchCount}
							style={fill(batchCount, 1, MAX_BATCH)}
						/>
						<input
							type="number"
							class="field-input w-14 px-1 text-center font-mono text-xs"
							min="1"
							max={MAX_BATCH}
							step="1"
							bind:value={batchCount}
						/>
					</div>
				</div>

				<!-- 生成ボタン (実行中でも追加投入できる) -->
				<button
					class="group flex items-center justify-center gap-2 rounded-xl bg-amber py-3 text-sm font-bold text-black shadow-[0_0_24px_rgb(255_178_36/0.25)] transition-all hover:bg-amber/90 hover:shadow-[0_0_32px_rgb(255_178_36/0.4)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
					onclick={generate}
					disabled={!params.value.prompt.trim() || submitting}
				>
					<Sparkles size={16} class="transition-transform group-hover:rotate-12" />
					{submitting
						? '送信中…'
						: batchCount > 1
							? `${batchCount}件をキューに追加`
							: activeJobs.length > 0
								? 'キューに追加'
								: '動画を生成'}
				</button>

				{#if activeJobs.length > 0}
					<div
						class="flex items-center gap-2 rounded-xl border border-edge bg-well/60 px-3 py-2 text-[11px]"
					>
						<span class="rec-dot inline-block size-2 shrink-0 rounded-full bg-rec"></span>
						<span class="text-mute">
							<span class="font-mono text-ink">{activeJobs.length}</span> 件実行中
							{#if activeJobs.filter((j) => j.state === 'queued').length > 0}
								<span class="text-faint">
									(待機 {activeJobs.filter((j) => j.state === 'queued').length})
								</span>
							{/if}
						</span>
						<button
							class="ml-auto flex items-center gap-1 rounded-lg border border-rec/30 px-2 py-1 font-medium text-rec transition-colors hover:bg-rec/10"
							onclick={cancelAll}
						>
							<CircleStop size={12} />全キャンセル
						</button>
					</div>
				{/if}

				{#if errorMsg}
					<div
						class="fade-up flex items-start gap-2 rounded-lg border border-rec/30 bg-rec/10 p-3 text-xs leading-relaxed text-rec"
					>
						<TriangleAlert size={14} class="mt-0.5 shrink-0" />
						<span class="min-w-0 flex-1 break-all">{errorMsg}</span>
						<button
							class="shrink-0 rounded p-0.5 transition-colors hover:bg-rec/20"
							onclick={() => (queue.error = '')}
							title="閉じる"
						>
							<X size={13} />
						</button>
					</div>
				{/if}
			</div>
		</section>

		<!-- ══════════ 右: 出力 ══════════ -->
		<section class="relative flex min-h-0 flex-col">
			<div class="flex items-center gap-2 border-b border-edge px-5 py-3">
				<span class="font-mono text-[10px] font-semibold tracking-[0.25em] text-faint uppercase">
					Output
				</span>
				{#if busy}
					<span class="ml-auto flex items-center gap-2 font-mono text-[11px] text-amber">
						<span class="rec-dot inline-block size-2 rounded-full bg-rec"></span>
						{headLabel}
						{#if activeJobs.length > 1}
							<span class="text-mute">残{activeJobs.length}件</span>
						{/if}
						<span class="tabular-nums text-ink">{headElapsed.toFixed(1)}s</span>
					</span>
				{:else if viewRecord}
					<span class="ml-auto flex items-center gap-2 font-mono text-[11px] text-mute">
						{#if viewRecord.backend === 'runpod'}
							<span
								class="flex items-center gap-1 rounded border border-amber/25 bg-amber/10 px-1.5 py-0.5 text-amber"
								title="RunPod のコスト概算 (実行 {billableSeconds(viewRecord).toFixed(
									1
								)}秒 × ${settings.value.runpodCostPerHour}/hr)"
							>
								<CircleDollarSign size={11} />
								{fmtCost(billableSeconds(viewRecord), {
									costPerHour: settings.value.runpodCostPerHour,
									usdJpy: settings.value.usdJpy
								})}
							</span>
						{/if}
						<span class="flex items-center gap-1">
							<Timer size={12} class="text-amber" />
							{fmtSeconds(viewRecord.seconds)}
						</span>
					</span>
				{/if}
			</div>

			<div class="flex min-h-0 flex-1 flex-col">
				{#if busy && !previewOverride}
					<!-- 生成中 (履歴サムネイルやカルーセルを操作すると結果表示に切り替わる) -->
					<div class="flex min-h-0 flex-1 items-center justify-center p-8">
						<div
							class="relative flex aspect-video w-full max-w-xl items-center justify-center overflow-hidden rounded-xl border border-edge bg-well"
						>
							<div
								class="absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-amber/10 to-transparent"
								style="animation: scanline 2.2s linear infinite"
							></div>
							<div class="relative z-10 flex flex-col items-center gap-3">
								<span class="rec-dot size-3 rounded-full bg-rec shadow-[0_0_12px_var(--color-rec)]"></span>
								<p class="font-mono text-sm tracking-widest text-mute">
									{headLabel}{activeJobs.length > 1 ? ` · 残${activeJobs.length}件` : ''}
								</p>
								<p class="font-mono text-3xl font-semibold tabular-nums text-ink">
									{headElapsed.toFixed(1)}<span class="ml-1 text-base text-faint">s</span>
								</p>
							</div>
						</div>
					</div>
				{:else if viewRecord}
					<!-- 結果表示 (複数件あるときは前後に送れるカルーセル) -->
					<div class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-5">
						{#if history.value.length > 1}
							<button
								class="absolute top-1/2 left-2 z-10 -translate-y-1/2 rounded-full border border-edge bg-panel/85 p-2 text-mute backdrop-blur transition-all hover:border-edge2 hover:text-ink disabled:pointer-events-none disabled:opacity-0"
								onclick={showPrev}
								disabled={!canPrev}
								title="新しい方へ (←)"
								aria-label="前の動画"
							>
								<ChevronLeft size={18} />
							</button>
							<button
								class="absolute top-1/2 right-2 z-10 -translate-y-1/2 rounded-full border border-edge bg-panel/85 p-2 text-mute backdrop-blur transition-all hover:border-edge2 hover:text-ink disabled:pointer-events-none disabled:opacity-0"
								onclick={showNext}
								disabled={!canNext}
								title="古い方へ (→)"
								aria-label="次の動画"
							>
								<ChevronRight size={18} />
							</button>
							<span
								class="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full border border-edge bg-panel/85 px-2.5 py-0.5 font-mono text-[10px] text-mute backdrop-blur"
							>
								{#if queue.batch.length > 1 && batchPos >= 0}
									<span class="text-amber">今回の生成 {batchPos + 1}/{queue.batch.length}</span>
								{:else}
									{viewIndex + 1} / {history.value.length}
								{/if}
							</span>
						{/if}
						{#if viewRecord.video && boss}
							<!-- ボスが来たモード: 動画の代わりに試験パターン -->
							<div class="h-full w-full overflow-hidden rounded-xl border border-edge">
								<TestPattern />
							</div>
						{:else if viewRecord.video}
							<!-- ボタンをペイン実寸いっぱいに広げ、縦長/横長どちらも確実に内接させる -->
							<button
								class="group relative flex h-full w-full items-center justify-center"
								onclick={() => (modalOpen = true)}
								title="モーダルで再生"
							>
								<!-- svelte-ignore a11y_media_has_caption -->
								<video
									use:previewVideo
									class="max-h-full max-w-full rounded-xl border border-edge object-contain shadow-2xl shadow-black/50"
									src={videoUrl(host, viewRecord.video)}
									preload="metadata"
									muted
									playsinline
								></video>
								<span
									class="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
								>
									<span class="rounded-full bg-amber p-4 text-black shadow-xl">
										<Play size={22} fill="currentColor" />
									</span>
								</span>
							</button>
						{:else}
							<p class="text-sm text-faint">動画ファイルが見つかりませんでした</p>
						{/if}
					</div>

					<!-- プロンプト情報 (長文でも動画の表示領域を潰さないよう高さを制限) -->
					<div
						class="max-h-[45%] shrink-0 space-y-2 overflow-y-auto border-t border-edge bg-panel/40 px-5 py-3"
					>
						<div class="flex items-start gap-2">
							<span
								class="mt-0.5 shrink-0 rounded border border-amber/30 bg-amber/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-widest text-amber"
								>JP</span
							>
							<p class="min-w-0 flex-1 text-[13px] leading-relaxed break-words text-ink/90">
								{viewRecord.jpPrompt || '(取得できませんでした)'}
							</p>
							<button
								class="shrink-0 rounded-md p-1.5 text-mute transition-colors hover:bg-panel2 hover:text-ink"
								onclick={copyJp}
								title="日本語プロンプトをコピー"
							>
								{#if copied}<Check size={13} class="text-ok" />{:else}<Copy size={13} />{/if}
							</button>
						</div>
						{#if viewRecord.enPrompt}
							<details class="group">
								<summary
									class="flex cursor-pointer list-none items-center gap-1.5 text-[11px] text-faint transition-colors hover:text-mute"
								>
									<Languages size={11} />
									英語プロンプトを表示
								</summary>
								<p class="mt-1.5 pl-4 text-xs leading-relaxed break-words text-mute">
									{viewRecord.enPrompt}
								</p>
							</details>
						{/if}
						<div class="flex items-center gap-2 pt-1">
							{#if viewRecord.video}
								<a
									href={videoUrl(host, viewRecord.video, true)}
									class="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-[11px] font-medium text-mute transition-colors hover:border-edge2 hover:text-ink"
								>
									<Download size={12} />ダウンロード
								</a>
							{/if}
							<button
								class="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-[11px] font-medium text-mute transition-colors hover:border-edge2 hover:text-ink"
								onclick={() => viewRecord && restoreParams(viewRecord)}
								title="この生成時のパラメータを入力欄に戻す"
							>
								<RotateCcw size={12} />入力に復元
							</button>
							<span class="ml-auto font-mono text-[10px] text-faint">
								{viewRecord.params.aspectRatio} · {viewRecord.params.megapixels}MP ·
								{viewRecord.params.duration}s · {viewRecord.params.steps}steps
							</span>
						</div>
					</div>
				{:else}
					<!-- 空状態 -->
					<div class="flex flex-1 flex-col items-center justify-center gap-4 p-8">
						<div
							class="flex size-20 items-center justify-center rounded-2xl border border-dashed border-edge2 text-faint"
						>
							<Clapperboard size={30} />
						</div>
						<p class="text-sm text-mute">プロンプトを入力して動画を生成</p>
						<p class="max-w-sm text-center text-xs leading-relaxed text-faint">
							生成が完了すると、動画・最終プロンプト(日本語)・所要秒数がここに表示されます
						</p>
					</div>
				{/if}
			</div>
		</section>
	</div>

	<!-- ══════════ 下: 履歴 / キュー ══════════ -->
	<footer class="min-w-0 shrink-0 border-t border-edge bg-panel/60">
		<div class="flex items-center gap-1 px-5 pt-2 pb-1.5">
			<button
				class="flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.2em] uppercase transition-colors
				{bottomTab === 'history' ? 'bg-panel2 text-ink' : 'text-faint hover:text-mute'}"
				onclick={() => (bottomTab = 'history')}
			>
				<History size={12} />Recent
			</button>
			<button
				class="flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.2em] uppercase transition-colors
				{bottomTab === 'queue' ? 'bg-panel2 text-ink' : 'text-faint hover:text-mute'}"
				onclick={() => (bottomTab = 'queue')}
			>
				<ListVideo size={12} />Queue
				{#if activeJobs.length > 0}
					<span class="rounded-full bg-amber px-1.5 text-[9px] font-bold text-black">
						{activeJobs.length}
					</span>
				{/if}
			</button>
			{#if bottomTab === 'history' && history.value.length > 0}
				<a href="/library" class="ml-auto text-[11px] text-mute transition-colors hover:text-amber">
					すべて見る →
				</a>
			{:else if bottomTab === 'queue' && activeJobs.length > 0}
				<button
					class="ml-auto flex items-center gap-1 text-[11px] text-mute transition-colors hover:text-rec"
					onclick={cancelAll}
				>
					<CircleStop size={12} />全キャンセル
				</button>
			{/if}
		</div>

		{#if bottomTab === 'queue'}
			<!-- キュー一覧 -->
			<div class="flex gap-3 overflow-x-auto px-5 pt-1 pb-3.5">
				{#if activeJobs.length === 0}
					<p class="py-4 text-xs text-faint">キューは空です</p>
				{:else}
					{#each activeJobs as job (job.id)}
						<div
							class="w-52 shrink-0 rounded-lg border p-2.5
							{job.state === 'running' ? 'border-amber/40 bg-amber/5' : 'border-edge bg-panel'}"
						>
							<div class="flex items-center gap-1.5">
								{#if job.state === 'running'}
									<span class="rec-dot size-2 shrink-0 rounded-full bg-rec"></span>
								{:else}
									<Clock size={11} class="shrink-0 text-faint" />
								{/if}
								<span
									class="font-mono text-[10px] {job.state === 'running'
										? 'text-amber'
										: 'text-mute'}"
								>
									{jobLabel(job.state, job.position)}
								</span>
								{#if job.total > 1}
									<span class="font-mono text-[9px] text-faint">{job.index}/{job.total}</span>
								{/if}
								<button
									class="ml-auto rounded p-0.5 text-faint transition-colors hover:bg-rec/15 hover:text-rec"
									onclick={() => queue.cancel(job.id)}
									title="このジョブをキャンセル"
								>
									<X size={12} />
								</button>
							</div>
							<p class="mt-1 truncate text-[11px] text-ink/85" title={job.params.prompt}>
								{job.params.prompt || '(プロンプトなし)'}
							</p>
							<div class="mt-1 flex items-center gap-2 font-mono text-[9px] text-faint">
								<span class="tabular-nums text-mute">
									{jobElapsed(job, queue.now).toFixed(0)}s
								</span>
								<span>{job.params.megapixels}MP</span>
								<span>{job.params.duration}s</span>
								<span class="ml-auto">{job.backend === 'runpod' ? 'RunPod' : 'Desktop'}</span>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		{:else}
		<div class="flex gap-3 overflow-x-auto px-5 pt-1 pb-3.5">
			{#if recent.length === 0}
				<p class="py-4 text-xs text-faint">まだ生成履歴がありません</p>
			{:else}
				{#each recent as rec (rec.id)}
					<!-- ダウンロードリンクを内包するため button ではなく div にしている -->
					<div
						class="group w-44 shrink-0 cursor-pointer overflow-hidden rounded-lg border text-left transition-all
						{viewRecord?.id === rec.id
							? 'border-amber/50 bg-amber/5'
							: 'border-edge bg-panel hover:border-edge2 hover:bg-panel2'}"
						onclick={() => select(rec)}
						onkeydown={(e) => e.key === 'Enter' && select(rec)}
						role="button"
						tabindex="0"
						title={rec.jpPrompt || rec.params.prompt}
					>
						<div class="relative h-20 overflow-hidden bg-well">
							{#if boss}
								<TestPattern compact />
							{:else if rec.video}
								<!-- svelte-ignore a11y_media_has_caption -->
								<video
									use:previewVideo
									class="size-full object-contain opacity-80 transition-opacity group-hover:opacity-100"
									src={videoUrl(host, rec.video)}
									preload="metadata"
									muted
									playsinline
								></video>
							{:else}
								<div class="flex size-full items-center justify-center text-faint">
									<Clapperboard size={18} />
								</div>
							{/if}
							{#if !boss}
								<span
									class="absolute right-1 bottom-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] text-amber"
								>
									{fmtSeconds(rec.seconds)}
								</span>
								{#if rec.video}
									<a
										class="absolute top-1 right-1 rounded-md bg-black/70 p-1.5 text-mute opacity-0 transition-all group-hover:opacity-100 hover:bg-amber hover:text-black"
										href={videoUrl(host, rec.video, true)}
										onclick={(e) => e.stopPropagation()}
										title="この動画をダウンロード"
										aria-label="ダウンロード"
									>
										<Download size={12} />
									</a>
								{/if}
							{/if}
						</div>
						<div class="px-2.5 py-1.5">
							<p class="truncate text-[11px] text-ink/85">
								{rec.jpPrompt || rec.params.prompt}
							</p>
							<p class="mt-0.5 font-mono text-[9px] text-faint">
								{new Date(rec.date).toLocaleString('ja-JP', {
									month: 'numeric',
									day: 'numeric',
									hour: '2-digit',
									minute: '2-digit'
								})}
							</p>
						</div>
					</div>
				{/each}
			{/if}
		</div>
		{/if}
	</footer>
</main>

<VideoModal bind:open={modalOpen} record={viewRecord} />
