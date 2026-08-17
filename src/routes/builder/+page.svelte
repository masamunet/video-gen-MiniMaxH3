<script lang="ts">
	import { goto } from '$app/navigation';
	import Dices from '@lucide/svelte/icons/dices';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';
	import Send from '@lucide/svelte/icons/send';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Star from '@lucide/svelte/icons/star';
	import Heart from '@lucide/svelte/icons/heart';
	import Save from '@lucide/svelte/icons/save';
	import BookMarked from '@lucide/svelte/icons/book-marked';
	import Clock from '@lucide/svelte/icons/clock';
	import Pin from '@lucide/svelte/icons/pin';
	import Shuffle from '@lucide/svelte/icons/shuffle';
	import Link2 from '@lucide/svelte/icons/link-2';
	import Link2Off from '@lucide/svelte/icons/link-2-off';
	import Pencil from '@lucide/svelte/icons/pencil';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import X from '@lucide/svelte/icons/x';
	import { Dialog } from 'bits-ui';

	import { builder, params } from '$lib/stores.svelte';
	import {
		buildPrompt,
		formatTimestamp,
		filledSceneCount,
		middleBlockCount,
		normalizeBuilder,
		sceneBlocks,
		syncTimeline,
		type Recipe
	} from '$lib/promptBuilder';

	let shuffleSeed = $state(Math.floor(Math.random() * 2 ** 31));
	const scenes = $derived(builder.value.scenes);
	const filledCount = $derived(scenes.filter((s) => s.trim()).length);
	const preview = $derived(buildPrompt(builder.value, shuffleSeed));

	let copied = $state(false);

	function reshuffle() {
		shuffleSeed = Math.floor(Math.random() * 2 ** 31);
	}

	// ── シーン操作 ──
	function addScene() {
		builder.value.scenes.push('');
		builder.value.links.push(false);
	}
	function removeScene(i: number) {
		builder.value.scenes.splice(i, 1);
		builder.value.links.splice(i, 1);
		if (builder.value.scenes.length === 0) addScene();
	}
	function moveScene(i: number, dir: -1 | 1) {
		const arr = builder.value.scenes;
		const j = i + dir;
		if (j < 0 || j >= arr.length) return;
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	function toggleLink(i: number) {
		builder.value.links[i] = !builder.value.links[i];
	}

	/** 連結を考慮したブロック分割 (UI 表示用、空シーンも含む) */
	const blocks = $derived(sceneBlocks(scenes.length, builder.value.links));

	function sceneRole(i: number): { label: string; random: boolean; linked: boolean } {
		const total = scenes.length;
		const block = blocks.find((b) => b.includes(i)) ?? [i];
		const linked = block.length >= 2;
		if (total <= 2) return { label: i === 0 ? '最初' : '最後', random: false, linked };
		if (block.includes(0) && block.includes(total - 1))
			return { label: '固定', random: false, linked };
		if (block.includes(0)) return { label: '最初 · 固定', random: false, linked };
		if (block.includes(total - 1)) return { label: '最後 · 固定', random: false, linked };
		if (linked) return { label: '連結 · ランダム', random: true, linked };
		return { label: 'ランダム', random: true, linked };
	}

	// ── タイムライン (キーフレームはシーンではなく Shot スロットに紐づく) ──
	$effect(() => {
		const count = builder.value.scenes.length;
		if (builder.value.timeline.length !== count) {
			builder.value.timeline = syncTimeline($state.snapshot(builder.value.timeline), count);
		}
	});

	let trackEl = $state<HTMLDivElement | null>(null);
	let dragging = $state<number | null>(null);
	const EPS = 0.01;

	function startDrag(i: number, e: PointerEvent) {
		if (i === 0) return; // Shot 1 は先頭固定
		e.preventDefault();
		dragging = i;
	}
	function onDrag(e: PointerEvent) {
		if (dragging == null || !trackEl) return;
		const rect = trackEl.getBoundingClientRect();
		const p = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
		const tl = builder.value.timeline;
		const min = (tl[dragging - 1] ?? 0) + EPS;
		const max = dragging + 1 < tl.length ? tl[dragging + 1] - EPS : 1;
		tl[dragging] = Math.round(Math.min(Math.max(p, min), Math.max(min, max)) * 1000) / 1000;
	}
	function endDrag() {
		dragging = null;
	}

	const tickStep = $derived(builder.value.duration > 24 ? 5 : 1);
	const ticks = $derived(
		Array.from(
			{ length: Math.floor(builder.value.duration / tickStep) + 1 },
			(_, i) => i * tickStep
		)
	);

	async function copyPrompt() {
		if (!preview) return;
		await navigator.clipboard.writeText(preview);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	function sendToGenerate() {
		if (!preview) return;
		params.value = { ...params.value, prompt: preview };
		goto('/');
	}

	// ── レシピ ──
	let recipes = $state<Recipe[]>([]);
	let editingId = $state<string | null>(null);
	let saveOpen = $state(false);
	let saveName = $state('');
	let saveRating = $state(0);
	let saveFav = $state(false);
	let saveComment = $state('');

	$effect(() => {
		fetch('/api/recipes')
			.then((r) => (r.ok ? r.json() : []))
			.then((list) => (recipes = list))
			.catch(() => {});
	});

	async function persistRecipe(rec: Recipe) {
		await fetch('/api/recipes', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(rec)
		}).catch(() => {});
	}

	function sortRecipes() {
		recipes = [...recipes].sort(
			(a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt - a.updatedAt
		);
	}

	/** メタデータのみ編集中のレシピ (null なら通常の保存モード) */
	let metaTarget = $state<Recipe | null>(null);

	function openSaveDialog() {
		metaTarget = null;
		if (!editingId) saveName = '';
		saveOpen = true;
	}

	/** カードの鉛筆から: ビルダーに読み込まずに名前・レート・お気に入り・コメントを編集 */
	function openMetaEdit(e: MouseEvent, rec: Recipe) {
		e.stopPropagation();
		metaTarget = rec;
		saveName = rec.name;
		saveRating = rec.rating;
		saveFav = rec.favorite;
		saveComment = rec.comment;
		saveOpen = true;
	}

	async function saveRecipe(asNew: boolean) {
		const now = Date.now();

		// メタデータ編集モード: 中身 (data) は変えずに情報だけ上書き
		if (metaTarget) {
			metaTarget.name = saveName.trim() || '無題レシピ';
			metaTarget.rating = saveRating;
			metaTarget.favorite = saveFav;
			metaTarget.comment = saveComment;
			metaTarget.updatedAt = now;
			const snap = $state.snapshot(metaTarget);
			metaTarget = null;
			saveOpen = false;
			sortRecipes();
			await persistRecipe(snap);
			return;
		}

		const existing = !asNew && editingId ? recipes.find((r) => r.id === editingId) : undefined;
		const rec: Recipe = {
			id: existing?.id ?? crypto.randomUUID(),
			name: saveName.trim() || '無題レシピ',
			data: $state.snapshot(builder.value),
			rating: saveRating,
			favorite: saveFav,
			comment: saveComment,
			createdAt: existing?.createdAt ?? now,
			updatedAt: now
		};
		recipes = [rec, ...recipes.filter((r) => r.id !== rec.id)];
		sortRecipes();
		editingId = rec.id;
		saveOpen = false;
		await persistRecipe(rec);
	}

	/** 現在の下書きに、失うと困る未保存の変更があるか */
	function isDirty(): boolean {
		const cur = JSON.stringify(normalizeBuilder($state.snapshot(builder.value)));
		if (editingId) {
			const rec = recipes.find((r) => r.id === editingId);
			if (rec) return cur !== JSON.stringify(normalizeBuilder(rec.data));
		}
		const d = builder.value;
		return Boolean(d.prefix.trim() || d.suffix.trim() || d.scenes.some((s) => s.trim()));
	}

	/** 読み込み確認ダイアログの対象 */
	let loadTarget = $state<Recipe | null>(null);

	function requestLoad(rec: Recipe) {
		if (isDirty()) loadTarget = rec;
		else loadRecipe(rec);
	}

	function confirmLoad() {
		if (loadTarget) loadRecipe(loadTarget);
		loadTarget = null;
	}

	function loadRecipe(rec: Recipe) {
		builder.value = normalizeBuilder(structuredClone($state.snapshot(rec).data));
		editingId = rec.id;
		saveName = rec.name;
		saveRating = rec.rating;
		saveFav = rec.favorite;
		saveComment = rec.comment;
	}

	async function setRating(rec: Recipe, rating: number) {
		rec.rating = rec.rating === rating ? 0 : rating;
		rec.updatedAt = Date.now();
		if (rec.id === editingId) saveRating = rec.rating;
		await persistRecipe($state.snapshot(rec));
	}

	async function toggleFavorite(rec: Recipe) {
		rec.favorite = !rec.favorite;
		rec.updatedAt = Date.now();
		if (rec.id === editingId) saveFav = rec.favorite;
		sortRecipes();
		await persistRecipe($state.snapshot(rec));
	}

	async function deleteRecipe(e: MouseEvent, rec: Recipe) {
		e.stopPropagation();
		if (!confirm(`レシピ「${rec.name}」を削除しますか？`)) return;
		recipes = recipes.filter((r) => r.id !== rec.id);
		if (editingId === rec.id) editingId = null;
		await fetch(`/api/recipes/${encodeURIComponent(rec.id)}`, { method: 'DELETE' }).catch(
			() => {}
		);
	}

	const editingName = $derived(editingId ? recipes.find((r) => r.id === editingId)?.name : null);
</script>

<svelte:window onpointermove={onDrag} onpointerup={endDrag} />

<main class="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto]">
	<div class="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(360px,42%)]">
		<!-- ══════════ 左: 構成入力 ══════════ -->
		<section class="flex min-h-0 flex-col overflow-y-auto border-r border-edge bg-panel/40">
			<div class="sticky top-0 z-10 flex items-center gap-2 border-b border-edge bg-panel px-5 py-3">
				<span class="font-mono text-[10px] font-semibold tracking-[0.25em] text-faint uppercase">
					Builder
				</span>
				{#if editingName}
					<span
						class="flex items-center gap-1 rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 text-[10px] text-amber"
						title="このレシピを編集中"
					>
						<BookMarked size={10} />{editingName}
					</span>
					<button
						class="rounded p-0.5 text-faint transition-colors hover:text-ink"
						onclick={() => (editingId = null)}
						title="レシピの編集をやめて新規にする"
					>
						<X size={11} />
					</button>
				{/if}
				<label class="ml-auto flex items-center gap-1.5 text-[11px] text-mute">
					<Clock size={12} class="text-amber" />
					duration
					<input
						type="number"
						class="field-input w-16 px-1 py-1 text-center font-mono text-xs"
						min="1"
						max="60"
						bind:value={builder.value.duration}
					/>
					<span class="text-faint">秒</span>
				</label>
			</div>

			<div class="flex flex-col gap-4 p-5">
				<!-- 前置テキスト -->
				<div>
					<label class="mb-1.5 block text-xs font-medium text-mute" for="prefix">
						前置テキスト <span class="font-normal text-faint">([Shot] 群の前)</span>
					</label>
					<textarea
						id="prefix"
						class="field-input min-h-24 resize-y font-mono text-[13px] leading-relaxed"
						bind:value={builder.value.prefix}
						placeholder={'integrated_multimodal_description: Live-action, documentary-like realism.\n90年代VHSホームビデオ撮影風。\n\n風の強い夕方、ビルの屋上に立つ日本人の若い成人女性。背景には山と町。'}
					></textarea>
				</div>

				<!-- シーン -->
				<div>
					<div class="mb-1.5 flex items-center justify-between">
						<span class="text-xs font-medium text-mute">
							シーン
							<span class="ml-1 font-mono text-amber">{filledCount}</span>
							{#if scenes.length > 2}
								<span class="ml-2 text-[10px] text-faint">
									最初と最後は固定・中間はランダム順
								</span>
							{/if}
						</span>
					</div>
					<div class="flex flex-col">
						{#each scenes as _, i (i)}
							{@const role = sceneRole(i)}
							<div
								class="rounded-xl border bg-well/60 p-3
								{role.random ? 'border-edge' : 'border-amber/20'}
								{i > 0 && builder.value.links[i - 1] ? 'border-t-amber/40' : ''}
								{i < scenes.length - 1 && builder.value.links[i] ? 'border-b-amber/40' : ''}"
							>
								<div class="mb-2 flex items-center gap-2">
									<span
										class="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-widest uppercase
										{role.random ? 'bg-panel2 text-mute' : 'bg-amber/10 text-amber'}"
									>
										{#if role.linked}<Link2 size={9} />{/if}
										{#if role.random}<Shuffle size={9} />{:else}<Pin size={9} />{/if}
										{role.label}
									</span>
									<div class="ml-auto flex items-center">
										<button
											class="rounded p-1 text-faint transition-colors hover:bg-panel2 hover:text-ink disabled:opacity-25"
											onclick={() => moveScene(i, -1)}
											disabled={i === 0}
											title="上へ"
										>
											<ChevronUp size={13} />
										</button>
										<button
											class="rounded p-1 text-faint transition-colors hover:bg-panel2 hover:text-ink disabled:opacity-25"
											onclick={() => moveScene(i, 1)}
											disabled={i === scenes.length - 1}
											title="下へ"
										>
											<ChevronDown size={13} />
										</button>
										<button
											class="rounded p-1 text-faint transition-colors hover:bg-rec/15 hover:text-rec"
											onclick={() => removeScene(i)}
											title="このシーンを削除"
										>
											<Trash2 size={13} />
										</button>
									</div>
								</div>
								<textarea
									class="field-input min-h-20 resize-y font-mono text-[13px] leading-relaxed"
									bind:value={builder.value.scenes[i]}
									placeholder={'カメラに向かって真剣な表情で彼女は問いかける\n(S1) says: <d>[Japanese] ねぇ</d>'}
								></textarea>
							</div>

							{#if i < scenes.length - 1}
								<!-- 連結トグル -->
								<div class="relative z-10 -my-2 flex h-7 items-center justify-center">
									{#if builder.value.links[i]}
										<div
											class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-amber/40"
										></div>
									{/if}
									<button
										class="relative flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider transition-colors
										{builder.value.links[i]
											? 'border-amber/50 bg-panel text-amber hover:bg-amber/10'
											: 'border-edge bg-panel text-faint hover:border-edge2 hover:text-mute'}"
										onclick={() => toggleLink(i)}
										title={builder.value.links[i]
											? '連結を解除する'
											: '次のシーンと連結する (シャッフルしても順番・隣接が保たれる)'}
									>
										{#if builder.value.links[i]}
											<Link2 size={10} />連結中
										{:else}
											<Link2Off size={10} />連結
										{/if}
									</button>
								</div>
							{/if}
						{/each}
					</div>
					<button
						class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-edge2 py-2 text-xs font-medium text-mute transition-colors hover:border-amber/40 hover:text-amber"
						onclick={addScene}
					>
						<Plus size={14} />シーンを追加
					</button>
				</div>

				<!-- タイムライン -->
				<div>
					<span class="mb-1.5 block text-xs font-medium text-mute">
						タイムライン
						<span class="ml-2 font-normal text-[10px] text-faint">
							キーフレームをドラッグして各 Shot の開始時刻を調整 (シーンの順番とは独立)
						</span>
					</span>
					<div
						class="rounded-xl border border-edge bg-well/60 px-5 pt-8 pb-7 select-none"
					>
						<div class="relative" bind:this={trackEl}>
							<!-- トラック -->
							<div class="h-1.5 rounded-full bg-edge"></div>
							<!-- 秒目盛り -->
							{#each ticks as t (t)}
								<div
									class="absolute top-2.5 h-1.5 w-px bg-edge2"
									style="left: {(t / builder.value.duration) * 100}%"
								></div>
							{/each}
							<span class="absolute top-4 left-0 font-mono text-[9px] text-faint">0s</span>
							<span class="absolute top-4 right-0 font-mono text-[9px] text-faint">
								{builder.value.duration}s
							</span>
							<!-- キーフレーム -->
							{#each builder.value.timeline as p, i (i)}
								<div
									class="absolute top-1/2 -translate-x-1/2"
									style="left: {p * 100}%; top: 3px"
								>
									<button
										class="group flex flex-col items-center outline-none"
										onpointerdown={(e) => startDrag(i, e)}
										title={i === 0
											? 'Shot 1 は先頭固定 (タイムスタンプなし)'
											: `Shot ${i + 1}: At ${formatTimestamp(p * builder.value.duration)}`}
										style="cursor: {i === 0 ? 'not-allowed' : dragging === i ? 'grabbing' : 'grab'}"
									>
										<span
											class="absolute -top-6 rounded px-1 py-px font-mono text-[9px] font-semibold whitespace-nowrap
											{i === 0 ? 'bg-panel2 text-faint' : dragging === i ? 'bg-amber text-black' : 'bg-panel2 text-amber'}"
										>
											S{i + 1}
										</span>
										<span
											class="block size-3 rotate-45 rounded-[2px] border transition-transform
											{i === 0
												? 'border-edge2 bg-panel2'
												: dragging === i
													? 'scale-125 border-amber bg-amber shadow-[0_0_10px_rgb(255_178_36/0.6)]'
													: 'border-amber/60 bg-panel2 group-hover:scale-110 group-hover:bg-amber/30'}"
										></span>
										<span
											class="absolute top-4 font-mono text-[9px] whitespace-nowrap
											{dragging === i ? 'text-amber' : 'text-mute'}"
										>
											{(p * builder.value.duration).toFixed(1)}s
										</span>
									</button>
								</div>
							{/each}
						</div>
					</div>
				</div>

				<!-- 後置テキスト -->
				<div>
					<label class="mb-1.5 block text-xs font-medium text-mute" for="suffix">
						後置テキスト <span class="font-normal text-faint">([Shot] 群の後)</span>
					</label>
					<textarea
						id="suffix"
						class="field-input min-h-20 resize-y font-mono text-[13px] leading-relaxed"
						bind:value={builder.value.suffix}
						placeholder={'overall_soundscape: 風の音\nnon_diegetic_music: センチメンタルなオルゴールの音楽'}
					></textarea>
				</div>
			</div>
		</section>

		<!-- ══════════ 右: プレビュー ══════════ -->
		<section class="flex min-h-0 flex-col">
			<div class="flex items-center gap-2 border-b border-edge px-5 py-3">
				<span class="font-mono text-[10px] font-semibold tracking-[0.25em] text-faint uppercase">
					Preview
				</span>
				<button
					class="ml-auto flex items-center gap-1.5 rounded-lg border border-edge px-2.5 py-1.5 text-[11px] font-medium text-mute transition-colors hover:border-edge2 hover:text-ink disabled:opacity-40"
					onclick={reshuffle}
					disabled={middleBlockCount(builder.value) < 2}
					title="中間シーン (連結ブロック単位) の順番をシャッフルし直す"
				>
					<Dices size={13} />シャッフル
				</button>
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto p-5">
				{#if preview}
					<pre
						class="font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap text-ink/90">{preview}</pre>
				{:else}
					<p class="py-12 text-center text-xs text-faint">
						左の入力を埋めるとプロンプトがここに組み上がります
					</p>
				{/if}
			</div>

			<div class="flex shrink-0 items-center gap-2 border-t border-edge bg-panel/40 px-5 py-3">
				<button
					class="flex items-center justify-center gap-2 rounded-xl bg-amber px-4 py-2.5 text-xs font-bold text-black transition-all hover:bg-amber/90 disabled:cursor-not-allowed disabled:opacity-40"
					onclick={sendToGenerate}
					disabled={!preview}
					title="このプロンプトを生成画面の入力に入れる"
				>
					<Send size={14} />生成画面へ送る
				</button>
				<button
					class="flex items-center gap-1.5 rounded-xl border border-edge px-3.5 py-2.5 text-xs font-medium text-mute transition-colors hover:border-edge2 hover:text-ink disabled:opacity-40"
					onclick={copyPrompt}
					disabled={!preview}
				>
					{#if copied}<Check size={13} class="text-ok" />コピー済み{:else}<Copy
							size={13}
						/>コピー{/if}
				</button>
				<button
					class="ml-auto flex items-center gap-1.5 rounded-xl border border-amber/30 bg-amber/10 px-3.5 py-2.5 text-xs font-semibold text-amber transition-colors hover:bg-amber/20 disabled:opacity-40"
					onclick={openSaveDialog}
					disabled={!preview}
				>
					<Save size={13} />レシピ保存
				</button>
			</div>
		</section>
	</div>

	<!-- ══════════ 下: レシピ一覧 ══════════ -->
	<footer class="shrink-0 border-t border-edge bg-panel/60">
		<div class="flex items-center gap-2 px-5 pt-2.5 pb-1.5">
			<BookMarked size={12} class="text-faint" />
			<span class="font-mono text-[10px] font-semibold tracking-[0.25em] text-faint uppercase">
				Recipes
			</span>
			<span class="font-mono text-[10px] text-faint">{recipes.length} 件</span>
		</div>
		<div class="flex gap-3 overflow-x-auto px-5 pt-1 pb-3.5">
			{#if recipes.length === 0}
				<p class="py-3 text-xs text-faint">
					まだレシピがありません。組み上げたプロンプトを「レシピ保存」で登録できます
				</p>
			{:else}
				{#each recipes as rec (rec.id)}
					<div
						class="group w-60 shrink-0 cursor-pointer rounded-lg border p-2.5 text-left transition-all
						{editingId === rec.id
							? 'border-amber/50 bg-amber/5'
							: 'border-edge bg-panel hover:border-edge2 hover:bg-panel2'}"
						onclick={() => requestLoad(rec)}
						onkeydown={(e) => e.key === 'Enter' && requestLoad(rec)}
						role="button"
						tabindex="0"
						title={rec.comment || rec.name}
					>
						<div class="flex items-center gap-1.5">
							<p class="min-w-0 flex-1 truncate text-[12px] font-medium text-ink/90">
								{rec.name}
							</p>
							<button
								class="shrink-0 rounded p-0.5 text-faint opacity-0 transition-all group-hover:opacity-100 hover:text-ink"
								onclick={(e) => openMetaEdit(e, rec)}
								title="名前・レート・コメントを編集 (読み込まずに)"
							>
								<Pencil size={12} />
							</button>
							<button
								class="shrink-0 rounded p-0.5 transition-colors
								{rec.favorite ? 'text-rec' : 'text-faint opacity-0 group-hover:opacity-100 hover:text-rec'}"
								onclick={(e) => {
									e.stopPropagation();
									toggleFavorite(rec);
								}}
								title="お気に入り"
							>
								<Heart size={13} fill={rec.favorite ? 'currentColor' : 'none'} />
							</button>
							<button
								class="shrink-0 rounded p-0.5 text-faint opacity-0 transition-all group-hover:opacity-100 hover:text-rec"
								onclick={(e) => deleteRecipe(e, rec)}
								title="レシピを削除"
							>
								<Trash2 size={12} />
							</button>
						</div>
						<div class="mt-1 flex items-center gap-0.5">
							{#each [1, 2, 3, 4, 5] as n (n)}
								<button
									class="rounded p-0.5 transition-colors {n <= rec.rating
										? 'text-amber'
										: 'text-edge2 hover:text-mute'}"
									onclick={(e) => {
										e.stopPropagation();
										setRating(rec, n);
									}}
									title="レート {n}"
								>
									<Star size={11} fill={n <= rec.rating ? 'currentColor' : 'none'} />
								</button>
							{/each}
							<span class="ml-auto font-mono text-[9px] text-faint">
								{filledSceneCount(rec.data)}シーン · {rec.data.duration}s
							</span>
						</div>
						{#if rec.comment}
							<p class="mt-1 truncate text-[10px] text-mute">{rec.comment}</p>
						{/if}
						<p class="mt-0.5 font-mono text-[9px] text-faint">
							{new Date(rec.updatedAt).toLocaleString('ja-JP', {
								month: 'numeric',
								day: 'numeric',
								hour: '2-digit',
								minute: '2-digit'
							})}
						</p>
					</div>
				{/each}
			{/if}
		</div>
	</footer>
</main>

<!-- レシピ保存ダイアログ -->
<Dialog.Root bind:open={saveOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
		<Dialog.Content
			class="fade-up fixed top-1/2 left-1/2 z-50 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-edge bg-panel p-6 shadow-2xl shadow-black/60"
		>
			<div class="mb-4 flex items-center justify-between">
				<Dialog.Title
					class="flex items-center gap-2 font-mono text-sm font-semibold tracking-widest text-ink uppercase"
				>
					{#if metaTarget}
						<Pencil size={16} class="text-amber" />
						レシピ編集
					{:else}
						<Save size={16} class="text-amber" />
						レシピ保存
					{/if}
				</Dialog.Title>
				<Dialog.Close
					class="rounded-md p-1 text-mute transition-colors hover:bg-panel2 hover:text-ink"
					aria-label="閉じる"
				>
					<X size={16} />
				</Dialog.Close>
			</div>

			<div class="flex flex-col gap-4">
				<div>
					<label class="mb-1.5 block text-xs font-medium text-mute" for="recipe-name">
						レシピ名
					</label>
					<input
						id="recipe-name"
						class="field-input"
						bind:value={saveName}
						placeholder="例: 屋上の別れ (VHS風)"
					/>
				</div>

				<div class="flex items-center gap-6">
					<div>
						<span class="mb-1.5 block text-xs font-medium text-mute">レート</span>
						<div class="flex items-center gap-0.5">
							{#each [1, 2, 3, 4, 5] as n (n)}
								<button
									class="rounded p-0.5 transition-colors {n <= saveRating
										? 'text-amber'
										: 'text-edge2 hover:text-mute'}"
									onclick={() => (saveRating = saveRating === n ? 0 : n)}
								>
									<Star size={18} fill={n <= saveRating ? 'currentColor' : 'none'} />
								</button>
							{/each}
						</div>
					</div>
					<div>
						<span class="mb-1.5 block text-xs font-medium text-mute">お気に入り</span>
						<button
							class="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors
							{saveFav
								? 'border-rec/40 bg-rec/10 text-rec'
								: 'border-edge text-mute hover:border-edge2 hover:text-ink'}"
							onclick={() => (saveFav = !saveFav)}
						>
							<Heart size={13} fill={saveFav ? 'currentColor' : 'none'} />
							{saveFav ? 'お気に入り' : '通常'}
						</button>
					</div>
				</div>

				<div>
					<label class="mb-1.5 block text-xs font-medium text-mute" for="recipe-comment">
						コメント
					</label>
					<textarea
						id="recipe-comment"
						class="field-input min-h-16 resize-y text-[13px]"
						bind:value={saveComment}
						placeholder="メモ (どんな映像になるか、うまくいったパラメータなど)"
					></textarea>
				</div>
			</div>

			{#if metaTarget}
				<p class="mt-3 text-[11px] leading-relaxed text-faint">
					レシピの中身 (シーンやタイムライン) は変更されません。中身を更新するには、レシピを読み込んで編集後に「上書き保存」してください。
				</p>
			{/if}

			<div class="mt-5 flex justify-end gap-2">
				<Dialog.Close
					class="rounded-lg border border-edge px-4 py-2 text-xs font-medium text-mute transition-colors hover:border-edge2 hover:text-ink"
				>
					キャンセル
				</Dialog.Close>
				{#if !metaTarget && editingId}
					<button
						class="rounded-lg border border-amber/40 px-4 py-2 text-xs font-semibold text-amber transition-colors hover:bg-amber/10"
						onclick={() => saveRecipe(true)}
					>
						別のレシピとして保存
					</button>
				{/if}
				<button
					class="rounded-lg bg-amber px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-amber/85"
					onclick={() => saveRecipe(false)}
				>
					{metaTarget ? '変更を保存' : editingId ? '上書き保存' : '保存'}
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- レシピ読み込み確認ダイアログ -->
<Dialog.Root
	open={loadTarget !== null}
	onOpenChange={(o) => {
		if (!o) loadTarget = null;
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
		<Dialog.Content
			class="fade-up fixed top-1/2 left-1/2 z-50 w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-edge bg-panel p-6 shadow-2xl shadow-black/60"
		>
			<Dialog.Title
				class="flex items-center gap-2 font-mono text-sm font-semibold tracking-widest text-ink uppercase"
			>
				<TriangleAlert size={16} class="text-amber" />
				読み込みの確認
			</Dialog.Title>
			<p class="mt-3 text-[13px] leading-relaxed text-mute">
				「<span class="text-ink">{loadTarget?.name}</span>」を読み込むと、
				{#if editingName}
					編集中のレシピ「<span class="text-ink">{editingName}</span>」への未保存の変更は失われます。
				{:else}
					現在の未保存の編集内容は失われます。
				{/if}
			</p>
			<p class="mt-1.5 text-[11px] text-faint">
				残したい場合はキャンセルして「レシピ保存」してから読み込んでください。
			</p>
			<div class="mt-5 flex justify-end gap-2">
				<Dialog.Close
					class="rounded-lg border border-edge px-4 py-2 text-xs font-medium text-mute transition-colors hover:border-edge2 hover:text-ink"
				>
					キャンセル
				</Dialog.Close>
				<button
					class="rounded-lg bg-amber px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-amber/85"
					onclick={confirmLoad}
				>
					破棄して読み込む
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
