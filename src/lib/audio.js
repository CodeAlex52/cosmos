/**
 * audio.js — 程序化 Web Audio API 宇宙声音引擎
 * 零外部音频文件；默认静音，仅在用户主动开启后发声
 */

const LYDIAN_PAD = [73.42, 110.0, 164.81, 185.0, 277.18]; // D2, A2, E3, F#3, C#4
const GUQIN_PAD = [73.42, 110.0, 146.83, 220.0, 293.66]; // D2, A2, D3, A3, D4 (清雅宫商)
const CHIME_SCALE = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99, 880.0];

class CosmosAudioEngine {
	constructor() {
		this.ctx = null;
		this.enabled = false;
		this.theme = typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark";
		this.warp = 0;
		this.master = null;
		this.dryGain = null;
		this.wetGain = null;
		this.filter = null;
		this.padGain = null;
		this.padVoices = [];
		this.lfo = null;
		this.lastHoverAt = 0;
		this._wiredVis = false;
	}

	_ensureContext() {
		if (this.ctx) return this.ctx;
		const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
		if (!AC) return null;

		const ctx = new AC();
		this.ctx = ctx;

		// 主音量与限幅防爆音
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = -16;
		comp.knee.value = 18;
		comp.ratio.value = 4;
		comp.attack.value = 0.01;
		comp.release.value = 0.25;
		comp.connect(ctx.destination);

		this.master = ctx.createGain();
		this.master.gain.value = 0.0;
		this.master.connect(comp);

		this.dryGain = ctx.createGain();
		this.dryGain.gain.value = 0.72;
		this.dryGain.connect(this.master);

		// 程序化 2.6 秒立体声宇宙混响
		const convolver = ctx.createConvolver();
		convolver.buffer = this._makeImpulse(ctx, 2.6, 2.8);
		this.wetGain = ctx.createGain();
		this.wetGain.gain.value = 0.48;
		convolver.connect(this.wetGain);
		this.wetGain.connect(this.master);
		this.reverb = convolver;

		// 温暖共振低通滤波器
		this.filter = ctx.createBiquadFilter();
		this.filter.type = "lowpass";
		this.filter.frequency.value = this.theme === "light" ? 720 : 520;
		this.filter.Q.value = 1.4;
		this.filter.connect(this.dryGain);
		this.filter.connect(this.reverb);

		// Pad 总线
		this.padGain = ctx.createGain();
		this.padGain.gain.value = 0.22;
		this.padGain.connect(this.filter);

		// 呼吸 LFO 轻抚滤波器
		const lfo = ctx.createOscillator();
		lfo.type = "sine";
		lfo.frequency.value = 0.085;
		const lfoAmt = ctx.createGain();
		lfoAmt.gain.value = 140;
		lfo.connect(lfoAmt);
		lfoAmt.connect(this.filter.frequency);
		lfo.start();
		this.lfo = lfo;

		// 构建 5 声部双失谐星际持续音
		const freqs = this.theme === "light" ? GUQIN_PAD : LYDIAN_PAD;
		freqs.forEach((f, idx) => {
			const oscA = ctx.createOscillator();
			const oscB = ctx.createOscillator();
			const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
			const g = ctx.createGain();

			oscA.type = idx < 2 ? "sine" : "triangle";
			oscB.type = "sine";
			oscA.frequency.value = f;
			oscB.frequency.value = f * (1 + (idx % 2 === 0 ? 0.0032 : -0.0028));
			g.gain.value = idx === 0 ? 0.28 : 0.14 / (1 + idx * 0.25);

			if (pan) {
				pan.pan.value = (idx - 2) * 0.22;
				oscA.connect(g);
				oscB.connect(g);
				g.connect(pan);
				pan.connect(this.padGain);
			} else {
				oscA.connect(g);
				oscB.connect(g);
				g.connect(this.padGain);
			}
			oscA.start();
			oscB.start();
			this.padVoices.push({ oscA, oscB, g, baseGain: g.gain.value });
		});

		if (!this._wiredVis && typeof document !== "undefined") {
			this._wiredVis = true;
			document.addEventListener("visibilitychange", () => {
				if (!this.ctx || !this.enabled) return;
				if (document.hidden) {
					this.ctx.suspend().catch(() => {});
				} else {
					this.ctx.resume().catch(() => {});
				}
			});
		}

		return ctx;
	}

	_makeImpulse(ctx, duration, decay) {
		const len = Math.floor(ctx.sampleRate * duration);
		const buf = ctx.createBuffer(2, len, ctx.sampleRate);
		for (let ch = 0; ch < 2; ch++) {
			const data = buf.getChannelData(ch);
			let lp = 0;
			for (let i = 0; i < len; i++) {
				const t = i / len;
				const env = Math.pow(1 - t, decay) * Math.min(1, i / (ctx.sampleRate * 0.03));
				const white = Math.random() * 2 - 1;
				lp = lp * 0.72 + white * 0.28;
				data[i] = lp * env;
			}
		}
		return buf;
	}

	_emit() {
		if (typeof window !== "undefined") {
			window.dispatchEvent(new CustomEvent("cosmos:audio", { detail: { enabled: this.enabled } }));
		}
	}

	isEnabled() {
		return this.enabled;
	}

	async setEnabled(on) {
		const target = !!on;
		if (target === this.enabled) return this.enabled;
		if (target) {
			const ctx = this._ensureContext();
			if (!ctx) return false;
			if (ctx.state === "suspended") await ctx.resume().catch(() => {});
			const now = ctx.currentTime;
			this.master.gain.cancelScheduledValues(now);
			this.master.gain.setValueAtTime(this.master.gain.value, now);
			this.master.gain.linearRampToValueAtTime(0.36, now + 0.65);
			this.enabled = true;
			this.playClick();
		} else if (this.ctx && this.master) {
			const now = this.ctx.currentTime;
			this.master.gain.cancelScheduledValues(now);
			this.master.gain.setValueAtTime(this.master.gain.value, now);
			this.master.gain.linearRampToValueAtTime(0.0, now + 0.35);
			this.enabled = false;
		} else {
			this.enabled = false;
		}
		this._emit();
		return this.enabled;
	}

	async toggle() {
		return this.setEnabled(!this.enabled);
	}

	setTheme(theme) {
		this.theme = theme === "light" ? "light" : "dark";
		if (!this.ctx || !this.padVoices.length) return;
		const now = this.ctx.currentTime;
		const freqs = this.theme === "light" ? GUQIN_PAD : LYDIAN_PAD;
		this.padVoices.forEach((v, idx) => {
			const f = freqs[idx] || freqs[0];
			v.oscA.frequency.setTargetAtTime(f, now, 0.55);
			v.oscB.frequency.setTargetAtTime(f * (1 + (idx % 2 === 0 ? 0.0032 : -0.0028)), now, 0.55);
		});
		if (this.filter) {
			this.filter.frequency.setTargetAtTime((this.theme === "light" ? 720 : 520) + this.warp * 900, now, 0.35);
		}
		if (this.enabled) this.playThemeSwitch(this.theme === "light");
	}

	setWarp(v) {
		this.warp = Math.max(0, Math.min(1.5, v || 0));
		if (!this.ctx || !this.enabled || !this.filter) return;
		const now = this.ctx.currentTime;
		const base = this.theme === "light" ? 720 : 520;
		this.filter.frequency.setTargetAtTime(base + this.warp * 1150, now, 0.12);
		if (this.wetGain) {
			this.wetGain.gain.setTargetAtTime(0.46 + Math.min(0.32, this.warp * 0.22), now, 0.15);
		}
	}

	_tone(freq, { dur = 0.5, gain = 0.08, type = "sine", attack = 0.01, pan = 0, wet = true } = {}) {
		if (!this.enabled || !this.ctx) return;
		const ctx = this.ctx;
		const now = ctx.currentTime;
		const osc = ctx.createOscillator();
		const env = ctx.createGain();
		osc.type = type;
		osc.frequency.setValueAtTime(freq, now);

		env.gain.setValueAtTime(0.0001, now);
		env.gain.linearRampToValueAtTime(gain, now + attack);
		env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

		osc.connect(env);
		if (ctx.createStereoPanner && pan !== 0) {
			const p = ctx.createStereoPanner();
			p.pan.value = Math.max(-0.9, Math.min(0.9, pan));
			env.connect(p);
			p.connect(this.dryGain);
			if (wet) p.connect(this.reverb);
		} else {
			env.connect(this.dryGain);
			if (wet) env.connect(this.reverb);
		}

		osc.start(now);
		osc.stop(now + dur + 0.04);
	}

	playHover() {
		if (!this.enabled || !this.ctx) return;
		const t = performance.now();
		if (t - this.lastHoverAt < 55) return;
		this.lastHoverAt = t;
		const freq = this.theme === "light" ? 880 : 1046.5;
		this._tone(freq, { dur: 0.09, gain: 0.024, type: "sine", attack: 0.004, wet: false });
	}

	playClick() {
		if (!this.enabled || !this.ctx) return;
		this._tone(this.theme === "light" ? 587.33 : 739.99, {
			dur: 0.22,
			gain: 0.055,
			type: "triangle",
			attack: 0.005,
		});
	}

	playShockwave(normY = 0.5, charge = 0) {
		if (!this.enabled || !this.ctx) return;
		const idx = Math.max(0, Math.min(CHIME_SCALE.length - 1, Math.floor((1 - normY) * CHIME_SCALE.length)));
		const root = CHIME_SCALE[idx];
		const c = Math.max(0, Math.min(1, charge));
		// 主星钟泛音
		this._tone(root, { dur: 1.5 + c * 0.9, gain: 0.085 + c * 0.05, type: "sine", attack: 0.012, pan: (normY - 0.5) * 0.5 });
		this._tone(root * 1.5, { dur: 1.2 + c * 0.8, gain: 0.045 + c * 0.03, type: "triangle", attack: 0.02, pan: -(normY - 0.5) * 0.4 });
		if (c > 0.2) {
			// 蓄力爆发增添低频共振脉冲
			this._tone(73.42, { dur: 1.4, gain: 0.14 * c, type: "sine", attack: 0.01 });
			this._tone(root * 2, { dur: 1.8, gain: 0.05 * c, type: "sine", attack: 0.03 });
		}
	}

	playThemeSwitch(isLight) {
		if (!this.enabled || !this.ctx) return;
		const notes = isLight ? [440, 587.33, 880] : [587.33, 440, 293.66];
		notes.forEach((f, i) => {
			setTimeout(() => {
				this._tone(f, { dur: 0.65, gain: 0.05, type: "sine", attack: 0.01 });
			}, i * 65);
		});
	}

	playStarLight() {
		if (!this.enabled || !this.ctx) return;
		[440, 587.33, 739.99, 880].forEach((f, i) => {
			setTimeout(() => {
				this._tone(f, { dur: 1.2, gain: 0.06, type: "sine", attack: 0.008, pan: (i - 1.5) * 0.25 });
			}, i * 70);
		});
	}
}

export const cosmosAudio = new CosmosAudioEngine();
