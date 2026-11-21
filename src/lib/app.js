import { makeGalaxy, makeDust, makeStarfield, PALETTES, MeteorSystem } from "./galaxy.js";
import {
	VS_STARS,
	FS_STARS,
	FS_DUST,
	VS_QUAD,
	FS_NEBULA,
	FS_BLUR,
	FS_COMPOSITE,
	VS_METEOR,
	FS_METEOR,
} from "./shaders.js";
import { cosmosAudio } from "./audio.js";

/* ============================================================
   4x4 矩阵与向量数学
   ============================================================ */

const M4 = {
	perspective(fovy, aspect, near, far) {
		const f = 1 / Math.tan(fovy / 2);
		const nf = 1 / (near - far);
		return new Float32Array([
			f / aspect, 0, 0, 0,
			0, f, 0, 0,
			0, 0, (far + near) * nf, -1,
			0, 0, 2 * far * near * nf, 0,
		]);
	},
	lookAt(eye, center, up) {
		let zx = eye[0] - center[0];
		let zy = eye[1] - center[1];
		let zz = eye[2] - center[2];
		let l = Math.hypot(zx, zy, zz) || 1;
		zx /= l; zy /= l; zz /= l;

		let xx = up[1] * zz - up[2] * zy;
		let xy = up[2] * zx - up[0] * zz;
		let xz = up[0] * zy - up[1] * zx;
		l = Math.hypot(xx, xy, xz) || 1;
		xx /= l; xy /= l; xz /= l;

		const yx = zy * xz - zz * xy;
		const yy = zz * xx - zx * xz;
		const yz = zx * xy - zy * xx;

		return new Float32Array([
			xx, yx, zx, 0,
			xy, yy, zy, 0,
			xz, yz, zz, 0,
			-(xx * eye[0] + xy * eye[1] + xz * eye[2]),
			-(yx * eye[0] + yy * eye[1] + yz * eye[2]),
			-(zx * eye[0] + zy * eye[1] + zz * eye[2]),
			1,
		]);
	},
	mul(a, b) {
		const o = new Float32Array(16);
		for (let c = 0; c < 4; c++) {
			for (let r = 0; r < 4; r++) {
				o[c * 4 + r] =
					a[r] * b[c * 4] +
					a[4 + r] * b[c * 4 + 1] +
					a[8 + r] * b[c * 4 + 2] +
					a[12 + r] * b[c * 4 + 3];
			}
		}
		return o;
	},
	model(cx, cy, cz, rot, scale, tiltX = 0) {
		const c = Math.cos(rot), s = Math.sin(rot);
		const ct = Math.cos(tiltX), st = Math.sin(tiltX);
		const k = scale;
		return new Float32Array([
			c * k, s * k, 0, 0,
			-s * ct * k, c * ct * k, st * k, 0,
			s * st * k, -c * st * k, ct * k, 0,
			cx, cy, cz, 1,
		]);
	},
	invert(m) {
		const out = new Float32Array(16);
		const m00 = m[0], m01 = m[1], m02 = m[2], m03 = m[3];
		const m10 = m[4], m11 = m[5], m12 = m[6], m13 = m[7];
		const m20 = m[8], m21 = m[9], m22 = m[10], m23 = m[11];
		const m30 = m[12], m31 = m[13], m32 = m[14], m33 = m[15];

		const b00 = m00 * m11 - m01 * m10;
		const b01 = m00 * m12 - m02 * m10;
		const b02 = m00 * m13 - m03 * m10;
		const b03 = m01 * m12 - m02 * m11;
		const b04 = m01 * m13 - m03 * m11;
		const b05 = m02 * m13 - m03 * m12;
		const b06 = m20 * m31 - m21 * m30;
		const b07 = m20 * m32 - m22 * m30;
		const b08 = m20 * m33 - m23 * m30;
		const b09 = m21 * m32 - m22 * m31;
		const b10 = m21 * m33 - m23 * m31;
		const b11 = m22 * m33 - m23 * m32;

		let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
		if (!det) return null;
		det = 1.0 / det;

		out[0] = (m11 * b11 - m12 * b10 + m13 * b09) * det;
		out[1] = (m02 * b10 - m01 * b11 - m03 * b09) * det;
		out[2] = (m31 * b05 - m32 * b04 + m33 * b03) * det;
		out[3] = (m22 * b04 - m21 * b05 - m23 * b03) * det;
		out[4] = (m12 * b08 - m10 * b11 - m13 * b07) * det;
		out[5] = (m00 * b11 - m02 * b08 + m03 * b07) * det;
		out[6] = (m32 * b02 - m30 * b05 - m33 * b01) * det;
		out[7] = (m20 * b05 - m22 * b02 + m23 * b01) * det;
		out[8] = (m10 * b10 - m11 * b08 + m13 * b06) * det;
		out[9] = (m01 * b08 - m00 * b10 - m03 * b06) * det;
		out[10] = (m30 * b04 - m31 * b02 + m33 * b00) * det;
		out[11] = (m21 * b02 - m20 * b04 - m23 * b00) * det;
		out[12] = (m11 * b07 - m10 * b09 - m12 * b06) * det;
		out[13] = (m00 * b09 - m01 * b07 + m02 * b06) * det;
		out[14] = (m31 * b01 - m30 * b03 - m32 * b00) * det;
		out[15] = (m20 * b03 - m21 * b01 + m22 * b00) * det;
		return out;
	},
	transformVec4(m, x, y, z, w) {
		return [
			m[0] * x + m[4] * y + m[8] * z + m[12] * w,
			m[1] * x + m[5] * y + m[9] * z + m[13] * w,
			m[2] * x + m[6] * y + m[10] * z + m[14] * w,
			m[3] * x + m[7] * y + m[11] * z + m[15] * w,
		];
	},
};

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function catmullRom1(p0, p1, p2, p3, t) {
	const t2 = t * t;
	const t3 = t2 * t;
	return 0.5 * (
		2 * p1 +
		(-p0 + p2) * t +
		(2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
		(-p0 + 3 * p1 - 3 * p2 + p3) * t3
	);
}

function catmullRom3(p0, p1, p2, p3, t) {
	return [
		catmullRom1(p0[0], p1[0], p2[0], p3[0], t),
		catmullRom1(p0[1], p1[1], p2[1], p3[1], t),
		catmullRom1(p0[2], p1[2], p2[2], p3[2], t),
	];
}

/* ============================================================
   场景定义与星区元数据
   ============================================================ */

const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = Math.min(innerWidth, innerHeight) < 760 || (navigator.hardwareConcurrency || 8) <= 4;
const COUNT = isMobile ? 28000 : 66000;
const DUST = isMobile ? 7000 : 16500;

const PRESET = [
	{ arms: 2, tightness: 2.55, palette: "spiral", tilt: 0.14, spin: 0.035, diffSpin: 0.022, radius: 0.88, cam: [0.24, 0.2, 3.35], fov: 44 },
	{ arms: 3, tightness: 3.1, palette: "blue", tilt: 0.44, spin: -0.028, diffSpin: -0.018, radius: 1.0, cam: [0.56, 0.28, 3.02], fov: 42 },
	{ arms: 2, tightness: 2.2, palette: "magenta", tilt: 0.26, spin: 0.045, diffSpin: 0.025, radius: 0.72, cam: [0.38, 0.32, 2.74], fov: 41 },
	{ arms: 4, tightness: 3.6, palette: "elliptical", tilt: 0.58, spin: 0.02, diffSpin: 0.015, radius: 0.92, cam: [0.46, 0.26, 3.2], fov: 43 },
];

function scenePos(i) {
	if (i === 0) return [0, 0, 0];
	const side = i % 2 === 1 ? 1 : -1;
	return [side * (5.1 + (i - 1) * 0.45), side * -1.85 - (i - 1) * 0.12, -11 - (i - 1) * 11];
}

const stopEls = [...document.querySelectorAll(".stop")];
const N = Math.max(1, stopEls.length);

const SCENES = Array.from({ length: N }, (_, i) => {
	const p = PRESET[i % PRESET.length];
	const pal = PALETTES[p.palette] || PALETTES.spiral;
	return {
		...p,
		center: scenePos(i),
		thickness: i === 0 ? 0.055 : 0.05,
		tintA: pal.tintA,
		tintB: pal.tintB,
		label: stopEls[i]?.dataset.sector || `SECTOR-${String(i).padStart(2, "0")}`,
		cat: stopEls[i]?.dataset.cat || "",
	};
});

/* ============================================================
   WebGL2 初始化与校验
   ============================================================ */

const canvas = document.getElementById("gl");
const gl = canvas.getContext("webgl2", {
	antialias: false,
	alpha: false,
	powerPreference: "high-performance",
	premultipliedAlpha: false,
});

if (!gl) {
	document.body.insertAdjacentHTML(
		"afterbegin",
		'<div style="position:fixed;inset:0;display:grid;place-items:center;color:#a89cbe;font:14px/1.8 var(--sans);z-index:99;text-align:center;padding:32px">这台设备的浏览器不支持 WebGL2，<br>星系渲染无法启动。</div>',
	);
	throw new Error("no webgl2");
}

const hasFloatExt = !!gl.getExtension("EXT_color_buffer_float");

function compile(type, src) {
	const s = gl.createShader(type);
	gl.shaderSource(s, src);
	gl.compileShader(s);
	if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
		throw new Error(gl.getShaderInfoLog(s) || "shader compile error");
	}
	return s;
}

function program(vs, fs) {
	const p = gl.createProgram();
	gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
	gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
	gl.linkProgram(p);
	if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
		throw new Error(gl.getProgramInfoLog(p) || "program link error");
	}
	return p;
}

const progNebula = program(VS_QUAD, FS_NEBULA);
const progStars = program(VS_STARS, FS_STARS);
const progDust = program(VS_STARS, FS_DUST);
const progMeteor = program(VS_METEOR, FS_METEOR);
const progBlur = program(VS_QUAD, FS_BLUR);
const progComp = program(VS_QUAD, FS_COMPOSITE);

function uniforms(p, names) {
	const o = {};
	for (const n of names) o[n] = gl.getUniformLocation(p, n);
	return o;
}

const uNeb = uniforms(progNebula, [
	"uCamRight", "uCamUp", "uCamFwd", "uTanHalfFov", "uAspect",
	"uTime", "uDaylight", "uTintA", "uTintB", "uWarp",
]);
const uStars = uniforms(progStars, [
	"uViewProj", "uModel", "uCam", "uPointScale", "uTime", "uFade", "uTwinkle",
	"uRange", "uDaylight", "uDiffSpin", "uCursorWorld", "uCursorForce", "uCharge",
	"uWaveOrigin", "uWaveRadius", "uWaveStrength", "uWarp", "uIsStarfield",
]);
const uDust = uniforms(progDust, [
	"uViewProj", "uModel", "uCam", "uPointScale", "uTime", "uFade", "uTwinkle",
	"uRange", "uDiffSpin", "uCursorWorld", "uCursorForce", "uCharge",
	"uWaveOrigin", "uWaveRadius", "uWaveStrength", "uWarp", "uIsStarfield",
]);
const uMeteor = uniforms(progMeteor, ["uViewProj", "uDaylight"]);
const uBlur = uniforms(progBlur, ["uTex", "uDir", "uThreshold"]);
const uComp = uniforms(progComp, [
	"uScene", "uBloomA", "uBloomB", "uBloomStrength", "uResolution",
	"uDaylight", "uWarp", "uWaveStrength", "uTime",
]);

// 全屏三角形 VAO
const quadVAO = gl.createVertexArray();
gl.bindVertexArray(quadVAO);
const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

/* ============================================================
   粒子与流星缓冲上传
   ============================================================ */

function uploadParticles(g) {
	const vao = gl.createVertexArray();
	gl.bindVertexArray(vao);
	const vbo = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
	gl.bufferData(gl.ARRAY_BUFFER, g.data, gl.STATIC_DRAW);
	const st = g.stride * 4;
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
	gl.enableVertexAttribArray(1);
	gl.vertexAttribPointer(1, 1, gl.FLOAT, false, st, 12);
	gl.enableVertexAttribArray(2);
	gl.vertexAttribPointer(2, 3, gl.FLOAT, false, st, 16);
	gl.enableVertexAttribArray(3);
	gl.vertexAttribPointer(3, 4, gl.FLOAT, false, st, 28);
	gl.bindVertexArray(null);
	return { vao, count: g.count };
}

const galaxies = SCENES.map((s, i) => {
	const light = makeGalaxy({
		count: COUNT,
		arms: s.arms,
		tightness: s.tightness,
		radius: s.radius,
		thickness: s.thickness,
		palette: s.palette,
		seed: 1337 + i * 977,
		bulge: 0.16,
	});
	const dust = makeDust({
		count: DUST,
		arms: s.arms,
		tightness: s.tightness,
		radius: s.radius,
		thickness: s.thickness * 0.8,
		palette: s.palette,
		seed: 555 + i * 311,
	});
	return {
		light: uploadParticles(light),
		dust: uploadParticles(dust),
		rot: i * 1.7,
	};
});

const stars = uploadParticles(makeStarfield(isMobile ? 2800 : 6200, 11));

// 流星动态 VBO
const meteors = new MeteorSystem(isMobile ? 4 : 7);
const meteorVAO = gl.createVertexArray();
gl.bindVertexArray(meteorVAO);
const meteorVBO = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, meteorVBO);
gl.bufferData(gl.ARRAY_BUFFER, meteors.data.byteLength, gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
gl.enableVertexAttribArray(1);
gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 12);
gl.enableVertexAttribArray(2);
gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
gl.bindVertexArray(null);

/* ============================================================
   3D -> 2D 文章星标信标初始化
   ============================================================ */

function initBeacons() {
	const dataEl = document.getElementById("cosmos-data");
	const hostEl = document.getElementById("beacons");
	if (!dataEl || !hostEl) return [];

	let parsed = { categories: {} };
	try {
		parsed = JSON.parse(dataEl.textContent || "{}");
	} catch (_) {
		return [];
	}

	const list = [];
	SCENES.forEach((s, sceneIdx) => {
		if (!s.cat || !parsed.categories || !parsed.categories[s.cat]) return;
		const posts = parsed.categories[s.cat].slice(0, 4);
		posts.forEach((post, k) => {
			const rad = s.radius * (0.38 + ((k * 0.17) % 0.48));
			const armOffset = ((k % s.arms) / s.arms) * Math.PI * 2;
			const spiralAng = s.tightness * Math.log(rad / (s.radius * 0.12));
			const ang = armOffset + spiralAng + 0.12 * k;
			const normR = Math.min(1, rad / s.radius);
			const orbSpeed = 1.0 / (0.28 + Math.pow(Math.max(0.02, normR), 0.72));

			const a = document.createElement("a");
			a.className = "star-beacon";
			a.href = `/posts/${post.id}/`;
			a.dataset.cursor = "READ";
			a.innerHTML = `<span class="sb-dot"></span><span class="sb-card"><span class="sb-date">${post.date || ""}</span><span class="sb-title">${post.title}</span></span>`;
			hostEl.appendChild(a);

			list.push({
				el: a,
				sceneIdx,
				localPos: [Math.cos(ang) * rad, Math.sin(ang) * rad, (k % 2 === 0 ? 1 : -1) * 0.04],
				orbSpeed,
			});
		});
	});
	return list;
}

const beacons = initBeacons();

/* ============================================================
   多尺度帧缓冲金字塔 (全分辨率 + 1/2 + 1/4 Bloom) + RGBA8 自动兜底
   ============================================================ */

let W = 1, H = 1, DPR = 1;
let fboScene, texScene;
let fboHalfA, texHalfA, fboHalfB, texHalfB;
let fboQuarterA, texQuarterA, fboQuarterB, texQuarterB;
let useFloatFBO = hasFloatExt;

function createTarget(w, h, tryFloat) {
	const tex = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, tex);
	if (tryFloat) {
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
	} else {
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
	}
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	const fbo = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

	const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

	if (status !== gl.FRAMEBUFFER_COMPLETE && tryFloat) {
		gl.deleteFramebuffer(fbo);
		gl.deleteTexture(tex);
		useFloatFBO = false;
		return createTarget(w, h, false);
	}

	return { fbo, tex };
}

function resize() {
	DPR = Math.min(devicePixelRatio || 1, isMobile ? 1.5 : 2);
	W = Math.max(4, Math.floor(innerWidth * DPR));
	H = Math.max(4, Math.floor(innerHeight * DPR));
	canvas.width = W;
	canvas.height = H;

	[fboScene, fboHalfA, fboHalfB, fboQuarterA, fboQuarterB].forEach((f) => f && gl.deleteFramebuffer(f));
	[texScene, texHalfA, texHalfB, texQuarterA, texQuarterB].forEach((t) => t && gl.deleteTexture(t));

	const s = createTarget(W, H, useFloatFBO);
	fboScene = s.fbo; texScene = s.tex;

	const hw = Math.max(1, W >> 1), hh = Math.max(1, H >> 1);
	const ha = createTarget(hw, hh, useFloatFBO);
	fboHalfA = ha.fbo; texHalfA = ha.tex;
	const hb = createTarget(hw, hh, useFloatFBO);
	fboHalfB = hb.fbo; texHalfB = hb.tex;

	const qw = Math.max(1, W >> 2), qh = Math.max(1, H >> 2);
	const qa = createTarget(qw, qh, useFloatFBO);
	fboQuarterA = qa.fbo; texQuarterA = qa.tex;
	const qb = createTarget(qw, qh, useFloatFBO);
	fboQuarterB = qb.fbo; texQuarterB = qb.tex;
}

addEventListener("resize", resize, { passive: true });
resize();

/* ============================================================
   滚动、章节轨道与交互状态
   ============================================================ */

const stops = stopEls;
const railBtns = [...document.querySelectorAll(".rail button")];
const railFill = document.getElementById("rail-fill");
const hint = document.getElementById("hint");
const bar = document.getElementById("progress");

let progress = 0;
let prevProgress = 0;
let scrollVel = 0;
let camEase = { eye: [0.3, 0.25, 5.2], target: [-0.34, 0.04, 0], fov: 48 };
let pointerNdc = { x: 0, y: 0 };
let pointerActive = false;
let pointerEase = { x: 0, y: 0 };

// 三维轨道拖拽、引力漩涡与超新星冲击波
let orbitYaw = 0;
let orbitPitch = 0;
let orbitYawTarget = 0;
let orbitPitchTarget = 0;

let cursorWorld = [0, 0, 0];
let cursorForce = 0;
let cursorForceTarget = 0;
let charge = 0;
let isHolding = false;
let holdStart = 0;
let downPt = null;
let dragging = false;

let wave = {
	origin: [0, 0, 0],
	radius: 0,
	strength: 0,
	speed: 3.4,
};

let intro = reducedMotion ? 1 : 0;
let daylightMix = document.documentElement.dataset.theme === "light" ? 1 : 0;

function camAt(i) {
	const clamped = Math.max(0, Math.min(N - 1, i));
	const s = SCENES[clamped];
	const c = s.center;
	return {
		eye: [c[0] + s.cam[0], c[1] + s.cam[1], c[2] + s.cam[2]],
		target: [c[0], c[1], c[2]],
		fov: s.fov,
		tintA: s.tintA,
		tintB: s.tintB,
	};
}

function readScroll() {
	const max = document.documentElement.scrollHeight - innerHeight;
	progress = max > 0 ? clamp01(scrollY / max) * (N - 1) : 0;

	const idx = Math.round(progress);
	railBtns.forEach((b, i) => b.classList.toggle("on", i === idx));
	const pct = N > 1 ? (progress / (N - 1)) * 100 : 0;
	if (bar) bar.style.width = `${pct}%`;
	if (railFill) railFill.style.height = `${pct}%`;

	stops.forEach((s, i) => {
		const d = Math.abs(progress - i);
		s.classList.toggle("is-in", d < 0.45);
	});

	if (hint) hint.classList.toggle("gone", scrollY > innerHeight * 0.35);
}

addEventListener("scroll", readScroll, { passive: true });
readScroll();

function gotoStop(i) {
	const idx = Math.max(0, Math.min(N - 1, i));
	const target = stops[idx];
	if (target) {
		target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
		cosmosAudio.playClick();
	}
}

railBtns.forEach((b) => {
	b.addEventListener("click", () => gotoStop(Number(b.dataset.goto)));
});

/* ============================================================
   三维引力光标射线求交与超新星冲击波
   ============================================================ */

let VIEWPROJ = M4.perspective(0.8, 1, 0.05, 300);
let INV_VIEWPROJ = null;

function intersectActivePlane(ndcX, ndcY) {
	if (!INV_VIEWPROJ) return null;
	const p0 = M4.transformVec4(INV_VIEWPROJ, ndcX, ndcY, -1, 1);
	const p1 = M4.transformVec4(INV_VIEWPROJ, ndcX, ndcY, 1, 1);
	if (Math.abs(p0[3]) < 1e-6 || Math.abs(p1[3]) < 1e-6) return null;

	const near = [p0[0] / p0[3], p0[1] / p0[3], p0[2] / p0[3]];
	const far = [p1[0] / p1[3], p1[1] / p1[3], p1[2] / p1[3]];
	const dx = far[0] - near[0], dy = far[1] - near[1], dz = far[2] - near[2];
	const dl = Math.hypot(dx, dy, dz) || 1;
	const rd = [dx / dl, dy / dl, dz / dl];

	const idx = Math.round(progress);
	const s = SCENES[idx];
	const c = s.center;
	const tilt = s.tilt;
	// 平面法线 = Rx(tilt) * (0, 0, 1)
	const n = [0, -Math.sin(tilt), Math.cos(tilt)];
	const denom = rd[0] * n[0] + rd[1] * n[1] + rd[2] * n[2];
	if (Math.abs(denom) < 1e-4) return null;

	const t = ((c[0] - near[0]) * n[0] + (c[1] - near[1]) * n[1] + (c[2] - near[2]) * n[2]) / denom;
	if (t <= 0 || t > 40) return null;
	return [near[0] + rd[0] * t, near[1] + rd[1] * t, near[2] + rd[2] * t];
}

function launchShockwave(origin, chargeAmt = 0, normY = 0.5) {
	const idx = Math.round(progress);
	const pt = origin || SCENES[idx].center;
	wave.origin = [pt[0], pt[1], pt[2]];
	wave.radius = 0.02;
	wave.strength = 0.85 + chargeAmt * 0.9;
	wave.speed = 3.2 + chargeAmt * 1.4;
	cosmosAudio.playShockwave(normY, chargeAmt);
}

function isInteractiveTarget(el) {
	if (!el || !el.closest) return false;
	return !!el.closest("a, button, input, select, textarea, .info, .topbar, .rail, .hud, .star-beacon, #cmd-palette");
}

addEventListener(
	"pointermove",
	(e) => {
		pointerNdc.x = (e.clientX / innerWidth) * 2 - 1;
		pointerNdc.y = 1 - (e.clientY / innerHeight) * 2;
		pointerActive = true;

		if (downPt) {
			const dist = Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y);
			if (!dragging && dist >= 6) {
				dragging = true;
				isHolding = false;
				charge = 0;
				document.body.classList.add("is-orbiting");
			}
			if (dragging) {
				const dx = e.clientX - downPt.lastX;
				const dy = e.clientY - downPt.lastY;
				orbitYawTarget = Math.max(-0.85, Math.min(0.85, orbitYawTarget - dx * 0.0042));
				orbitPitchTarget = Math.max(-0.55, Math.min(0.55, orbitPitchTarget + dy * 0.0036));
				downPt.lastX = e.clientX;
				downPt.lastY = e.clientY;
			}
		}
	},
	{ passive: true },
);

addEventListener(
	"pointerdown",
	(e) => {
		if (e.button !== 0 || isInteractiveTarget(e.target)) return;
		downPt = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY };
		dragging = false;
		isHolding = true;
		holdStart = performance.now();
	},
	{ passive: true },
);

addEventListener(
	"pointerup",
	(e) => {
		if (!downPt) return;
		const normY = e.clientY / Math.max(1, innerHeight);
		if (!dragging) {
			const hit = intersectActivePlane(pointerNdc.x, pointerNdc.y);
			launchShockwave(hit, charge, normY);
		}
		downPt = null;
		dragging = false;
		isHolding = false;
		charge = 0;
		document.body.classList.remove("is-orbiting");
	},
	{ passive: true },
);

addEventListener(
	"pointercancel",
	() => {
		downPt = null;
		dragging = false;
		isHolding = false;
		charge = 0;
		document.body.classList.remove("is-orbiting");
	},
	{ passive: true },
);

addEventListener("dblclick", (e) => {
	if (isInteractiveTarget(e.target)) return;
	orbitYawTarget = 0;
	orbitPitchTarget = 0;
	cosmosAudio.playClick();
});

/* ============================================================
   键盘与主题事件协同
   ============================================================ */

function toggleCinema() {
	document.body.classList.toggle("cinema-mode");
	cosmosAudio.playClick();
}

const cinemaBtn = document.getElementById("cinema-toggle");
if (cinemaBtn) {
	cinemaBtn.addEventListener("click", toggleCinema);
}

addEventListener("cosmos:theme", (e) => {
	const light = e.detail?.theme === "light";
	daylightMix = light ? 1 : 0;
	cosmosAudio.setTheme(light ? "light" : "dark");
	// 同步立刻渲染一帧，让 View Transitions API 截获完整的新主题星图
	render(acc);
});

addEventListener("keydown", (e) => {
	const pal = document.getElementById("cmd-palette");
	if (pal && pal.classList.contains("is-open")) return;
	if (e.metaKey || e.ctrlKey || e.altKey) return;
	const tag = document.activeElement?.tagName;
	if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

	const idx = Math.round(progress);
	if (e.key === "ArrowDown" || e.key === "j") {
		e.preventDefault();
		gotoStop(idx + 1);
	} else if (e.key === "ArrowUp" || e.key === "k") {
		e.preventDefault();
		gotoStop(idx - 1);
	} else if (e.code === "Space") {
		e.preventDefault();
		launchShockwave(SCENES[idx].center, 0.35, 0.5);
	} else if (e.key === "e" || e.key === "h" || e.key === "E" || e.key === "H") {
		toggleCinema();
	} else if (e.key === "m" || e.key === "M") {
		cosmosAudio.toggle();
	} else if (e.key === "t" || e.key === "T") {
		window.__cosmosTheme?.toggle();
	}
});

window.__cosmosEngine = {
	shockwave: () => launchShockwave(SCENES[Math.round(progress)].center, 0.5, 0.5),
	resetOrbit: () => {
		orbitYawTarget = 0;
		orbitPitchTarget = 0;
	},
	toggleCinema,
	gotoStop,
};

/* ============================================================
   月亮周期与天文台 HUD 遥测更新
   ============================================================ */

function updateMoonHUD() {
	const SYN = 29.530588853;
	const ref = Date.UTC(2000, 0, 6, 18, 14);
	const p = ((((Date.now() - ref) / 864e5) % SYN) + SYN) % SYN;
	const frac = p / SYN; // 0 = 新月, 0.5 = 满月
	const idx = Math.floor(frac * 8 + 0.5) % 8;
	const zh = ["新月", "蛾眉月", "上弦月", "盈凸月", "满月", "亏凸月", "下弦月", "残月"];

	const phaseEl = document.getElementById("phase");
	if (phaseEl) phaseEl.textContent = `今晚 · ${zh[idx]}`;

	const hudPhaseEl = document.getElementById("hud-phase");
	if (hudPhaseEl) hudPhaseEl.textContent = zh[idx];

	const litPath = document.getElementById("moon-lit");
	if (litPath) {
		// 精确 SVG 月相几何阴影路径（中心 12,12，半径 9）
		const r = 9;
		const cx = 12, cy = 12;
		const waxing = frac <= 0.5;
		const k = Math.cos(frac * Math.PI * 2); // +1 新月, 0 上下弦, -1 满月
		const rx = Math.max(0.01, Math.abs(k) * r);
		const sweepOuter = waxing ? 1 : 0;
		const sweepInner = k > 0 ? (waxing ? 0 : 1) : (waxing ? 1 : 0);
		litPath.setAttribute(
			"d",
			`M ${cx} ${cy - r} A ${r} ${r} 0 0 ${sweepOuter} ${cx} ${cy + r} A ${rx} ${r} 0 0 ${sweepInner} ${cx} ${cy - r} Z`,
		);
	}
}
updateMoonHUD();

const hudSector = document.getElementById("hud-sector");
const hudRa = document.getElementById("hud-ra");
const hudDec = document.getElementById("hud-dec");
const hudDist = document.getElementById("hud-dist");
const hudStars = document.getElementById("hud-stars");
if (hudStars) hudStars.textContent = `${((COUNT * N + (isMobile ? 2800 : 6200)) / 1000).toFixed(1)}K`;

let lastHudAt = 0;
function updateTelemetry(nowMs, eye) {
	if (nowMs - lastHudAt < 75) return;
	lastHudAt = nowMs;

	const idx = Math.round(progress);
	if (hudSector) hudSector.textContent = SCENES[idx]?.label || "ORIGIN";

	const totalDist = (12.4 + Math.abs(eye[2]) * 18.2).toFixed(1);
	if (hudDist) hudDist.textContent = `${totalDist} MLY`;

	const raH = Math.floor(((eye[0] * 1.8 + 14.5) % 24 + 24) % 24);
	const raM = Math.floor((((eye[0] * 18 + progress * 17) % 60) + 60) % 60);
	if (hudRa) hudRa.textContent = `${String(raH).padStart(2, "0")}h ${String(raM).padStart(2, "0")}m`;

	const decVal = Math.max(-89, Math.min(89, eye[1] * 24 + 28 - progress * 4.5));
	const decSign = decVal >= 0 ? "+" : "−";
	if (hudDec) hudDec.textContent = `${decSign}${Math.abs(decVal).toFixed(1)}°`;
}

/* ============================================================
   渲染循环
   ============================================================ */

function bindPoints(prog, u, mesh, model, cam, pointScale, time, fade, twinkle, range, diffSpin, isStarfield, day = 0) {
	gl.useProgram(prog);
	gl.uniformMatrix4fv(u.uViewProj, false, VIEWPROJ);
	gl.uniformMatrix4fv(u.uModel, false, model);
	gl.uniform3fv(u.uCam, cam);
	gl.uniform1f(u.uPointScale, pointScale);
	gl.uniform1f(u.uTime, time);
	gl.uniform1f(u.uFade, fade);
	gl.uniform1f(u.uTwinkle, twinkle);
	gl.uniform2f(u.uRange, range[0], range[1]);
	gl.uniform1f(u.uDiffSpin, diffSpin);
	gl.uniform3fv(u.uCursorWorld, cursorWorld);
	gl.uniform1f(u.uCursorForce, cursorForce);
	gl.uniform1f(u.uCharge, charge);
	gl.uniform3fv(u.uWaveOrigin, wave.origin);
	gl.uniform1f(u.uWaveRadius, wave.radius);
	gl.uniform1f(u.uWaveStrength, wave.strength);
	gl.uniform1f(u.uWarp, Math.min(1.5, scrollVel * 1.4));
	gl.uniform1f(u.uIsStarfield, isStarfield ? 1.0 : 0.0);
	if (u.uDaylight) gl.uniform1f(u.uDaylight, day);

	gl.bindVertexArray(mesh.vao);
	gl.drawArrays(gl.POINTS, 0, mesh.count);
}

function projectBeacons(time, cinemaMode) {
	if (!beacons.length) return;
	const narrow = innerWidth <= 720;
	for (const b of beacons) {
		if (narrow || cinemaMode) {
			b.el.style.opacity = "0";
			b.el.style.pointerEvents = "none";
			continue;
		}
		const s = SCENES[b.sceneIdx];
		const g = galaxies[b.sceneIdx];
		const dist = Math.hypot(
			s.center[0] - camEase.eye[0],
			s.center[1] - camEase.eye[1],
			s.center[2] - camEase.eye[2],
		);
		const proxFade = clamp01(1 - Math.abs(progress - b.sceneIdx) * 1.4) * clamp01((dist - 0.8) / 1.1);
		if (proxFade <= 0.04) {
			b.el.style.opacity = "0";
			b.el.style.pointerEvents = "none";
			continue;
		}

		// 与着色器一致的差动公转角度
		const ang = time * s.diffSpin * b.orbSpeed;
		const ca = Math.cos(ang), sa = Math.sin(ang);
		const lx = b.localPos[0] * ca - b.localPos[1] * sa;
		const ly = b.localPos[0] * sa + b.localPos[1] * ca;
		const lz = b.localPos[2];

		const model = M4.model(...s.center, g.rot, 1, s.tilt);
		const world = M4.transformVec4(model, lx, ly, lz, 1);
		const clip = M4.transformVec4(VIEWPROJ, world[0], world[1], world[2], 1);

		if (clip[3] <= 0.15) {
			b.el.style.opacity = "0";
			b.el.style.pointerEvents = "none";
			continue;
		}
		const ndcX = clip[0] / clip[3];
		const ndcY = clip[1] / clip[3];
		if (Math.abs(ndcX) > 0.92 || Math.abs(ndcY) > 0.86) {
			b.el.style.opacity = "0";
			b.el.style.pointerEvents = "none";
			continue;
		}

		const sx = (ndcX * 0.5 + 0.5) * innerWidth;
		const sy = (0.5 - ndcY * 0.5) * innerHeight;
		b.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
		b.el.style.opacity = proxFade.toFixed(3);
		b.el.style.pointerEvents = proxFade > 0.35 ? "auto" : "none";
	}
}

function render(time, dt = 0.016) {
	// ---- Catmull-Rom 样条相机轨迹 ----
	const i0 = Math.floor(progress);
	const i1 = Math.min(N - 1, i0 + 1);
	const im1 = Math.max(0, i0 - 1);
	const i2 = Math.min(N - 1, i1 + 1);
	const localT = progress - i0;

	const c0 = camAt(im1);
	const c1 = camAt(i0);
	const c2 = camAt(i1);
	const c3 = camAt(i2);

	let eye = N > 1 ? catmullRom3(c0.eye, c1.eye, c2.eye, c3.eye, localT) : c1.eye.slice();
	let target = N > 1 ? catmullRom3(c0.target, c1.target, c2.target, c3.target, localT) : c1.target.slice();
	let baseFov = lerp(c1.fov, c2.fov, localT);

	// 左侧留白给文字（纯净探索模式除外）
	const cinema = document.body.classList.contains("cinema-mode");
	if (!cinema) {
		const shift = innerWidth > 720 ? [-0.34, 0.04, 0] : [0, -0.42, 0];
		target = [target[0] + shift[0], target[1] + shift[1], target[2] + shift[2]];
	}

	// 开场跃迁推进
	const introEase = 1 - Math.pow(1 - intro, 3);
	eye[2] += (1 - introEase) * 2.6;
	baseFov += (1 - introEase) * 14 + Math.min(8, scrollVel * 6.5);

	// 轨道拖拽 + 微量视差
	const ox = eye[0] - target[0];
	const oy = eye[1] - target[1];
	const oz = eye[2] - target[2];
	const distCam = Math.hypot(ox, oy, oz) || 3;
	const baseYaw = Math.atan2(ox, oz);
	const basePitch = Math.asin(Math.max(-0.98, Math.min(0.98, oy / distCam)));

	const yaw = baseYaw + orbitYaw + pointerEase.x * 0.05;
	const pitch = Math.max(-1.1, Math.min(1.1, basePitch + orbitPitch - pointerEase.y * 0.035));

	eye[0] = target[0] + Math.sin(yaw) * Math.cos(pitch) * distCam;
	eye[1] = target[1] + Math.sin(pitch) * distCam;
	eye[2] = target[2] + Math.cos(yaw) * Math.cos(pitch) * distCam;

	if (!reducedMotion) {
		eye[0] += Math.sin(time * 0.09) * 0.045;
		eye[1] += Math.cos(time * 0.075) * 0.035;
	}

	camEase.eye = lerp3(camEase.eye, eye, 0.14);
	camEase.target = lerp3(camEase.target, target, 0.14);
	camEase.fov = lerp(camEase.fov, baseFov, 0.14);

	const fovRad = camEase.fov * (Math.PI / 180);
	const aspect = W / H;

	// 计算相机基底向量（供 3D 星云天空盒与滚动倾斜使用）
	let fx = camEase.target[0] - camEase.eye[0];
	let fy = camEase.target[1] - camEase.eye[1];
	let fz = camEase.target[2] - camEase.eye[2];
	const fl = Math.hypot(fx, fy, fz) || 1;
	fx /= fl; fy /= fl; fz /= fl;

	const bank = Math.max(-0.1, Math.min(0.1, scrollVel * 0.06 * (progress >= prevProgress ? 1 : -1)));
	const rawUp = [Math.sin(bank), Math.cos(bank), 0];

	const proj = M4.perspective(fovRad, aspect, 0.05, 300);
	const view = M4.lookAt(camEase.eye, camEase.target, rawUp);
	VIEWPROJ = M4.mul(proj, view);
	INV_VIEWPROJ = M4.invert(VIEWPROJ);

	const camRight = [view[0], view[4], view[8]];
	const camUp = [view[1], view[5], view[9]];
	const camFwd = [-view[2], -view[6], -view[10]];

	const tintA = lerp3(c1.tintA, c2.tintA, localT);
	const tintB = lerp3(c1.tintB, c2.tintB, localT);
	const warp = Math.min(1.5, scrollVel * 1.4);
	const pointScale = H * 0.008;

	// 更新光标 3D 平面交点
	if (pointerActive) {
		const hit = intersectActivePlane(pointerNdc.x, pointerNdc.y);
		if (hit) {
			cursorWorld = lerp3(cursorWorld, hit, 0.25);
			cursorForceTarget = 1.0;
		} else {
			cursorForceTarget = 0.0;
		}
	}

	// ---- Pass 1: 场景渲染到 fboScene ----
	gl.bindFramebuffer(gl.FRAMEBUFFER, fboScene);
	gl.viewport(0, 0, W, H);
	gl.disable(gl.BLEND);

	// 背景星云 / 宣纸纹理天空盒
	gl.useProgram(progNebula);
	gl.uniform3fv(uNeb.uCamRight, camRight);
	gl.uniform3fv(uNeb.uCamUp, camUp);
	gl.uniform3fv(uNeb.uCamFwd, camFwd);
	gl.uniform1f(uNeb.uTanHalfFov, Math.tan(fovRad * 0.5));
	gl.uniform1f(uNeb.uAspect, aspect);
	gl.uniform1f(uNeb.uTime, time);
	gl.uniform1f(uNeb.uDaylight, daylightMix);
	gl.uniform3fv(uNeb.uTintA, tintA);
	gl.uniform3fv(uNeb.uTintB, tintB);
	gl.uniform1f(uNeb.uWarp, warp);
	gl.bindVertexArray(quadVAO);
	gl.drawArrays(gl.TRIANGLES, 0, 3);

	const isLight = daylightMix > 0.5;
	gl.enable(gl.BLEND);
	if (isLight) gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	else gl.blendFunc(gl.ONE, gl.ONE);

	// 远景恒星壳
	bindPoints(
		progStars, uStars, stars,
		M4.model(0, 0, 0, 0, 1),
		camEase.eye, pointScale, time, 0.82, reducedMotion ? 0 : 0.4, [26, 98], 0, true, daylightMix,
	);

	// 星系由远及近渲染
	const order = galaxies
		.map((g, idx) => ({ idx, d: Math.hypot(...SCENES[idx].center.map((c, k) => c - camEase.eye[k])) }))
		.sort((p, q) => q.d - p.d);

	for (const { idx } of order) {
		const g = galaxies[idx];
		const s = SCENES[idx];
		const dist = Math.hypot(...s.center.map((c, k) => c - camEase.eye[k]));
		const fade = clamp01((dist - 0.65) / 1.1);
		if (fade <= 0.001) continue;

		const model = M4.model(...s.center, g.rot, 1, s.tilt);
		bindPoints(
			progStars, uStars, g.light,
			model, camEase.eye, pointScale, time, fade,
			reducedMotion ? 0 : 0.24, [7.5, 26], reducedMotion ? 0 : s.diffSpin, false, daylightMix,
		);
	}

	// 尘埃暗带（白昼模式下隐去）
	if (!isLight) {
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		for (const { idx } of order) {
			const g = galaxies[idx];
			const s = SCENES[idx];
			const dist = Math.hypot(...s.center.map((c, k) => c - camEase.eye[k]));
			const fade = clamp01((dist - 0.65) / 1.1);
			if (fade <= 0.001) continue;

			const model = M4.model(...s.center, g.rot, 1, s.tilt);
			bindPoints(
				progDust, uDust, g.dust,
				model, camEase.eye, pointScale, time, fade * 0.72,
				0, [9, 30], reducedMotion ? 0 : s.diffSpin, false, daylightMix,
			);
		}
	}

	// 动态流星尾迹
	if (!reducedMotion) {
		const mVerts = meteors.update(dt, camEase.eye, camFwd);
		if (mVerts > 0) {
			gl.blendFunc(isLight ? gl.SRC_ALPHA : gl.ONE, isLight ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
			gl.useProgram(progMeteor);
			gl.uniformMatrix4fv(uMeteor.uViewProj, false, VIEWPROJ);
			gl.uniform1f(uMeteor.uDaylight, daylightMix);
			gl.bindVertexArray(meteorVAO);
			gl.bindBuffer(gl.ARRAY_BUFFER, meteorVBO);
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, meteors.data.subarray(0, mVerts * meteors.stride));
			gl.drawArrays(gl.TRIANGLES, 0, mVerts);
		}
	}

	gl.disable(gl.BLEND);
	gl.bindVertexArray(null);

	// ---- Pass 2: 夜间多尺度 Bloom 金字塔（白昼跳过以节省算力）----
	if (!isLight) {
		const hw = Math.max(1, W >> 1), hh = Math.max(1, H >> 1);
		const qw = Math.max(1, W >> 2), qh = Math.max(1, H >> 2);

		gl.useProgram(progBlur);
		gl.uniform1i(uBlur.uTex, 0);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindVertexArray(quadVAO);

		// Half-res 提取 + 水平模糊
		gl.bindFramebuffer(gl.FRAMEBUFFER, fboHalfA);
		gl.viewport(0, 0, hw, hh);
		gl.bindTexture(gl.TEXTURE_2D, texScene);
		gl.uniform2f(uBlur.uDir, 2.2 / W, 0);
		gl.uniform1f(uBlur.uThreshold, 0.65);
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		// Half-res 垂直模糊
		gl.bindFramebuffer(gl.FRAMEBUFFER, fboHalfB);
		gl.bindTexture(gl.TEXTURE_2D, texHalfA);
		gl.uniform2f(uBlur.uDir, 0, 2.2 / H);
		gl.uniform1f(uBlur.uThreshold, 0);
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		// Quarter-res 宽光晕水平模糊
		gl.bindFramebuffer(gl.FRAMEBUFFER, fboQuarterA);
		gl.viewport(0, 0, qw, qh);
		gl.bindTexture(gl.TEXTURE_2D, texHalfB);
		gl.uniform2f(uBlur.uDir, 4.6 / W, 0);
		gl.uniform1f(uBlur.uThreshold, 0);
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		// Quarter-res 垂直模糊
		gl.bindFramebuffer(gl.FRAMEBUFFER, fboQuarterB);
		gl.bindTexture(gl.TEXTURE_2D, texQuarterA);
		gl.uniform2f(uBlur.uDir, 0, 4.6 / H);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	// ---- Pass 3: 终极合成（Bloom + 色散 + ACES + 暗角颗粒）----
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.viewport(0, 0, W, H);
	gl.useProgram(progComp);
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, texScene);
	gl.uniform1i(uComp.uScene, 0);
	gl.activeTexture(gl.TEXTURE1);
	gl.bindTexture(gl.TEXTURE_2D, texHalfB);
	gl.uniform1i(uComp.uBloomA, 1);
	gl.activeTexture(gl.TEXTURE2);
	gl.bindTexture(gl.TEXTURE_2D, texQuarterB);
	gl.uniform1i(uComp.uBloomB, 2);
	gl.uniform1f(uComp.uBloomStrength, 1.15);
	gl.uniform2f(uComp.uResolution, W, H);
	gl.uniform1f(uComp.uDaylight, daylightMix);
	gl.uniform1f(uComp.uWarp, warp);
	gl.uniform1f(uComp.uWaveStrength, wave.strength);
	gl.uniform1f(uComp.uTime, time);

	gl.bindVertexArray(quadVAO);
	gl.drawArrays(gl.TRIANGLES, 0, 3);
	gl.bindVertexArray(null);
	gl.activeTexture(gl.TEXTURE0);

	// 投影 3D 文章星标信标
	projectBeacons(time, cinema);
}

/* ============================================================
   主帧循环
   ============================================================ */

let last = performance.now();
let acc = 0;

function frame(now) {
	requestAnimationFrame(frame);
	const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
	last = now;
	acc += dt;

	if (intro < 1) intro = Math.min(1, intro + dt / 1.35);

	// 计算滚动速度驱动动态跃迁感
	const instVel = Math.abs(progress - prevProgress) / dt;
	prevProgress = progress;
	scrollVel = lerp(scrollVel, Math.min(2.2, instVel * 0.45), 0.14);
	cosmosAudio.setWarp(scrollVel);

	// 阻尼插值
	pointerEase.x = lerp(pointerEase.x, pointerNdc.x, 0.08);
	pointerEase.y = lerp(pointerEase.y, pointerNdc.y, 0.08);
	orbitYaw = lerp(orbitYaw, orbitYawTarget, 0.1);
	orbitPitch = lerp(orbitPitch, orbitPitchTarget, 0.1);
	cursorForce = lerp(cursorForce, cursorForceTarget, 0.1);

	// 按住蓄力坍缩
	if (isHolding && !dragging && now - holdStart > 280) {
		charge = Math.min(1, (now - holdStart - 280) / 1100);
	}

	// 冲击波传播与衰减
	if (wave.strength > 0.001) {
		wave.radius += dt * wave.speed;
		wave.strength *= Math.exp(-dt * 1.45);
		if (wave.strength < 0.003) wave.strength = 0;
	}

	// 星系刚体微旋
	if (!reducedMotion) {
		galaxies.forEach((g, i) => {
			g.rot += SCENES[i].spin * dt;
		});
	}

	render(acc, dt);
	updateTelemetry(now, camEase.eye);
}

requestAnimationFrame(frame);
