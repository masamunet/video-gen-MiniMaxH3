<script lang="ts">
	import { Dialog } from 'bits-ui';
	import Clapperboard from '@lucide/svelte/icons/clapperboard';
	import Play from '@lucide/svelte/icons/play';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Search from '@lucide/svelte/icons/search';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import X from '@lucide/svelte/icons/x';
	import { settings, history, bossMode, type HistoryRecord } from '$lib/stores.svelte';
	import { fmtSeconds, videoUrl } from '$lib/comfy';
	import { billableSeconds, fmtCost, fmtCostTotal } from '$lib/cost';
	import { previewVideo } from '$lib/media';
	import { normalizeUpscaleBy } from '$lib/workflow';
	import CircleDollarSign from '@lucide/svelte/icons/circle-dollar-sign';
	import Download from '@lucide/svelte/icons/download';
	import VideoModal from '$lib/components/VideoModal.svelte';
	import TestPattern from '$lib/components/TestPattern.svelte';
	import LibraryTabs from '$lib/components/LibraryTabs.svelte';

	const host = $derived(settings.value.host);
	const boss = $derived(bossMode.value);

	let query = $state('');
	let modalOpen = $state(false);
	let selected = $state<HistoryRecord | null>(null);

	const filtered = $derived(
		query.trim()
			? history.value.filter((r) =>
					(r.jpPrompt + r.enPrompt + r.params.prompt)
						.toLowerCase()
						.includes(query.trim().toLowerCase())
				)
			: history.value
	);

	const costSettings = $derived({
		costPerHour: settings.value.runpodCostPerHour,
		usdJpy: settings.value.usdJpy
	});
	/** 表示中の RunPod 生成の合計コスト */
	const runpodTotal = $derived(
		filtered
			.filter((r) => r.backend === 'runpod')
			.reduce((sum, r) => sum + billableSeconds(r), 0)
	);

	function openRecord(rec: HistoryRecord) {
		selected = rec;
		modalOpen = true;
	}

	function remove(e: MouseEvent, rec: HistoryRecord) {
		e.stopPropagation();
		if (confirm('この履歴を削除しますか？(サーバー上のファイルは削除されません)')) {
			history.remove(rec.id);
		}
	}

	// ── 一括削除 (検索中は絞り込み結果のみが対象) ──
	let bulkOpen = $state(false);
	const isFiltered = $derived(query.trim().length > 0);

	function bulkDelete() {
		history.removeMany(filtered.map((r) => r.id));
		bulkOpen = false;
	}
</script>

<main class="min-h-0 flex-1 overflow-y-auto">
	<div class="mx-auto max-w-6xl px-6 py-6">
		<div class="mb-5 flex flex-wrap items-center gap-4">
			<LibraryTabs current="videos" />
			<span class="font-mono text-[11px] text-faint">{filtered.length} 件</span>
			{#if runpodTotal > 0}
				<span
					class="flex items-center gap-1 font-mono text-[11px] text-amber/80"
					title="表示中の RunPod 生成の合計コスト概算"
				>
					<CircleDollarSign size={11} />
					{fmtCostTotal(runpodTotal, costSettings)}
				</span>
			{/if}
			<div class="relative ml-auto w-64">
				<Search size={13} class="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
				<input
					class="field-input pl-8 text-xs"
					placeholder="プロンプトで検索"
					bind:value={query}
				/>
			</div>
			<button
				class="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-2 text-[11px] font-medium text-mute transition-colors hover:border-rec/40 hover:bg-rec/10 hover:text-rec disabled:cursor-not-allowed disabled:opacity-40"
				onclick={() => (bulkOpen = true)}
				disabled={filtered.length === 0}
				title={isFiltered ? '検索結果の履歴をまとめて削除' : 'すべての履歴を削除'}
			>
				<Trash2 size={13} />
				{isFiltered ? '検索結果を削除' : '一括削除'}
			</button>
		</div>

		{#if filtered.length === 0}
			<div class="flex flex-col items-center gap-4 py-24">
				<div
					class="flex size-20 items-center justify-center rounded-2xl border border-dashed border-edge2 text-faint"
				>
					<Clapperboard size={30} />
				</div>
				<p class="text-sm text-mute">
					{query ? '一致する履歴がありません' : 'まだ生成履歴がありません'}
				</p>
			</div>
		{:else}
			<div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
				{#each filtered as rec (rec.id)}
					<div
						class="group fade-up cursor-pointer overflow-hidden rounded-xl border border-edge bg-panel transition-all hover:border-edge2 hover:shadow-lg hover:shadow-black/40"
						onclick={() => openRecord(rec)}
						onkeydown={(e) => e.key === 'Enter' && openRecord(rec)}
						role="button"
						tabindex="0"
					>
						<div class="relative aspect-video overflow-hidden bg-well">
							{#if boss}
								<TestPattern compact />
							{:else if rec.video}
								<!-- svelte-ignore a11y_media_has_caption -->
								<video
									use:previewVideo
									class="size-full object-contain opacity-85 transition-all group-hover:scale-[1.02] group-hover:opacity-100"
									src={videoUrl(host, rec.video)}
									preload="metadata"
									muted
									playsinline
								></video>
							{:else}
								<div class="flex size-full items-center justify-center text-faint">
									<Clapperboard size={22} />
								</div>
							{/if}
							<span
								class="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
							>
								<span class="rounded-full bg-amber/90 p-3 text-black shadow-xl">
									<Play size={16} fill="currentColor" />
								</span>
							</span>
							<span
								class="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-amber"
							>
								{fmtSeconds(rec.seconds)}
							</span>
							{#if rec.video && !boss}
								<a
									class="absolute top-1.5 right-9 rounded-md bg-black/60 p-1.5 text-mute opacity-0 transition-all group-hover:opacity-100 hover:bg-amber hover:text-black"
									href={videoUrl(host, rec.video, true)}
									onclick={(e) => e.stopPropagation()}
									title="この動画をダウンロード"
									aria-label="ダウンロード"
								>
									<Download size={13} />
								</a>
							{/if}
							<button
								class="absolute top-1.5 right-1.5 rounded-md bg-black/60 p-1.5 text-mute opacity-0 transition-all group-hover:opacity-100 hover:bg-rec/20 hover:text-rec"
								onclick={(e) => remove(e, rec)}
								title="履歴から削除"
							>
								<Trash2 size={13} />
							</button>
						</div>
						<div class="px-3 py-2.5">
							<p class="line-clamp-2 text-xs leading-relaxed text-ink/90">
								{rec.jpPrompt || rec.params.prompt}
							</p>
							<div class="mt-1.5 flex items-center gap-2 font-mono text-[9px] text-faint">
								<span>{rec.params.aspectRatio.split(' ')[0]}</span>
								<span>{rec.params.megapixels}MP</span>
								<span>{rec.params.duration}s</span>
								{#if rec.params.upscale}
									<span class="text-amber/80">×{normalizeUpscaleBy(rec.params.upscaleBy).toFixed(1)}</span>
								{/if}
								{#if rec.backend === 'runpod'}
									<span class="text-amber/80">
										{fmtCost(billableSeconds(rec), costSettings)}
									</span>
								{/if}
								<span class="ml-auto">
									{new Date(rec.date).toLocaleString('ja-JP', {
										year: '2-digit',
										month: 'numeric',
										day: 'numeric',
										hour: '2-digit',
										minute: '2-digit'
									})}
								</span>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</main>

<VideoModal bind:open={modalOpen} record={selected} />

<!-- 一括削除の確認 -->
<Dialog.Root bind:open={bulkOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
		<Dialog.Content
			class="fade-up fixed top-1/2 left-1/2 z-50 w-[min(460px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-edge bg-panel p-6 shadow-2xl shadow-black/60"
		>
			<div class="mb-3 flex items-center justify-between">
				<Dialog.Title
					class="flex items-center gap-2 font-mono text-sm font-semibold tracking-widest text-ink uppercase"
				>
					<TriangleAlert size={16} class="text-rec" />
					一括削除の確認
				</Dialog.Title>
				<Dialog.Close
					class="rounded-md p-1 text-mute transition-colors hover:bg-panel2 hover:text-ink"
					aria-label="閉じる"
				>
					<X size={16} />
				</Dialog.Close>
			</div>

			<p class="text-[13px] leading-relaxed text-mute">
				{#if isFiltered}
					検索「<span class="text-ink">{query.trim()}</span>」に一致する
					<span class="font-mono text-rec">{filtered.length}</span> 件の履歴を削除します。
				{:else}
					<span class="font-mono text-rec">{filtered.length}</span> 件すべての履歴を削除します。
				{/if}
			</p>
			<p class="mt-1.5 text-[11px] leading-relaxed text-faint">
				この操作は取り消せません。ComfyUI サーバー上の動画ファイルは削除されず、アプリの履歴だけが消えます。
			</p>

			<div class="mt-5 flex justify-end gap-2">
				<Dialog.Close
					class="rounded-lg border border-edge px-4 py-2 text-xs font-medium text-mute transition-colors hover:border-edge2 hover:text-ink"
				>
					キャンセル
				</Dialog.Close>
				<button
					class="flex items-center gap-1.5 rounded-lg bg-rec px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-rec/85"
					onclick={bulkDelete}
				>
					<Trash2 size={13} />{filtered.length} 件を削除
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
