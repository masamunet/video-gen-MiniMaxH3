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

	import { settings, params, history, pending, bossMode, type HistoryRecord } from '$lib/stores.svelte';
	import { copyText } from '$lib/compat';
	import { buildWorkflow, FALLBACK_ASPECT_RATIOS, type GenParams } from '$lib/workflow';
	import {
		submitWorkflow,
		pollStatus,
		interrupt,
		parseOutputs,
		videoUrl,
		fetchResolutionOptions,
		fmtSeconds
	} from '$lib/comfy';
	import VideoModal from '$lib/components/VideoModal.svelte';
	import TestPattern from '$lib/components/TestPattern.svelte';

	type Phase = 'idle' | 'submitting' | 'queued' | 'running' | 'done' | 'error';

	const host = $derived(settings.value.host);
	const boss = $derived(bossMode.value);

	let phase = $state<Phase>('idle');
	let queuePos = $state(0);
	let errorMsg = $state('');
	let elapsed = $state(0);
	let startTime = 0;
	let ticker: ReturnType<typeof setInterval> | undefined;
	let pollToken = 0;

	let viewRecord = $state<HistoryRecord | null>(history.value[0] ?? null);

	// 履歴のロード完了後、未表示なら最新の結果を出力ペインに表示する
	$effect(() => {
		if (history.loaded && !viewRecord && phase === 'idle') {
			viewRecord = history.value[0] ?? null;
		}
	});
	let modalOpen = $state(false);
	let copied = $state(false);

	const busy = $derived(phase === 'submitting' || phase === 'queued' || phase === 'running');

	// ── 選択肢を ComfyUI 本体から取得(API JSONと必ず一致させる) ──
	let aspectOptions = $state<string[]>(FALLBACK_ASPECT_RATIOS);
	let mpChoices = $state<number[] | null>(null);
	let mpRange = $state({ min: 0.1, max: 4, step: 0.05 });
	let optsFromServer = $state(false);

	$effect(() => {
		const h = host;
		fetchResolutionOptions(h).then((opts) => {
			if (!opts) return;
			aspectOptions = opts.aspectRatios;
			mpChoices = opts.megapixels.choices;
			mpRange = {
				min: opts.megapixels.min,
				max: opts.megapixels.max,
				step: opts.megapixels.step
			};
			optsFromServer = true;
			if (!opts.aspectRatios.includes(params.value.aspectRatio)) {
				params.value = { ...params.value, aspectRatio: opts.aspectRatios[0] };
			}
		});
	});

	// ── 生成 ──
	function startTicker() {
		stopTicker();
		ticker = setInterval(() => (elapsed = (performance.now() - startTime) / 1000), 100);
	}
	function stopTicker() {
		if (ticker) clearInterval(ticker);
		ticker = undefined;
	}
	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

	async function generate() {
		if (busy || !params.value.prompt.trim()) return;
		errorMsg = '';
		phase = 'submitting';
		elapsed = 0;
		startTime = performance.now();
		startTicker();

		const snapshot = $state.snapshot(params.value);
		const res = await submitWorkflow(host, buildWorkflow(snapshot));
		if (res.error || !res.prompt_id) {
			fail(res.error ?? '送信に失敗しました');
			return;
		}

		pending.value = { id: res.prompt_id, params: snapshot, startedAt: Date.now() };
		await pollLoop(res.prompt_id, snapshot);
	}

	async function pollLoop(id: string, snapshot: GenParams) {
		const token = ++pollToken;
		phase = 'queued';
		queuePos = 0;
		let unknownCount = 0;

		while (token === pollToken) {
			await sleep(1500);
			if (token !== pollToken) return;
			const st = await pollStatus(host, id);
			if (token !== pollToken) return;

			if (st.state === 'done') {
				const seconds = Math.round(((performance.now() - startTime) / 1000) * 10) / 10;
				stopTicker();
				pending.value = null;
				const parsed = parseOutputs(st.outputs);
				const record: HistoryRecord = {
					id,
					date: Date.now(),
					params: snapshot,
					jpPrompt: parsed.jpPrompt,
					enPrompt: parsed.enPrompt,
					seconds,
					video: parsed.video
				};
				history.add(record);
				viewRecord = record;
				phase = 'done';
				return;
			}
			if (st.state === 'error') {
				fail(st.message);
				return;
			}
			if (st.state === 'queued') {
				phase = 'queued';
				queuePos = st.position;
			} else if (st.state === 'running') {
				phase = 'running';
			}
			// history にもキューにも見つからない状態が続いたら諦める
			// (ComfyUI 再起動などでジョブが消えたケース)
			unknownCount = st.state === 'unknown' ? unknownCount + 1 : 0;
			if (unknownCount >= 5) {
				fail('ジョブが見つかりませんでした (ComfyUI が再起動された可能性があります)');
				return;
			}
		}
	}

	// リロードで中断された実行中ジョブのポーリングを再開する
	$effect(() => {
		const p = pending.value && $state.snapshot(pending.value);
		if (!p || busy) return;
		const alreadyElapsed = Math.max(0, Date.now() - p.startedAt);
		startTime = performance.now() - alreadyElapsed;
		elapsed = alreadyElapsed / 1000;
		startTicker();
		pollLoop(p.id, p.params);
	});

	function fail(msg: string) {
		stopTicker();
		pollToken++;
		pending.value = null;
		phase = 'error';
		errorMsg = msg;
	}

	async function cancel() {
		pollToken++;
		stopTicker();
		pending.value = null;
		await interrupt(host);
		phase = 'idle';
	}

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
	const phaseLabel = $derived(
		phase === 'submitting'
			? '送信中…'
			: phase === 'queued'
				? queuePos > 0
					? `キュー待ち #${queuePos}`
					: 'キュー待ち'
				: '生成中'
	);

	// ブラウザタブで進捗が分かるようにタイトルを動的に更新する
	const tabTitle = $derived(
		busy
			? `⏳ ${phaseLabel} ${Math.floor(elapsed)}s | MiniMax H3`
			: phase === 'done'
				? `✅ 生成完了 (${fmtSeconds(viewRecord?.seconds ?? 0)}) | MiniMax H3`
				: phase === 'error'
					? '⚠️ 生成エラー | MiniMax H3'
					: 'MiniMax H3 Studio'
	);
</script>

<svelte:head>
	<title>{tabTitle}</title>
</svelte:head>

<main class="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto]">
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
					{#if mpChoices}
						<select id="mp" class="field-input" bind:value={params.value.megapixels}>
							{#each mpChoices as c (c)}
								<option value={c}>{c} MP</option>
							{/each}
						</select>
					{:else}
						<div class="flex items-center gap-3">
							<input
								id="mp"
								type="range"
								class="fader flex-1"
								min={mpRange.min}
								max={mpRange.max}
								step={mpRange.step}
								bind:value={params.value.megapixels}
								style={fill(params.value.megapixels, mpRange.min, mpRange.max)}
							/>
							<input
								type="number"
								class="field-input w-20 text-center font-mono text-xs"
								min={mpRange.min}
								max={mpRange.max}
								step={mpRange.step}
								bind:value={params.value.megapixels}
							/>
						</div>
					{/if}
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
								min="1"
								max="20"
								step="1"
								bind:value={params.value.steps}
								style={fill(params.value.steps, 1, 20)}
							/>
							<input
								type="number"
								class="field-input w-14 px-1 text-center font-mono text-xs"
								min="1"
								max="100"
								bind:value={params.value.steps}
							/>
						</div>
					</div>
				</div>

				<!-- 生成ボタン -->
				{#if busy}
					<button
						class="flex items-center justify-center gap-2 rounded-xl border border-rec/40 bg-rec/10 py-3 text-sm font-semibold text-rec transition-colors hover:bg-rec/20"
						onclick={cancel}
					>
						<CircleStop size={16} />
						中断する
					</button>
				{:else}
					<button
						class="group flex items-center justify-center gap-2 rounded-xl bg-amber py-3 text-sm font-bold text-black shadow-[0_0_24px_rgb(255_178_36/0.25)] transition-all hover:bg-amber/90 hover:shadow-[0_0_32px_rgb(255_178_36/0.4)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
						onclick={generate}
						disabled={!params.value.prompt.trim()}
					>
						<Sparkles size={16} class="transition-transform group-hover:rotate-12" />
						動画を生成
					</button>
				{/if}

				{#if phase === 'error'}
					<div
						class="fade-up flex items-start gap-2 rounded-lg border border-rec/30 bg-rec/10 p-3 text-xs leading-relaxed text-rec"
					>
						<TriangleAlert size={14} class="mt-0.5 shrink-0" />
						<span class="break-all">{errorMsg}</span>
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
						{phaseLabel}
						<span class="tabular-nums text-ink">{elapsed.toFixed(1)}s</span>
					</span>
				{:else if viewRecord}
					<span class="ml-auto flex items-center gap-1 font-mono text-[11px] text-mute">
						<Timer size={12} class="text-amber" />
						{fmtSeconds(viewRecord.seconds)}
					</span>
				{/if}
			</div>

			<div class="flex min-h-0 flex-1 flex-col">
				{#if busy}
					<!-- 生成中 -->
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
								<p class="font-mono text-sm tracking-widest text-mute">{phaseLabel}</p>
								<p class="font-mono text-3xl font-semibold tabular-nums text-ink">
									{elapsed.toFixed(1)}<span class="ml-1 text-base text-faint">s</span>
								</p>
							</div>
						</div>
					</div>
				{:else if viewRecord}
					<!-- 結果表示 -->
					<div class="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-5">
						{#if viewRecord.video && boss}
							<!-- ボスが来たモード: 動画の代わりに試験パターン -->
							<div
								class="aspect-video max-h-full w-full max-w-xl overflow-hidden rounded-xl border border-edge"
							>
								<TestPattern />
							</div>
						{:else if viewRecord.video}
							<button
								class="group relative flex max-h-full min-h-0 max-w-full items-center justify-center"
								onclick={() => (modalOpen = true)}
								title="モーダルで再生"
							>
								<!-- svelte-ignore a11y_media_has_caption -->
								<video
									class="max-h-full max-w-full rounded-xl border border-edge object-contain shadow-2xl shadow-black/50"
									src={videoUrl(host, viewRecord.video)}
									preload="metadata"
									muted
									playsinline
								></video>
								<span
									class="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100"
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

	<!-- ══════════ 下: 履歴 ══════════ -->
	<footer class="shrink-0 border-t border-edge bg-panel/60">
		<div class="flex items-center gap-2 px-5 pt-2.5 pb-1.5">
			<History size={12} class="text-faint" />
			<span class="font-mono text-[10px] font-semibold tracking-[0.25em] text-faint uppercase">
				Recent
			</span>
			{#if history.value.length > 0}
				<a href="/library" class="ml-auto text-[11px] text-mute transition-colors hover:text-amber">
					すべて見る →
				</a>
			{/if}
		</div>
		<div class="flex gap-3 overflow-x-auto px-5 pt-1 pb-3.5">
			{#if recent.length === 0}
				<p class="py-4 text-xs text-faint">まだ生成履歴がありません</p>
			{:else}
				{#each recent as rec (rec.id)}
					<button
						class="group w-44 shrink-0 overflow-hidden rounded-lg border text-left transition-all
						{viewRecord?.id === rec.id
							? 'border-amber/50 bg-amber/5'
							: 'border-edge bg-panel hover:border-edge2 hover:bg-panel2'}"
						onclick={() => (viewRecord = rec)}
						title={rec.jpPrompt || rec.params.prompt}
					>
						<div class="relative h-20 overflow-hidden bg-well">
							{#if boss}
								<TestPattern compact />
							{:else if rec.video}
								<!-- svelte-ignore a11y_media_has_caption -->
								<video
									class="size-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
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
					</button>
				{/each}
			{/if}
		</div>
	</footer>
</main>

<VideoModal bind:open={modalOpen} record={viewRecord} />
