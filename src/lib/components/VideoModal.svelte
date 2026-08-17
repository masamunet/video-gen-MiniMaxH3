<script lang="ts">
	import { Dialog } from 'bits-ui';
	import X from '@lucide/svelte/icons/x';
	import Download from '@lucide/svelte/icons/download';
	import Maximize from '@lucide/svelte/icons/maximize';
	import Timer from '@lucide/svelte/icons/timer';
	import CircleDollarSign from '@lucide/svelte/icons/circle-dollar-sign';
	import { billableSeconds, fmtCost } from '$lib/cost';
	import { settings, bossMode, type HistoryRecord } from '$lib/stores.svelte';
	import TestPattern from './TestPattern.svelte';
	import { playableVideo } from '$lib/media';
	import { fmtSeconds, videoUrl } from '$lib/comfy';

	let {
		open = $bindable(false),
		record
	}: { open?: boolean; record: HistoryRecord | null } = $props();

	const host = $derived(settings.value.host);

	let videoEl = $state<HTMLVideoElement | null>(null);

	// 閉じた瞬間に止める (アンマウント後も鳴り続けるのを防ぐ。解放は use:playableVideo 側で行う)
	$effect(() => {
		if (!open && videoEl && !videoEl.paused) videoEl.pause();
	});

	function fullscreen() {
		// Safari 用のプレフィックス付き API にもフォールバック
		const el = videoEl as
			| (HTMLVideoElement & {
					webkitRequestFullscreen?: () => void;
					webkitEnterFullscreen?: () => void;
			  })
			| null;
		if (!el) return;
		(el.requestFullscreen ?? el.webkitRequestFullscreen ?? el.webkitEnterFullscreen)?.call(el);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/85 backdrop-blur-md" />
		<Dialog.Content
			class="fade-up fixed top-1/2 left-1/2 z-50 flex h-[92dvh] w-[min(1100px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-edge bg-panel shadow-2xl shadow-black/70"
		>
			{#if record}
				<div class="flex items-center justify-between gap-4 border-b border-edge px-4 py-2.5">
					<Dialog.Title class="min-w-0 truncate font-mono text-xs text-mute">
						{record.video?.filename ?? '出力'}
					</Dialog.Title>
					<div class="flex shrink-0 items-center gap-2">
						{#if record.backend === 'runpod'}
							<span
								class="flex items-center gap-1 rounded border border-amber/25 bg-amber/10 px-1.5 py-0.5 font-mono text-[11px] text-amber"
								title="RunPod のコスト概算 (実行 {billableSeconds(record).toFixed(1)}秒)"
							>
								<CircleDollarSign size={11} />
								{fmtCost(billableSeconds(record), {
									costPerHour: settings.value.runpodCostPerHour,
									usdJpy: settings.value.usdJpy
								})}
							</span>
						{/if}
						{#if record.seconds > 0}
							<span class="flex items-center gap-1 font-mono text-[11px] text-mute">
								<Timer size={12} class="text-amber" />{fmtSeconds(record.seconds)}
							</span>
						{/if}
						{#if record.video && !bossMode.value}
							<button
								class="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-[11px] font-medium text-mute transition-colors hover:border-edge2 hover:text-ink"
								onclick={fullscreen}
								title="全画面で再生"
							>
								<Maximize size={13} />全画面
							</button>
						{/if}
						{#if record.video}
							<a
								href={videoUrl(host, record.video, true)}
								class="flex items-center gap-1.5 rounded-lg bg-amber px-3 py-1.5 text-[11px] font-semibold text-black transition-colors hover:bg-amber/85"
							>
								<Download size={13} />ダウンロード
							</a>
						{/if}
						<Dialog.Close
							class="rounded-md p-1.5 text-mute transition-colors hover:bg-panel2 hover:text-ink"
							aria-label="閉じる"
						>
							<X size={16} />
						</Dialog.Close>
					</div>
				</div>

				<div class="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black/50 p-3">
					{#if bossMode.value}
						<div class="aspect-video max-h-full w-full overflow-hidden rounded-md">
							<TestPattern />
						</div>
					{:else if record.video}
						<!-- svelte-ignore a11y_media_has_caption -->
						<video
							bind:this={videoEl}
							use:playableVideo
							class="max-h-full max-w-full rounded-md object-contain"
							src={videoUrl(host, record.video)}
							controls
							autoplay
							loop
						></video>
					{:else}
						<p class="py-16 text-sm text-faint">動画ファイルがありません</p>
					{/if}
				</div>

				<div class="grid max-h-[30dvh] shrink-0 gap-2 overflow-y-auto border-t border-edge px-4 py-3 text-xs">
					{#if record.jpPrompt}
						<div>
							<span class="mr-2 font-mono text-[10px] tracking-widest text-amber uppercase">JP</span>
							<span class="text-ink/90">{record.jpPrompt}</span>
						</div>
					{/if}
					{#if record.enPrompt}
						<div>
							<span class="mr-2 font-mono text-[10px] tracking-widest text-faint uppercase">EN</span>
							<span class="text-mute">{record.enPrompt}</span>
						</div>
					{/if}
					<div class="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-faint">
						<span>{record.params.aspectRatio}</span>
						<span>{record.params.megapixels}MP</span>
						<span>{record.params.duration}s</span>
						<span>{record.params.steps}steps</span>
						<span>{new Date(record.date).toLocaleString('ja-JP')}</span>
					</div>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
