<script lang="ts">
	// ボスが来たモード用プレースホルダー。
	// 業務的な「映像生成試験パターン」に見えるモノクロのテストチャート。
	let { compact = false }: { compact?: boolean } = $props();

	const steps = Array.from({ length: 10 }, (_, i) => 10 + i * 6.5);
</script>

<div
	class="relative flex size-full flex-col items-center justify-center overflow-hidden bg-[#16181c] select-none"
	style="background-image: linear-gradient(rgb(255 255 255 / 0.035) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.035) 1px, transparent 1px); background-size: 22px 22px;"
>
	{#if compact}
		<span class="font-mono text-[8px] font-medium tracking-[0.25em] text-[#565d6b]">
			TEST&nbsp;SIGNAL
		</span>
		<div class="absolute inset-x-2 bottom-1.5 flex h-1">
			{#each steps as l (l)}
				<div class="flex-1" style="background: hsl(220 4% {l}%)"></div>
			{/each}
		</div>
	{:else}
		<!-- 四隅のレジストレーションマーク -->
		{#each [['top-3', 'left-3'], ['top-3', 'right-3'], ['bottom-3', 'left-3'], ['bottom-3', 'right-3']] as [v, h] (v + h)}
			<div class="absolute {v} {h} size-3 border border-[#3a3f4a] {h.includes('left') ? 'border-r-0' : 'border-l-0'} {v.includes('top') ? 'border-b-0' : 'border-t-0'}"></div>
		{/each}

		<span class="absolute top-2.5 left-8 font-mono text-[9px] tracking-[0.2em] text-[#565d6b]">
			SIG-CHK&nbsp;1080/24p
		</span>
		<span class="absolute top-2.5 right-8 font-mono text-[9px] tracking-[0.2em] text-[#565d6b]">
			REF&nbsp;75%
		</span>

		<!-- 中央の照準チャート -->
		<div class="flex flex-col items-center gap-3">
			<svg width="72" height="72" viewBox="0 0 72 72" class="text-[#3f4552]">
				<circle cx="36" cy="36" r="30" fill="none" stroke="currentColor" stroke-width="1.5" />
				<circle cx="36" cy="36" r="16" fill="none" stroke="currentColor" stroke-width="1" />
				<line x1="36" y1="0" x2="36" y2="14" stroke="currentColor" stroke-width="1" />
				<line x1="36" y1="58" x2="36" y2="72" stroke="currentColor" stroke-width="1" />
				<line x1="0" y1="36" x2="14" y2="36" stroke="currentColor" stroke-width="1" />
				<line x1="58" y1="36" x2="72" y2="36" stroke="currentColor" stroke-width="1" />
				<circle cx="36" cy="36" r="2" fill="currentColor" />
			</svg>
			<p class="font-mono text-[13px] font-medium tracking-[0.35em] text-[#7d8494]">
				映像生成試験実施中
			</p>
			<p class="font-mono text-[9px] tracking-[0.28em] text-[#565d6b]">
				VIDEO&nbsp;GENERATION&nbsp;QUALITY&nbsp;ASSURANCE&nbsp;TEST&nbsp;—&nbsp;PATTERN&nbsp;03
			</p>
		</div>

		<!-- グレースケールステップ -->
		<div class="absolute inset-x-8 bottom-6 flex h-2.5 border border-[#2a2e37]">
			{#each steps as l (l)}
				<div class="flex-1" style="background: hsl(220 4% {l}%)"></div>
			{/each}
		</div>
	{/if}
</div>
