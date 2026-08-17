<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import Settings from '@lucide/svelte/icons/settings';
	import Clapperboard from '@lucide/svelte/icons/clapperboard';
	import LibraryBig from '@lucide/svelte/icons/library-big';
	import WandSparkles from '@lucide/svelte/icons/wand-sparkles';
	import SettingsDialog from '$lib/components/SettingsDialog.svelte';
	import { settings } from '$lib/stores.svelte';

	let { children } = $props();
	let settingsOpen = $state(false);

	const nav = [
		{ href: '/', label: '生成', icon: Clapperboard },
		{ href: '/builder', label: 'ビルダー', icon: WandSparkles },
		{ href: '/library', label: 'ライブラリ', icon: LibraryBig }
	];

	const hostLabel = $derived(
		settings.value.host.replace(/^https?:\/\//, '').replace(/\/+$/, '')
	);
</script>

<div class="relative z-10 flex h-dvh flex-col">
	<header
		class="flex h-12 shrink-0 items-center gap-6 border-b border-edge bg-panel/80 px-4 backdrop-blur"
	>
		<a href="/" class="flex items-center gap-2.5">
			<span class="rec-dot inline-block size-2.5 rounded-full bg-rec shadow-[0_0_8px_var(--color-rec)]"></span>
			<span class="font-mono text-[13px] font-semibold tracking-[0.2em] text-ink">
				MINIMAX&nbsp;H3
			</span>
			<span class="hidden font-mono text-[10px] tracking-[0.3em] text-faint uppercase sm:inline">
				Video&nbsp;Studio
			</span>
		</a>

		<nav class="flex items-center gap-1">
			{#each nav as item (item.href)}
				{@const active = page.url.pathname === item.href}
				<a
					href={item.href}
					class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors
					{active ? 'bg-amber/10 text-amber' : 'text-mute hover:bg-panel2 hover:text-ink'}"
				>
					<item.icon size={14} />
					{item.label}
				</a>
			{/each}
		</nav>

		<div class="ml-auto flex items-center gap-3">
			<span class="hidden font-mono text-[10px] text-faint md:inline" title="ComfyUI ホスト">
				{hostLabel}
			</span>
			<button
				class="rounded-lg p-2 text-mute transition-colors hover:bg-panel2 hover:text-ink"
				onclick={() => (settingsOpen = true)}
				aria-label="設定"
				title="設定"
			>
				<Settings size={16} />
			</button>
		</div>
	</header>

	{@render children()}
</div>

<SettingsDialog bind:open={settingsOpen} />
