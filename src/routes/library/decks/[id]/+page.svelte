<script lang="ts">
	import { page } from '$app/state';
	import { goto, beforeNavigate } from '$app/navigation';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Layers from '@lucide/svelte/icons/layers';
	import Plus from '@lucide/svelte/icons/plus';
	import Save from '@lucide/svelte/icons/save';
	import Import from '@lucide/svelte/icons/import';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { deck, editingDeckId, type DeckCard, type SavedDeck } from '$lib/stores.svelte';
	import { appearanceRate, pileSize } from '$lib/deck';
	import { computeResolution } from '$lib/resolution';
	import { FALLBACK_ASPECT_RATIOS, DEFAULT_PARAMS } from '$lib/workflow';
	import { randomId } from '$lib/compat';

	const deckId = $derived(page.params.id ?? '');

	let name = $state('');
	let cards = $state<DeckCard[]>([]);
	let original = $state('');
	let createdAt = 0;
	let loaded = $state(false);
	let notFound = $state(false);
	let saving = $state(false);
	let saveError = $state('');

	const dirty = $derived(loaded && JSON.stringify({ name, cards }) !== original);

	$effect(() => {
		const id = deckId;
		fetch('/api/decks')
			.then((r) => (r.ok ? r.json() : []))
			.then((list: SavedDeck[]) => {
				const sd = list.find((d) => d.id === id);
				if (!sd) {
					notFound = true;
				} else {
					name = sd.name;
					cards = structuredClone(sd.cards);
					createdAt = sd.createdAt;
					original = JSON.stringify({ name: sd.name, cards: sd.cards });
				}
				loaded = true;
			})
			.catch(() => {
				notFound = true;
				loaded = true;
			});
	});

	// 未保存の変更があるままページを離れるときは確認する
	beforeNavigate((nav) => {
		if (dirty && !confirm('保存していない変更があります。破棄して移動しますか？')) {
			nav.cancel();
		}
	});

	async function save() {
		if (saving) return;
		saving = true;
		saveError = '';
		const sd: SavedDeck = {
			id: deckId,
			name: name.trim() || '無題デッキ',
			cards: $state.snapshot(cards),
			createdAt: createdAt || Date.now(),
			updatedAt: Date.now()
		};
		try {
			const res = await fetch('/api/decks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(sd)
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				saveError = data.error ?? `保存に失敗しました (${res.status})`;
				return;
			}
			name = sd.name;
			original = JSON.stringify({ name: sd.name, cards: sd.cards });
			// 構築中デッキとして開いている場合は生成画面側も追従させる
			if (editingDeckId.value === deckId) {
				deck.value = structuredClone(sd.cards);
			}
		} catch {
			saveError = 'サーバーに接続できませんでした';
		} finally {
			saving = false;
		}
	}

	function addCard() {
		cards = [
			...cards,
			{
				id: randomId(),
				title: '',
				params: structuredClone(DEFAULT_PARAMS),
				weight: 0.5,
				createdAt: Date.now()
			}
		];
	}

	function removeCard(id: string) {
		cards = cards.filter((c) => c.id !== id);
	}

	/** 編集中の内容を生成画面の構築中デッキとして読み込む */
	function loadToBuilder() {
		if (
			deck.value.length > 0 &&
			editingDeckId.value !== deckId &&
			!confirm('現在の構築中デッキをこのデッキで置き換えますか？')
		) {
			return;
		}
		deck.value = structuredClone($state.snapshot(cards));
		editingDeckId.value = deckId;
		goto('/');
	}

	function aspectOptions(current: string): string[] {
		return FALLBACK_ASPECT_RATIOS.includes(current)
			? FALLBACK_ASPECT_RATIOS
			: [current, ...FALLBACK_ASPECT_RATIOS];
	}

	function fill(v: number, min: number, max: number) {
		return `--fill: ${((v - min) / (max - min)) * 100}%`;
	}

</script>

<svelte:head>
	<title>{dirty ? '● ' : ''}{name || 'デッキ編集'}</title>
</svelte:head>

<main class="min-h-0 flex-1 overflow-y-auto">
	<div class="mx-auto max-w-4xl px-6 py-6">
		{#if !loaded}
			<p class="py-24 text-center text-sm text-faint">読み込み中…</p>
		{:else if notFound}
			<div class="flex flex-col items-center gap-4 py-24">
				<TriangleAlert size={30} class="text-faint" />
				<p class="text-sm text-mute">デッキが見つかりませんでした (削除された可能性があります)</p>
				<a href="/library/decks" class="text-xs text-amber hover:underline">デッキ管理へ戻る</a>
			</div>
		{:else}
			<!-- ヘッダー -->
			<div class="mb-5 flex flex-wrap items-center gap-3">
				<a
					href="/library/decks"
					class="flex items-center gap-1.5 rounded-lg border border-edge px-2.5 py-1.5 text-xs text-mute transition-colors hover:border-edge2 hover:text-ink"
				>
					<ArrowLeft size={13} />デッキ管理
				</a>
				<Layers size={16} class="text-amber/70" />
				<input
					class="min-w-0 flex-1 border-b border-transparent bg-transparent text-lg font-semibold text-ink transition-colors outline-none placeholder:text-faint hover:border-edge2 focus:border-amber/40"
					bind:value={name}
					placeholder="デッキ名"
				/>
				<button
					class="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-2 text-xs font-medium text-mute transition-colors hover:border-amber/40 hover:text-amber"
					onclick={loadToBuilder}
					title="この内容を生成画面の構築中デッキとして読み込む"
				>
					<Import size={13} />生成画面へ読み込む
				</button>
				<button
					class="flex items-center gap-1.5 rounded-lg bg-amber px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-amber/85 disabled:cursor-not-allowed disabled:opacity-40"
					onclick={save}
					disabled={!dirty || saving}
				>
					<Save size={13} />
					{saving ? '保存中…' : dirty ? '保存' : '保存済み'}
				</button>
			</div>

			<div class="mb-4 flex items-center gap-3 font-mono text-[11px] text-faint">
				<span>カード {cards.length} 枚</span>
				<span>山札1周 {pileSize(cards)} 枚</span>
				{#if dirty}
					<span class="text-amber">未保存の変更があります</span>
				{/if}
			</div>

			{#if saveError}
				<div
					class="mb-4 flex items-start gap-2 rounded-lg border border-rec/30 bg-rec/10 p-3 text-xs leading-relaxed text-rec"
				>
					<TriangleAlert size={14} class="mt-0.5 shrink-0" />
					<span class="min-w-0 flex-1 break-all">{saveError}</span>
				</div>
			{/if}

			<!-- カード一覧 (縦に大きく表示して編集しやすく) -->
			<div class="flex flex-col gap-4">
				{#each cards as card, i (card.id)}
					<div
						class="rounded-xl border bg-panel p-4 transition-opacity
						{card.weight > 0 ? 'border-edge' : 'border-edge opacity-50'}"
					>
						<div class="flex items-center gap-2">
							<span class="font-mono text-[10px] text-faint">#{i + 1}</span>
							<input
								class="min-w-0 flex-1 border-b border-transparent bg-transparent text-[13px] font-medium text-ink transition-colors outline-none placeholder:text-faint/60 hover:border-edge2 focus:border-amber/40"
								value={card.title ?? ''}
								oninput={(e) => (cards[i].title = e.currentTarget.value)}
								placeholder="カードのタイトル"
							/>
							<span
								class="shrink-0 rounded border border-amber/25 bg-amber/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber"
								title="次の1枚に選ばれる確率 (重み ÷ デッキ全体の重みの合計)"
							>
								{Math.round(appearanceRate(card, cards) * 100)}%
							</span>
							{#if card.weight <= 0}
								<span class="shrink-0 font-mono text-[10px] text-faint">山札に入らない</span>
							{/if}
							<button
								class="shrink-0 rounded-lg p-1.5 text-faint transition-colors hover:bg-rec/15 hover:text-rec"
								onclick={() => removeCard(card.id)}
								title="このカードをデッキから外す"
							>
								<Trash2 size={14} />
							</button>
						</div>

						<textarea
							class="field-input mt-3 min-h-24 resize-y font-mono text-[13px] leading-relaxed"
							value={card.params.prompt}
							oninput={(e) => (cards[i].params.prompt = e.currentTarget.value)}
							placeholder="プロンプト"
						></textarea>

						<div class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
							<div>
								<span class="mb-1 block text-[10px] text-faint">アスペクト比</span>
								<select
									class="field-input py-1.5 text-xs"
									value={card.params.aspectRatio}
									onchange={(e) => (cards[i].params.aspectRatio = e.currentTarget.value)}
								>
									{#each aspectOptions(card.params.aspectRatio) as opt (opt)}
										<option value={opt}>{opt}</option>
									{/each}
								</select>
							</div>
							<div>
								<span class="mb-1 block text-[10px] text-faint">
									メガピクセル
									{#if computeResolution(card.params.aspectRatio, card.params.megapixels)}
										{@const r = computeResolution(card.params.aspectRatio, card.params.megapixels)}
										<span class="font-mono text-faint/70">({r?.width}×{r?.height})</span>
									{/if}
								</span>
								<input
									type="number"
									class="field-input py-1.5 text-center font-mono text-xs"
									min="0.1"
									max="2"
									step="0.1"
									value={card.params.megapixels}
									oninput={(e) => (cards[i].params.megapixels = Number(e.currentTarget.value) || 0.1)}
								/>
							</div>
							<div>
								<span class="mb-1 block text-[10px] text-faint">Duration (秒)</span>
								<input
									type="number"
									class="field-input py-1.5 text-center font-mono text-xs"
									min="5"
									max="20"
									step="1"
									value={card.params.duration}
									oninput={(e) => (cards[i].params.duration = Number(e.currentTarget.value) || 5)}
								/>
							</div>
							<div>
								<span class="mb-1 block text-[10px] text-faint">Steps</span>
								<input
									type="number"
									class="field-input py-1.5 text-center font-mono text-xs"
									min="4"
									max="35"
									step="1"
									value={card.params.steps}
									oninput={(e) => (cards[i].params.steps = Number(e.currentTarget.value) || 4)}
								/>
							</div>
						</div>

						<div class="mt-3 flex items-center gap-3">
							<span class="shrink-0 text-[10px] text-mute">重み</span>
							<input
								type="range"
								class="fader flex-1"
								min="0"
								max="1"
								step="0.1"
								value={card.weight}
								oninput={(e) => (cards[i].weight = Math.round(Number(e.currentTarget.value) * 10) / 10)}
								style={fill(card.weight, 0, 1)}
							/>
							<span class="w-8 shrink-0 text-right font-mono text-xs text-amber">
								{card.weight.toFixed(1)}
							</span>
						</div>
					</div>
				{/each}

				<button
					class="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-edge2 py-3 text-xs font-medium text-mute transition-colors hover:border-amber/40 hover:text-amber"
					onclick={addCard}
				>
					<Plus size={14} />カードを追加
				</button>
			</div>
		{/if}
	</div>
</main>
