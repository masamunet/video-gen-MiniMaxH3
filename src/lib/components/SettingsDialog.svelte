<script lang="ts">
	import { Dialog } from 'bits-ui';
	import X from '@lucide/svelte/icons/x';
	import ServerCog from '@lucide/svelte/icons/server-cog';
	import CircleDollarSign from '@lucide/svelte/icons/circle-dollar-sign';
	import Bell from '@lucide/svelte/icons/bell';
	import { settings, DEFAULT_EXEC_TIMEOUT_MIN, type Backend } from '$lib/stores.svelte';
	import {
		notifySupported,
		notifyPermission,
		requestNotifyPermission,
		showNotification
	} from '$lib/compat';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let draftHost = $state('');
	let draftBackend = $state<Backend>('comfy');
	let draftEndpointId = $state('');
	let draftTimeoutMin = $state(DEFAULT_EXEC_TIMEOUT_MIN);
	let draftCostPerHour = $state(1.1);
	let draftUsdJpy = $state(165);
	let draftNotify = $state(false);
	let notifyState = $state<'granted' | 'denied' | 'default' | 'unsupported'>('unsupported');

	$effect(() => {
		if (open) {
			draftHost = settings.value.host;
			draftBackend = settings.value.backend ?? 'comfy';
			draftEndpointId = settings.value.runpodEndpointId ?? '';
			draftTimeoutMin = settings.value.runpodExecutionTimeoutMin ?? DEFAULT_EXEC_TIMEOUT_MIN;
			draftCostPerHour = settings.value.runpodCostPerHour ?? 1.1;
			draftUsdJpy = settings.value.usdJpy ?? 165;
			draftNotify = settings.value.notifyOnComplete ?? false;
			// 開くたびに許可状態を取り直す。ユーザーがブラウザ設定側で変えている可能性があるため
			notifyState = notifyPermission();
		}
	});

	/** ON にしたときだけ許可を要求する (許可要求はユーザー操作起点でないとブラウザに無視される) */
	async function toggleNotify(next: boolean) {
		if (!next) {
			draftNotify = false;
			return;
		}
		if (!notifySupported()) {
			draftNotify = false;
			notifyState = 'unsupported';
			return;
		}
		notifyState = await requestNotifyPermission();
		draftNotify = notifyState === 'granted';
	}

	/** RunPod の policy.executionTimeout に渡せる範囲 (1〜180 分) に丸める */
	function clampTimeout(min: number): number {
		if (!(min > 0)) return DEFAULT_EXEC_TIMEOUT_MIN;
		return Math.min(Math.max(Math.round(min), 1), 180);
	}

	function save() {
		settings.value = {
			...settings.value,
			host: draftHost.trim() || settings.value.host,
			backend: draftBackend,
			runpodEndpointId: draftEndpointId.trim(),
			runpodExecutionTimeoutMin: clampTimeout(Number(draftTimeoutMin)),
			runpodCostPerHour: Number(draftCostPerHour) || 0,
			usdJpy: Number(draftUsdJpy) || 0,
			// 保存時にも許可状態を再確認し、拒否されていれば ON のまま保存しない
			notifyOnComplete: draftNotify && notifyPermission() === 'granted'
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

					<div>
						<label class="mb-1.5 block text-xs font-medium text-mute" for="timeout-input">
							実行タイムアウト (分)
						</label>
						<input
							id="timeout-input"
							type="number"
							class="field-input text-center font-mono text-[13px]"
							min="1"
							max="180"
							step="1"
							bind:value={draftTimeoutMin}
							onkeydown={(e) => e.key === 'Enter' && save()}
						/>
						<p class="mt-1.5 text-[11px] leading-relaxed text-faint">
							1本の生成がこの時間を超えると RunPod がジョブを打ち切ります (エラー
							<code class="rounded bg-well px-1 font-mono">executionTimeout exceeded</code>)。
							RunPod 側の既定は 10 分で、メガピクセルや duration を上げると足りなくなります。
							コールドスタートのモデル読み込み時間も含まれるので長めにしてください。
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

				<div class="border-t border-edge pt-4">
					<span class="mb-2 flex items-center gap-1.5 text-xs font-medium text-mute">
						<Bell size={13} class="text-amber" />
						デスクトップ通知
					</span>
					<label class="flex items-center gap-2 text-xs text-ink">
						<input
							type="checkbox"
							checked={draftNotify}
							onchange={(e) => toggleNotify(e.currentTarget.checked)}
							disabled={notifyState === 'unsupported'}
						/>
						生成が完了したら通知する
					</label>
					<p class="mt-1.5 text-[11px] leading-relaxed text-faint">
						{#if notifyState === 'unsupported'}
							この環境では通知を利用できません。ブラウザの通知 API は https か localhost
							でのみ動作します(ホスト名や IP で開いた場合は対象外)。
						{:else if notifyState === 'denied'}
							ブラウザで通知がブロックされています。アドレスバーのサイト設定から許可してください。
						{:else}
							タブが非表示・非フォーカスのときだけ通知します。macOS
							側でもブラウザの通知が許可されている必要があります(システム設定 → 通知)。
						{/if}
					</p>
					{#if notifyState === 'granted'}
						<!-- 通常の通知はタブが非表示・非フォーカスのときだけ出すが、
						     テスト通知は設定直後にこの画面を見ている状態で押すため、
						     ここで何も起きないと壊れているように見える。よって
						     showNotification を直接呼び、可視状態でも必ず出す -->
						<button
							class="mt-2 rounded-lg border border-edge px-3 py-1.5 text-[11px] font-medium text-mute transition-colors hover:border-edge2 hover:text-ink"
							onclick={() =>
								showNotification({
									title: '通知テスト',
									body: 'デスクトップ通知は有効です',
									group: 'vg:test'
								})}
						>
							テスト通知
						</button>
					{/if}
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
