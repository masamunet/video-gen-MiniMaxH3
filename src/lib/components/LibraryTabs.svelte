<script lang="ts">
	// ライブラリ配下 (生成物管理 / デッキ管理) の切り替えタブ
	import Clapperboard from '@lucide/svelte/icons/clapperboard';
	import Layers from '@lucide/svelte/icons/layers';

	let { current }: { current: 'videos' | 'decks' } = $props();

	const tabs = [
		{ key: 'videos', href: '/library', label: '生成物管理', icon: Clapperboard },
		{ key: 'decks', href: '/library/decks', label: 'デッキ管理', icon: Layers }
	] as const;
</script>

<div class="flex items-center gap-4">
	<h1 class="font-mono text-sm font-semibold tracking-[0.25em] text-ink uppercase">Library</h1>
	<nav class="flex items-center gap-1 rounded-lg border border-edge bg-panel p-0.5">
		{#each tabs as tab (tab.key)}
			<a
				href={tab.href}
				class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors
				{current === tab.key ? 'bg-amber/10 text-amber' : 'text-mute hover:bg-panel2 hover:text-ink'}"
			>
				<tab.icon size={13} />
				{tab.label}
			</a>
		{/each}
	</nav>
</div>
