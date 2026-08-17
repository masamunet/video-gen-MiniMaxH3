<script lang="ts">
	import { Dialog } from 'bits-ui';
	import X from '@lucide/svelte/icons/x';
	import ServerCog from '@lucide/svelte/icons/server-cog';
	import CircleDollarSign from '@lucide/svelte/icons/circle-dollar-sign';
	import { settings, type Backend } from '$lib/stores.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let draftHost = $state('');
	let draftBackend = $state<Backend>('comfy');
	let draftEndpointId = $state('');
	let draftCostPerHour = $state(1.1);
	let draftUsdJpy = $state(165);

	$effect(() => {
		if (open) {
			draftHost = settings.value.host;
			draftBackend = settings.value.backend ?? 'comfy';
			draftEndpointId = settings.value.runpodEndpointId ?? '';
			draftCostPerHour = settings.value.runpodCostPerHour ?? 1.1;
			draftUsdJpy = settings.value.usdJpy ?? 165;
		}
	});

	function save() {
		settings.value = {
			...settings.value,
			host: draftHost.trim() || settings.value.host,
			backend: draftBackend,
			runpodEndpointId: draftEndpointId.trim(),
			runpodCostPerHour: Number(draftCostPerHour) || 0,
			usdJpy: Number(draftUsdJpy) || 0
		};
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
		<Dialog.Content
			class="fade-up fixed top-1/2 left-1/2 z-50 w-[min(480px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-edge bg-panel p-6 shadow-2xl shadow-black/60"
		>
			<div class="mb-4 flex items-center justify-between">
				<Dialog.Title class="flex items-center gap-2 font-mono text-sm font-semibold tracking-widest text-ink uppercase">
					<ServerCog size={16} class="text-amber" />
					Settings
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
					<label class="mb-1.5 block text-xs font-medium text-mute" for="backend-select">
						API サーバー
					</label>
					<select id="backend-select" class="field-input" bind:value={draftBackend}>
						<option value="comfy">デスクトップマシン (ComfyUI)</option>
						<option value="runpod">RunPod Serverless</option>
					</select>
				</div>

				{#if draftBackend === 'comfy'}
					<div>
						<label class="mb-1.5 block text-xs font-medium text-mute" for="host-input">
							ComfyUI ホスト
						</label>
						<input
							id="host-input"
							class="field-input font-mono text-[13px]"
							bind:value={draftHost}
							placeholder="http://localhost:8000/"
							onkeydown={(e) => e.key === 'Enter' && save()}
						/>
						<p class="mt-1.5 text-[11px] leading-relaxed text-faint">
							ComfyUI サーバーの URL。アスペクト比などの選択肢もこのサーバーから取得します。
						</p>
					</div>
				{:else}
					<div>
						<label class="mb-1.5 block text-xs font-medium text-mute" for="endpoint-input">
							RunPod Endpoint ID
						</label>
						<input
							id="endpoint-input"
							class="field-input font-mono text-[13px]"
							bind:value={draftEndpointId}
							placeholder="your-runpod-endpoint-id"
							onkeydown={(e) => e.key === 'Enter' && save()}
						/>
						<p class="mt-1.5 text-[11px] leading-relaxed text-faint">
							API キーはこの画面では設定しません。アプリのサーバーを環境変数
							<code class="rounded bg-well px-1 font-mono text-amber/80">RUNPOD_API_KEY</code>
							を付けて起動してください (例:
							<code class="rounded bg-well px-1 font-mono">RUNPOD_API_KEY=... node build</code>)。
							過去にデスクトップで生成した動画の再生には引き続き ComfyUI ホストを使います。
						</p>
					</div>
				{/if}

				<!-- RunPod のコスト計算 (現在のバックエンドに関わらず履歴の表示に使う) -->
				<div class="border-t border-edge pt-4">
					<span class="mb-2 flex items-center gap-1.5 text-xs font-medium text-mute">
						<CircleDollarSign size={13} class="text-amber" />
						RunPod コスト計算
					</span>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="mb-1.5 block text-[11px] text-faint" for="cost-input">
								ワーカー単価 ($/hr)
							</label>
							<input
								id="cost-input"
								type="number"
								class="field-input text-center font-mono text-[13px]"
								min="0"
								step="0.01"
								bind:value={draftCostPerHour}
								onkeydown={(e) => e.key === 'Enter' && save()}
							/>
						</div>
						<div>
							<label class="mb-1.5 block text-[11px] text-faint" for="jpy-input">
								ドル円レート (¥/$)
							</label>
							<input
								id="jpy-input"
								type="number"
								class="field-input text-center font-mono text-[13px]"
								min="0"
								step="0.1"
								bind:value={draftUsdJpy}
								onkeydown={(e) => e.key === 'Enter' && save()}
							/>
						</div>
					</div>
					<p class="mt-2 text-[11px] leading-relaxed text-faint">
						RunPod 生成の動画に、ワーカーの実行時間から算出したコスト概算を表示します。
					</p>
				</div>
			</div>

			<div class="mt-5 flex justify-end gap-2">
				<Dialog.Close
					class="rounded-lg border border-edge px-4 py-2 text-xs font-medium text-mute transition-colors hover:border-edge2 hover:text-ink"
				>
					キャンセル
				</Dialog.Close>
				<button
					class="rounded-lg bg-amber px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-amber/85"
					onclick={save}
				>
					保存
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
