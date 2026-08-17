<script lang="ts">
	import Clapperboard from '@lucide/svelte/icons/clapperboard';
	import Play from '@lucide/svelte/icons/play';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Search from '@lucide/svelte/icons/search';
	import { settings, history, type HistoryRecord } from '$lib/stores.svelte';
	import { fmtSeconds, videoUrl } from '$lib/comfy';
	import VideoModal from '$lib/components/VideoModal.svelte';

	const host = $derived(settings.value.host);

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
</script>

<main class="min-h-0 flex-1 overflow-y-auto">
	<div class="mx-auto max-w-6xl px-6 py-6">
		<div class="mb-5 flex flex-wrap items-center gap-4">
			<h1 class="font-mono text-sm font-semibold tracking-[0.25em] text-ink uppercase">
				Library
			</h1>
			<span class="font-mono text-[11px] text-faint">{filtered.length} 件</span>
			<div class="relative ml-auto w-64">
				<Search size={13} class="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
				<input
					class="field-input pl-8 text-xs"
					placeholder="プロンプトで検索"
					bind:value={query}
				/>
			</div>
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
							{#if rec.video}
								<!-- svelte-ignore a11y_media_has_caption -->
								<video
									class="size-full object-cover opacity-85 transition-all group-hover:scale-[1.02] group-hover:opacity-100"
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
