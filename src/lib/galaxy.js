/**
 * galaxy.js — 程序化天体物理螺旋星系、深空星空与流星尾迹生成
 * 统一 11-float stride: x, y, z, size, r, g, b, phase, normR, kind, orbSpeed
 */

function rng(seed) {
	let s = seed >>> 0;
	return () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		s >>>= 0;
		return s / 4294967296;
	};
}

function gauss(r) {
	const u = Math.max(1e-6, 1 - r());
	const v = r();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const PALETTES = {
	// 旋涡星系：暖金银心 + 蔚蓝旋臂 + 玫瑰电离氢区
	spiral: {
		core: [1.0, 0.87, 0.64],
		arm: [0.64, 0.78, 1.0],
		young: [1.0, 0.52, 0.66],
		dust: [0.28, 0.16, 0.2],
		tintA: [0.06, 0.04, 0.13],
		tintB: [0.11, 0.07, 0.04],
	},
	// 年轻蓝色星云星系
	blue: {
		core: [1.0, 0.95, 0.86],
		arm: [0.46, 0.74, 1.0],
		young: [0.44, 0.9, 1.0],
		dust: [0.16, 0.25, 0.4],
		tintA: [0.03, 0.07, 0.15],
		tintB: [0.07, 0.04, 0.12],
	},
	// 紫红星云（灵感/人物/故事）
	magenta: {
		core: [1.0, 0.86, 0.9],
		arm: [0.85, 0.58, 1.0],
		young: [1.0, 0.46, 0.78],
		dust: [0.3, 0.15, 0.28],
		tintA: [0.09, 0.03, 0.12],
		tintB: [0.12, 0.05, 0.09],
	},
	// 琥珀椭圆星系（关于 / 记录）
	elliptical: {
		core: [1.0, 0.84, 0.56],
		arm: [0.95, 0.76, 0.56],
		young: [1.0, 0.65, 0.48],
		dust: [0.3, 0.2, 0.15],
		tintA: [0.09, 0.06, 0.04],
		tintB: [0.05, 0.04, 0.1],
	},
};

function lerpColor(a, b, t) {
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function makeGalaxy(opt = {}) {
	const {
		count = 60000,
		arms = 2,
		tightness = 2.6,
		radius = 1.0,
		thickness = 0.06,
		palette = "spiral",
		seed = 1,
		bulge = 0.15,
	} = opt;

	const P = PALETTES[palette] || PALETTES.spiral;
	const r = rng(seed);
	const stride = 11;
	const data = new Float32Array(count * stride);

	for (let i = 0; i < count; i++) {
		const o = i * stride;
		const isCore = r() < bulge;

		let rad, ang, z, color, size, normR, kind;

		if (isCore) {
			// 微带棒旋核球
			rad = Math.abs(gauss(r)) * radius * 0.19;
			ang = r() * Math.PI * 2;
			const bar = 1 + 0.16 * Math.cos(ang * 2);
			rad *= bar;
			z = gauss(r) * thickness * 2.55;
			normR = Math.min(1, rad / radius);
			kind = r() < 0.015 ? 1.0 : 2.0;
			size = kind === 1.0 ? 2.4 + r() * 2.2 : 1.05 + r() * 1.85;
			color = P.core;
		} else {
			const t = Math.pow(r(), 1.16);
			rad = radius * (0.1 + 0.9 * t);
			normR = Math.min(1, rad / radius);

			const armIndex = Math.floor(r() * arms);
			const armOffset = (armIndex / arms) * Math.PI * 2;
			const spiralAng = tightness * Math.log(rad / (radius * 0.12));

			const onArm = r() < 0.85;
			const spread = (0.065 + 0.25 * t) * (r() - 0.5) * 2.0;
			ang = onArm
				? armOffset + spiralAng + spread + gauss(r) * 0.02 * (0.4 + t)
				: r() * Math.PI * 2;

			z = gauss(r) * thickness * (0.34 + 0.92 * (1 - t));

			const roll = r();
			if (roll < 0.026) {
				// 恒星形成电离区亮星团
				color = P.young;
				size = 2.0 + r() * 3.8;
				kind = r() < 0.55 ? 1.0 : 0.0;
			} else if (roll < 0.05) {
				// 炫目 O/B 蓝巨星带四芒星衍射尖峰
				color = lerpColor(P.core, P.arm, 0.35 + t * 0.55);
				size = 2.4 + r() * 2.9;
				kind = 1.0;
			} else {
				const mix = Math.min(1, t * 1.14);
				color = lerpColor(P.core, P.arm, mix);
				size = 0.55 + r() * 1.38;
				kind = 0.0;
			}
		}

		// 开普勒差动角速度：越靠核心越快
		const orbSpeed = 1.0 / (0.28 + Math.pow(Math.max(0.02, normR), 0.72));

		data[o] = Math.cos(ang) * rad;
		data[o + 1] = Math.sin(ang) * rad;
		data[o + 2] = z;
		data[o + 3] = size;
		data[o + 4] = color[0];
		data[o + 5] = color[1];
		data[o + 6] = color[2];
		data[o + 7] = r();
		data[o + 8] = normR;
		data[o + 9] = kind;
		data[o + 10] = orbSpeed;
	}

	return { data, stride, count, radius, thickness };
}

export function makeDust(opt = {}) {
	const {
		count = 18000,
		arms = 2,
		tightness = 2.6,
		radius = 1.0,
		thickness = 0.05,
		palette = "spiral",
		seed = 99,
	} = opt;

	const P = PALETTES[palette] || PALETTES.spiral;
	const r = rng(seed);
	const stride = 11;
	const data = new Float32Array(count * stride);

	for (let i = 0; i < count; i++) {
		const o = i * stride;
		const t = Math.pow(r(), 0.52);
		const rad = radius * (0.16 + 0.84 * t);
		const normR = Math.min(1, rad / radius);
		const armIndex = Math.floor(r() * arms);
		const armOffset = (armIndex / arms) * Math.PI * 2;
		const spiralAng = tightness * Math.log(rad / (radius * 0.12)) - 0.28;
		const spread = (0.05 + 0.2 * t) * (r() - 0.5) * 2;
		const ang = armOffset + spiralAng + spread + gauss(r) * 0.04;
		const orbSpeed = 1.0 / (0.28 + Math.pow(Math.max(0.02, normR), 0.72));

		data[o] = Math.cos(ang) * rad;
		data[o + 1] = Math.sin(ang) * rad;
		data[o + 2] = gauss(r) * thickness;
		data[o + 3] = 2.5 + r() * 6;
		data[o + 4] = P.dust[0];
		data[o + 5] = P.dust[1];
		data[o + 6] = P.dust[2];
		data[o + 7] = r();
		data[o + 8] = normR;
		data[o + 9] = 0.0;
		data[o + 10] = orbSpeed;
	}
	return { data, stride, count, radius, thickness };
}

export function makeStarfield(count = 6000, seed = 7) {
	const r = rng(seed);
	const stride = 11;
	const data = new Float32Array(count * stride);

	for (let i = 0; i < count; i++) {
		const o = i * stride;
		const u = r() * 2 - 1;
		const phi = r() * Math.PI * 2;
		const s = Math.sqrt(1 - u * u);
		const layer = r();
		const R = layer < 0.22 ? 22 + r() * 18 : 38 + r() * 62;
		const isHero = r() < 0.028 ? 1.0 : 0.0;

		data[o] = s * Math.cos(phi) * R;
		data[o + 1] = s * Math.sin(phi) * R;
		data[o + 2] = u * R;
		data[o + 3] = isHero ? 2.4 + r() * 3.2 : 0.6 + Math.pow(r(), 3) * 4.2;

		const warm = r();
		data[o + 4] = 0.74 + warm * 0.26;
		data[o + 5] = 0.8 + warm * 0.15;
		data[o + 6] = 1.0 - warm * 0.24;
		data[o + 7] = r();
		data[o + 8] = 1.0;
		data[o + 9] = isHero;
		data[o + 10] = 0.0;
	}
	return { data, stride, count };
}

/**
 * 动态流星丝带顶点系统（每帧更新 Float32Array）
 * 顶点格式：5 floats [x, y, z, alpha, headFactor]，每颗流星用 2 个三角形 (6 顶点) 构成锥形光锥
 */
export class MeteorSystem {
	constructor(maxMeteors = 7) {
		this.max = maxMeteors;
		this.stride = 5;
		this.data = new Float32Array(maxMeteors * 6 * this.stride);
		this.items = Array.from({ length: maxMeteors }, (_, i) => this._spawn(i * 1.9 + 0.5, true));
	}

	_spawn(delay = 0, init = false) {
		const angle = -0.32 - Math.random() * 0.55;
		const speed = 11 + Math.random() * 12;
		const dir = [Math.cos(angle), Math.sin(angle), (Math.random() - 0.5) * 0.25];
		const len = Math.hypot(...dir) || 1;
		dir[0] /= len;
		dir[1] /= len;
		dir[2] /= len;

		return {
			active: false,
			cooldown: init ? delay : 1.5 + Math.random() * 6.5,
			life: 0,
			maxLife: 0.75 + Math.random() * 0.65,
			origin: [0, 0, 0],
			dir,
			speed,
			length: 0.75 + Math.random() * 1.05,
			width: 0.011 + Math.random() * 0.012,
		};
	}

	update(dt, camEye, camFwd) {
		let vertCount = 0;
		// 构建正交基以让流星宽度始终面向摄像机近似平面
		const rx = camFwd[2];
		const ry = 0;
		const rz = -camFwd[0];
		const rl = Math.hypot(rx, ry, rz) || 1;
		const right = [rx / rl, ry / rl, rz / rl];
		const up = [
			camFwd[1] * right[2] - camFwd[2] * right[1],
			camFwd[2] * right[0] - camFwd[0] * right[2],
			camFwd[0] * right[1] - camFwd[1] * right[0],
		];

		for (let i = 0; i < this.max; i++) {
			const m = this.items[i];
			if (!m.active) {
				m.cooldown -= dt;
				if (m.cooldown <= 0) {
					m.active = true;
					m.life = 0;
					const dist = 9 + Math.random() * 12;
					const sx = (Math.random() - 0.5) * dist * 1.4;
					const sy = (Math.random() * 0.75 - 0.1) * dist * 0.85;
					m.origin = [
						camEye[0] + camFwd[0] * dist + right[0] * sx + up[0] * sy,
						camEye[1] + camFwd[1] * dist + right[1] * sx + up[1] * sy,
						camEye[2] + camFwd[2] * dist + right[2] * sx + up[2] * sy,
					];
				}
				continue;
			}

			m.life += dt;
			if (m.life >= m.maxLife) {
				this.items[i] = this._spawn(0, false);
				continue;
			}

			const prog = m.life / m.maxLife;
			const alpha = Math.sin(prog * Math.PI);
			const travel = m.life * m.speed;
			const hx = m.origin[0] + m.dir[0] * travel;
			const hy = m.origin[1] + m.dir[1] * travel;
			const hz = m.origin[2] + m.dir[2] * travel;

			const tailLen = m.length * (0.45 + 0.55 * Math.sin(prog * Math.PI));
			const tx = hx - m.dir[0] * tailLen;
			const ty = hy - m.dir[1] * tailLen;
			const tz = hz - m.dir[2] * tailLen;

			// 垂线方向
			let px = m.dir[1] * camFwd[2] - m.dir[2] * camFwd[1];
			let py = m.dir[2] * camFwd[0] - m.dir[0] * camFwd[2];
			let pz = m.dir[0] * camFwd[1] - m.dir[1] * camFwd[0];
			const pl = Math.hypot(px, py, pz) || 1;
			px = (px / pl) * m.width;
			py = (py / pl) * m.width;
			pz = (pz / pl) * m.width;

			const p0 = [hx + px, hy + py, hz + pz, alpha, 1.0];
			const p1 = [hx - px, hy - py, hz - pz, alpha, 1.0];
			const p2 = [tx + px * 0.08, ty + py * 0.08, tz + pz * 0.08, 0.0, 0.0];
			const p3 = [tx - px * 0.08, ty - py * 0.08, tz - pz * 0.08, 0.0, 0.0];

			const tris = [p0, p1, p2, p1, p3, p2];
			for (let k = 0; k < 6; k++) {
				const off = (vertCount++) * this.stride;
				this.data[off] = tris[k][0];
				this.data[off + 1] = tris[k][1];
				this.data[off + 2] = tris[k][2];
				this.data[off + 3] = tris[k][3];
				this.data[off + 4] = tris[k][4];
			}
		}

		return vertCount;
	}
}
