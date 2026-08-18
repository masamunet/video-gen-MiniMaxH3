<script lang="ts">
	import { goto } from '$app/navigation';
	import Layers from '@lucide/svelte/icons/layers';
	import Plus from '@lucide/svelte/icons/plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import CopyPlus from '@lucide/svelte/icons/copy-plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Import from '@lucide/svelte/icons/import';
	import LibraryTabs from '$lib/components/LibraryTabs.svelte';
	import { deck, editingDeckId, type SavedDeck } from '$lib/stores.svelte';
	import { pileSize } from '$lib/deck';
	import { randomId } from '$lib/compat';

	let decks = $state<SavedDeck[]>([]);
	let loaded = $state(false);

	$effect(() => {
		fetch('/api/decks')
			.then((r) => (r.ok ? r.json() : []))
			.then((list) => {
				decks = list;
				loaded = true;
			})
			.catch(() => (loaded = true));
	});

	async function persist(sd: SavedDeck) {
		await fetch('/api/decks', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(sd)
		}).catch(() => {});
	}

	/** 空のデッキを作成して編集画面へ */
	async function createDeck() {
		const now = Date.now();
		const sd: SavedDeck = {
			id: randomId(),
			name: '無題デッキ',
			cards: [],
			createdAt: now,
			updatedAt: now
		};
		await persist(sd);
		goto(`/library/decks/${sd.id}`);
	}

	async function duplicate(e: MouseEvent, sd: SavedDeck) {
		e.stopPropagation();
		const now = Date.now();
		const copy: SavedDeck = {
			id: randomId(),
			name: `${sd.name} (コピー)`,
			cards: structuredClone($state.snapshot(sd).cards),
			createdAt: now,
			updatedAt: now
		};
		decks = [copy, ...decks];
		await persist(copy);
	}

	async function remove(e: MouseEvent, sd: SavedDeck) {
		e.stopPropagation();
		if (!confirm(`デッキ「${sd.name}」を削除しますか？`)) return;
		decks = decks.filter((d) => d.id !== sd.id);
		if (editingDeckId.value === sd.id) editingDeckId.value = null;
		await fetch(`/api/decks/${encodeURIComponent(sd.id)}`, { method: 'DELETE' }).catch(() => {});
	}

	/** 生成画面の構築中デッキとして読み込む */
	function loadToBuilder(e: MouseEvent, sd: SavedDeck) {
		e.stopPropagation();
		if (
			deck.value.length > 0 &&
			editingDeckId.value !== sd.id &&
			!confirm(`現在の構築中デッキを「${sd.name}」で置き換えますか？`)
		) {
			return;
		}
		deck.value = structuredClone($state.snapshot(sd).cards);
		editingDeckId.value = sd.id;
		goto('/');
	}

	function cardLabel(sd: SavedDeck): string {
		return sd.cards.map((c) => c.title?.trim() || c.params.prompt).join(' / ');
	}
</script>

<main class="min-h-0 flex-1 overflow-y-auto">
	<div class="mx-auto max-w-6xl px-6 py-6">
		<div class="mb-5 flex flex-wrap items-center gap-4">
			<LibraryTabs current="decks" />
			<span class="font-mono text-[11px] text-faint">{decks.length} 件</span>
			<button
				class="ml-auto flex items-center gap-1.5 rounded-lg bg-amber px-3.5 py-2 text-xs font-semibold text-black transition-colors hover:bg-amber/85"
				onclick={createDeck}
			>
				<Plus size={14} />新しいデッキ
			</button>
		</div>

		{#if decks.length === 0}
			<div class="flex flex-col items-center gap-4 py-24">
				<div
					class="flex size-20 items-center justify-center rounded-2xl border border-dashed border-edge2 text-faint"
				>
					<Layers size={30} />
				</div>
				<p class="text-sm text-mute">
					{loaded
						? '保存済みのデッキがありません。「新しいデッキ」から作成するか、生成画面の Deck タブで保存できます'
						: '読み込み中…'}
				</p>
			</div>
		{:else}
			<div class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
				{#each decks as sd (sd.id)}
					<div
						class="group fade-up cursor-pointer rounded-xl border p-4 transition-all hover:shadow-lg hover:shadow-black/40
						{editingDeckId.value === sd.id
							? 'border-amber/50 bg-amber/5'
							: 'border-edge bg-panel hover:border-edge2'}"
						onclick={() => goto(`/library/decks/${sd.id}`)}
						onkeydown={(e) => e.key === 'Enter' && goto(`/library/decks/${sd.id}`)}
						role="button"
						tabindex="0"
						title="クリックで編集画面を開く"
					>
						<div class="flex items-center gap-2">
							<Layers size={15} class="shrink-0 text-amber/70" />
							<h2 class="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
								{sd.name}
							</h2>
							{#if editingDeckId.value === sd.id}
								<span
									class="shrink-0 rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 text-[9px] text-amber"
								>
									構築中
								</span>
							{/if}
						</div>

						<p class="mt-2 line-clamp-2 min-h-8 text-[11px] leading-relaxed text-mute">
							{cardLabel(sd) || '(カードなし)'}
						</p>

						<div class="mt-3 flex items-center gap-3 font-mono text-[10px] text-faint">
							<span>{sd.cards.length}枚</span>
							<span>山札{pileSize(sd.cards)}枚</span>
							<span class="ml-auto">
								{new Date(sd.updatedAt).toLocaleString('ja-JP', {
									month: 'numeric',
									day: 'numeric',
									hour: '2-digit',
									minute: '2-digit'
								})}
							</span>
						</div>

						<div class="mt-3 flex items-center gap-2 border-t border-edge pt-3">
							<a
								class="flex items-center gap-1 rounded-lg border border-edge px-2.5 py-1.5 text-[11px] font-medium text-mute transition-colors hover:border-amber/40 hover:text-amber"
								href={`/library/decks/${sd.id}`}
								onclick={(e) => e.stopPropagation()}
							>
								<Pencil size={12} />編集
							</a>
							<button
								class="flex items-center gap-1 rounded-lg border border-edge px-2.5 py-1.5 text-[11px] font-medium text-mute transition-colors hover:border-amber/40 hover:text-amber"
								onclick={(e) => loadToBuilder(e, sd)}
								title="生成画面の構築中デッキとして読み込む"
							>
								<Import size={12} />読み込む
							</button>
							<button
								class="ml-auto rounded-lg p-1.5 text-faint transition-colors hover:bg-panel2 hover:text-amber"
								onclick={(e) => duplicate(e, sd)}
								title="このデッキを複製する"
							>
								<CopyPlus size={13} />
							</button>
							<button
								class="rounded-lg p-1.5 text-faint transition-colors hover:bg-rec/15 hover:text-rec"
								onclick={(e) => remove(e, sd)}
								title="このデッキを削除する"
							>
								<Trash2 size={13} />
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</main>
