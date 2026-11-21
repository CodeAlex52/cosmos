/**
 * galaxy.js — 程序化螺旋星系粒子生成
 * 纯 CPU 生成，输出 Float32Array 供 WebGL 使用
 */

// 稳定伪随机，保证每次刷新星图一致
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

// 正态分布（Box-Muller）
function gauss(r) {
	let u = 1 - r();
	let v = r();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const PALETTES = {
	// 旋涡星系：暖核 + 蓝臂 + 粉色电离区
	spiral: {
		core: [1.0, 0.86, 0.62],
		arm: [0.66, 0.78, 1.0],
		young: [1.0, 0.5, 0.62],
		dust: [0.28, 0.16, 0.2],
	},
	// 椭圆/球状：整体偏暖
	elliptical: {
		core: [1.0, 0.82, 0.55],
		arm: [0.95, 0.78, 0.6],
		young: [1.0, 0.62, 0.5],
		dust: [0.3, 0.2, 0.16],
	},
	// 蓝色年轻星系
	blue: {
		core: [1.0, 0.95, 0.85],
		arm: [0.5, 0.72, 1.0],
		young: [0.45, 0.85, 1.0],
		dust: [0.18, 0.26, 0.4],
	},
	// 紫红，用于"灵感/生活"一类
	magenta: {
		core: [1.0, 0.85, 0.9],
		arm: [0.85, 0.6, 1.0],
		young: [1.0, 0.45, 0.8],
		dust: [0.3, 0.16, 0.3],
	},
};

/**
 * @param {object} opt
 * @param {number} opt.count      粒子数
 * @param {number} opt.arms       旋臂数
 * @param {number} opt.tightness  缠绕紧密度（log 螺旋系数）
 * @param {number} opt.radius     盘半径
 * @param {number} opt.thickness  盘厚度
 * @param {string} opt.palette    调色板名
 * @param {number} opt.seed       随机种子
 */
export function makeGalaxy(opt = {}) {
	const {
		count = 60000,
		arms = 2,
		tightness = 2.6,
		radius = 1.0,
		thickness = 0.06,
		palette = "spiral",
		seed = 1,
		bulge = 0.13,
	} = opt;

	const P = PALETTES[palette] || PALETTES.spiral;
	const r = rng(seed);

	// 每个粒子: x,y,z, size, r,g,b, twinkle
	const stride = 8;
	const data = new Float32Array(count * stride);

	for (let i = 0; i < count; i++) {
		const o = i * stride;
		const isCore = r() < bulge;

		let rad, ang, z, color, size;

		if (isCore) {
			// 核球：球状高斯分布
			rad = Math.abs(gauss(r)) * radius * 0.19;
			ang = r() * Math.PI * 2;
			z = gauss(r) * thickness * 2.6;
			size = 1.1 + r() * 1.8;
			color = P.core;
		} else {
			// 盘：对数螺旋
			// 半径用 pow 分布，中心密外围疏
			// 半径分布：内圈更密，边缘稀疏
			const t = Math.pow(r(), 1.18);
			rad = radius * (0.1 + 0.9 * t);

			const armIndex = Math.floor(r() * arms);
			const armOffset = (armIndex / arms) * Math.PI * 2;
			// 对数螺旋 θ = k * ln(r)
			const spiralAng = tightness * Math.log(rad / (radius * 0.12));
			// 沿臂的弥散：越靠外越散
			// 85% 落在旋臂附近，15% 弥散在盘上，避免只剩两条细带
			const onArm = r() < 0.85;
			const spread = (0.07 + 0.26 * t) * (r() - 0.5) * 2.0;
			ang = onArm
				? armOffset + spiralAng + spread + gauss(r) * 0.02 * (0.4 + t)
				: r() * Math.PI * 2;

			z = gauss(r) * thickness * (0.35 + 0.9 * (1 - t));

			// 颜色：内圈暖、外圈蓝，少量年轻星团偏粉
			const roll = r();
			if (roll < 0.028) {
				color = P.young;
				size = 1.8 + r() * 3.6; // 明亮的恒星形成区
			} else {
				const mix = Math.min(1, t * 1.15);
				color = lerpColor(P.core, P.arm, mix);
				size = 0.55 + r() * 1.35;
			}
		}

		// 转到笛卡尔
		data[o] = Math.cos(ang) * rad;
		data[o + 1] = Math.sin(ang) * rad;
		data[o + 2] = z;

		data[o + 3] = size;
		data[o + 4] = color[0];
		data[o + 5] = color[1];
		data[o + 6] = color[2];
		data[o + 7] = r(); // 随机相位，用于闪烁
	}

	return { data, stride, count, radius, thickness };
}

/** 尘埃带：沿旋臂内缘的暗色粒子，用正常混合（不加法）绘制 */
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
	const stride = 8;
	const data = new Float32Array(count * stride);

	for (let i = 0; i < count; i++) {
		const o = i * stride;
		const t = Math.pow(r(), 0.5);
		const rad = radius * (0.16 + 0.84 * t);
		const armIndex = Math.floor(r() * arms);
		const armOffset = (armIndex / arms) * Math.PI * 2;
		// 尘埃略微内偏于旋臂
		const spiralAng = tightness * Math.log(rad / (radius * 0.12)) - 0.28;
		const spread = (0.05 + 0.2 * t) * (r() - 0.5) * 2;
		const ang = armOffset + spiralAng + spread + gauss(r) * 0.04;

		data[o] = Math.cos(ang) * rad;
		data[o + 1] = Math.sin(ang) * rad;
		data[o + 2] = gauss(r) * thickness;
		data[o + 3] = 2.5 + r() * 6;
		data[o + 4] = P.dust[0];
		data[o + 5] = P.dust[1];
		data[o + 6] = P.dust[2];
		data[o + 7] = r();
	}
	return { data, stride, count, radius, thickness };
}

/** 远景星空：球壳上的散点 */
export function makeStarfield(count = 5000, seed = 7) {
	const r = rng(seed);
	const stride = 8;
	const data = new Float32Array(count * stride);
	for (let i = 0; i < count; i++) {
		const o = i * stride;
		// 均匀球面
		const u = r() * 2 - 1;
		const phi = r() * Math.PI * 2;
		const s = Math.sqrt(1 - u * u);
		const R = 40 + r() * 60;
		data[o] = s * Math.cos(phi) * R;
		data[o + 1] = s * Math.sin(phi) * R;
		data[o + 2] = u * R;
		data[o + 3] = 0.6 + Math.pow(r(), 3) * 4.5;
		// 冷白到暖白
		const warm = r();
		data[o + 4] = 0.75 + warm * 0.25;
		data[o + 5] = 0.8 + warm * 0.15;
		data[o + 6] = 1.0 - warm * 0.22;
		data[o + 7] = r();
	}
	return { data, stride, count };
}

function lerpColor(a, b, t) {
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
