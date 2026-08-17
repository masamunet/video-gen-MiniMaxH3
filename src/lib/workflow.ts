// ComfyUI API ワークフロー (video_minimax_h3_t2v-upscale-api.json) の組み立て

export interface GenParams {
	prompt: string;
	aspectRatio: string;
	megapixels: number;
	duration: number;
	steps: number;
}

export const DEFAULT_PARAMS: GenParams = {
	prompt: '',
	aspectRatio: '3:4 (Portrait Standard)',
	megapixels: 0.5,
	duration: 5,
	steps: 4
};

/** ResolutionSelector が取得できない場合のフォールバック選択肢 */
export const FALLBACK_ASPECT_RATIOS = [
	'1:1 (Square)',
	'2:3 (Portrait Photo)',
	'3:2 (Photo)',
	'3:4 (Portrait Standard)',
	'4:3 (Standard)',
	'9:16 (Portrait Widescreen)',
	'16:9 (Widescreen)',
	'21:9 (Ultrawide)'
];

/** 最終日本語プロンプト(ランダムプロンプト整形後)を履歴に出すための注入ノードID */
export const JP_CAPTURE_ID = '990';
/** 翻訳+タグ復元後の最終英語プロンプトを表示している既存ノードID */
export const EN_FINAL_ID = '145:146';
/** SaveVideo ノードID */
export const SAVE_VIDEO_ID = '150';

const TEMPLATE = {
	'115': {
		inputs: { aspect_ratio: '3:4 (Portrait Standard)', megapixels: 0.5, multiple: 32 },
		class_type: 'ResolutionSelector',
		_meta: { title: '解像度セレクター' }
	},
	'122': {
		inputs: { value: ['123', 0] },
		class_type: 'ComfyNumberConvert',
		_meta: { title: '数値変換' }
	},
	'123': {
		inputs: { value: 12 },
		class_type: 'PrimitiveInt',
		_meta: { title: 'duration' }
	},
	'150': {
		inputs: {
			filename_prefix: 'video/MiniMax_H3',
			format: 'auto',
			codec: 'auto',
			video: ['105:91', 0]
		},
		class_type: 'SaveVideo',
		_meta: { title: 'ビデオを保存' }
	},
	'145:142': {
		inputs: { text: ['145:119', 0], src_lang: 'auto', dest_lang: 'en' },
		class_type: 'GFDeepTranslate',
		_meta: { title: '🐵 GF Deep Translate' }
	},
	'145:141': {
		inputs: {
			text_display: '',
			mode: '🔄 Always Update',
			text_input: ['145:142', 0]
		},
		class_type: 'M_ShowText',
		_meta: { title: 'Show Text (Debug)' }
	},
	'145:119': {
		inputs: { text: '', seed: 367, autorefresh: 'No' },
		class_type: 'DPRandomGenerator',
		_meta: { title: 'Random Prompts' }
	},
	'145:146': {
		inputs: {
			text_display: '',
			mode: '🔄 Always Update',
			text_input: ['145:147', 0]
		},
		class_type: 'M_ShowText',
		_meta: { title: 'Show Text (Debug)' }
	},
	'145:147': {
		inputs: {
			original_prompt: ['145:119', 0],
			translated_prompt: ['145:141', 0],
			match_mode: 'auto'
		},
		class_type: 'RestoreDialogTags',
		_meta: { title: 'Restore Dialog Tags (no-translate <d>)' }
	},
	'105:11': {
		inputs: { vae_name: 'minimax_h3_video_vae_fp16.safetensors' },
		class_type: 'VAELoader',
		_meta: { title: 'VAEを読み込む' }
	},
	'105:24': {
		inputs: { vae_name: 'minimax_h3_audio_vae_fp32.safetensors' },
		class_type: 'VAELoader',
		_meta: { title: 'VAEを読み込む' }
	},
	'105:23': {
		inputs: { samples: ['105:14', 0], vae: ['105:24', 0] },
		class_type: 'VAEDecodeAudio',
		_meta: { title: 'VAEデコード音声' }
	},
	'105:10': {
		inputs: { samples: ['105:14', 0], vae: ['105:11', 0] },
		class_type: 'VAEDecode',
		_meta: { title: 'VAEデコード' }
	},
	'105:17': {
		inputs: { sampler_name: 'euler' },
		class_type: 'KSamplerSelect',
		_meta: { title: 'Kサンプラー選択' }
	},
	'105:9': {
		inputs: { scheduler: 'beta', steps: 4, denoise: 1, model: ['105:127', 0] },
		class_type: 'BasicScheduler',
		_meta: { title: '基本スケジューラー' }
	},
	'105:14': {
		inputs: {
			noise: ['105:15', 0],
			guider: ['105:16', 0],
			sampler: ['105:17', 0],
			sigmas: ['105:9', 0],
			latent_image: ['105:104', 1]
		},
		class_type: 'SamplerCustomAdvanced',
		_meta: { title: 'カスタムサンプラー（高度）' }
	},
	'105:16': {
		inputs: { model: ['105:127', 0], conditioning: ['105:104', 0] },
		class_type: 'BasicGuider',
		_meta: { title: '基本ガイダー' }
	},
	'105:6': {
		inputs: {
			unet_name: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
			weight_dtype: 'default'
		},
		class_type: 'UNETLoader',
		_meta: { title: '拡散モデルを読み込む' }
	},
	'105:13': {
		inputs: {
			clip_name: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
			type: 'minimax',
			device: 'default'
		},
		class_type: 'CLIPLoader',
		_meta: { title: 'CLIPを読み込む' }
	},
	'105:15': {
		inputs: { noise_seed: 812151496287661 },
		class_type: 'RandomNoise',
		_meta: { title: 'ランダムノイズ' }
	},
	'105:91': {
		inputs: { fps: 24, bit_depth: 8, images: ['105:10', 0], audio: ['105:23', 0] },
		class_type: 'CreateVideo',
		_meta: { title: '動画を作成' }
	},
	'105:104': {
		inputs: {
			prompt: ['145:146', 0],
			width: ['115', 0],
			height: ['115', 1],
			length: ['105:107', 1],
			clip: ['105:13', 0],
			vae: ['105:11', 0]
		},
		class_type: 'MiniMaxH3ImageToVideo',
		_meta: { title: 'MiniMax H3 Image to Video' }
	},
	'105:107': {
		inputs: {
			expression: 'max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17',
			'values.a': ['105:111', 0]
		},
		class_type: 'ComfyMathExpression',
		_meta: { title: '数式' }
	},
	'105:111': {
		inputs: { value: ['122', 0] },
		class_type: 'PrimitiveFloat',
		_meta: { title: 'Float (duration)' }
	},
	'105:127': {
		inputs: {
			enabled: false,
			blend_weight: 0.5,
			degree: 4,
			ridge_lambda: 0.1,
			window_size: 2,
			flex_window: 0.75,
			warmup_steps: 5,
			tail_actual_steps: 1,
			max_history: 8,
			debug: false,
			history_storage: 'system_ram',
			bootstrap_first_forecast: true,
			anchor_residual_feedback: false,
			selective_rollback_correction: false,
			offline_smoothing_replay: true,
			audio_blend_weight: 0,
			offline_archive_storage: 'system_ram',
			model: ['105:6', 0]
		},
		class_type: 'SpectrumApplyMiniMaxH3',
		_meta: { title: 'Spectrum Apply MiniMax H3' }
	},
	'105:128': {
		inputs: {
			lora_name: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors',
			strength_model: 1,
			model: ['105:6', 0]
		},
		class_type: 'LoraLoaderModelOnly',
		_meta: { title: 'LoRAローダーモデルのみ' }
	}
} as const;

function randomSeed(max: number): number {
	return Math.floor(Math.random() * max);
}

/**
 * パラメータを適用したワークフローを生成する。
 * ノイズシードとランダムプロンプトのシードは毎回ランダム化し、
 * 整形後の日本語プロンプトを取得するための ShowText ノードを注入する。
 */
export function buildWorkflow(params: GenParams): Record<string, unknown> {
	const wf = structuredClone(TEMPLATE) as unknown as Record<
		string,
		{ inputs: Record<string, unknown>; class_type: string; _meta?: { title: string } }
	>;

	wf['115'].inputs.aspect_ratio = params.aspectRatio;
	wf['115'].inputs.megapixels = params.megapixels;
	wf['123'].inputs.value = params.duration;
	wf['105:9'].inputs.steps = params.steps;
	wf['145:119'].inputs.text = params.prompt;
	wf['145:119'].inputs.seed = randomSeed(2 ** 31);
	wf['105:15'].inputs.noise_seed = randomSeed(Number.MAX_SAFE_INTEGER);

	// ランダムプロンプト整形後(翻訳前)の日本語テキストを履歴出力に載せる
	wf[JP_CAPTURE_ID] = {
		inputs: { text_display: '', mode: '🔄 Always Update', text_input: ['145:119', 0] },
		class_type: 'M_ShowText',
		_meta: { title: 'Final JP Prompt (capture)' }
	};

	return wf;
}
