import { makeGalaxy, makeDust, makeStarfield } from "./galaxy.js";
import { VS, FS, FS_DUST, VS_QUAD, FS_BLUR, FS_COMPOSITE } from "./shaders.js";

/* ============================================================
   矩阵
   ============================================================ */

const M4 = {
	perspective(fovy, aspect, near, far) {
		const f = 1 / Math.tan(fovy / 2);
		const nf = 1 / (near - far);
		return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
	},
	lookAt(eye, center, up) {
		let zx = eye[0] - center[0],
			zy = eye[1] - center[1],
			zz = eye[2] - center[2];
		let l = Math.hypot(zx, zy, zz) || 1;
		zx /= l;
		zy /= l;
		zz /= l;
		let xx = up[1] * zz - up[2] * zy,
			xy = up[2] * zx - up[0] * zz,
			xz = up[0] * zy - up[1] * zx;
		l = Math.hypot(xx, xy, xz) || 1;
		xx /= l;
		xy /= l;
		xz /= l;
		const yx = zy * xz - zz * xy,
			yy = zz * xx - zx * xz,
			yz = zx * xy - zy * xx;
		return new Float32Array([
			xx,
			yx,
			zx,
			0,
			xy,
			yy,
			zy,
			0,
			xz,
			yz,
			zz,
			0,
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
					a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
			}
		}
		return o;
	},
	model(cx, cy, cz, rot, scale, tiltX = 0) {
		// 绕 Z 旋转 + 绕 X 倾斜 + 平移 + 缩放（列主序）
		const c = Math.cos(rot),
			s = Math.sin(rot);
		const ct = Math.cos(tiltX),
			st = Math.sin(tiltX);
		const k = scale;
		// R = Rz * Rx
		const m = new Float32Array(16);
		m[0] = c * k;
		m[1] = s * k;
		m[2] = 0;
		m[3] = 0;
		m[4] = -s * ct * k;
		m[5] = c * ct * k;
		m[6] = st * k;
		m[7] = 0;
		m[8] = s * st * k;
		m[9] = -c * st * k;
		m[10] = ct * k;
		m[11] = 0;
		m[12] = cx;
		m[13] = cy;
		m[14] = cz;
		m[15] = 1;
		return m;
	},
};

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => t * t * (3 - 2 * t);

/* ============================================================
   场景定义
   ============================================================ */

const isMobile = Math.min(innerWidth, innerHeight) < 760 || (navigator.hardwareConcurrency || 8) <= 4;
const COUNT = isMobile ? 26000 : 62000;
const DUST = isMobile ? 7000 : 16000;

// 场景外观预设，按顺序循环使用
const PRESET = [
	{ arms: 2, tightness: 2.55, palette: "spiral", tilt: 0.12, spin: 0.035, radius: 0.86, cam: [0.26, 0.2, 3.35], fov: 44 },
	{ arms: 3, tightness: 3.1, palette: "blue", tilt: 0.44, spin: -0.028, radius: 1.0, cam: [0.56, 0.28, 3.02], fov: 42 },
	{ arms: 2, tightness: 2.2, palette: "magenta", tilt: 0.26, spin: 0.045, radius: 0.68, cam: [0.38, 0.32, 2.72], fov: 41 },
	{ arms: 4, tightness: 3.6, palette: "elliptical", tilt: 0.6, spin: 0.02, radius: 0.92, cam: [0.46, 0.26, 3.2], fov: 43 },
];

// 每幕在三维空间中的位置：沿一条向后延伸的弧线，左右交替
function scenePos(i) {
	if (i === 0) return [0, 0, 0];
	const side = i % 2 === 1 ? 1 : -1;
	return [side * (5.1 + (i - 1) * 0.45), side * -1.85 - (i - 1) * 0.12, -11 - (i - 1) * 11];
}

const stopEls = [...document.querySelectorAll(".stop")];
const N = Math.max(1, stopEls.length);

const SCENES = Array.from({ length: N }, (_, i) => {
	const p = PRESET[i % PRESET.length];
	return { ...p, center: scenePos(i), thickness: i === 0 ? 0.055 : 0.05 };
});

/* ============================================================
   WebGL 初始化
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

const hasFloat = !!gl.getExtension("EXT_color_buffer_float");

function compile(type, src) {
	const s = gl.createShader(type);
	gl.shaderSource(s, src);
	gl.compileShader(s);
	if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
		throw new Error(gl.getShaderInfoLog(s) || "shader error");
	}
	return s;
}

function program(vs, fs) {
	const p = gl.createProgram();
	gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
	gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
	gl.linkProgram(p);
	if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
		throw new Error(gl.getProgramInfoLog(p) || "link error");
	}
	return p;
}

const progStars = program(VS, FS);
const progDust = program(VS, FS_DUST);
const progBlur = program(VS_QUAD, FS_BLUR);
const progComp = program(VS_QUAD, FS_COMPOSITE);

function uniforms(p, names) {
	const o = {};
	for (const n of names) o[n] = gl.getUniformLocation(p, n);
	return o;
}

const uStars = uniforms(progStars, ["uViewProj", "uModel", "uCam", "uPointScale", "uTime", "uFade", "uTwinkle", "uRange"]);
const uDust = uniforms(progDust, ["uViewProj", "uModel", "uCam", "uPointScale", "uTime", "uFade", "uTwinkle"]);
const uBlur = uniforms(progBlur, ["uTex", "uDir", "uThreshold"]);
const uComp = uniforms(progComp, ["uScene", "uBloom", "uBloomStrength", "uResolution"]);

// 全屏四边形
const quadVAO = gl.createVertexArray();
gl.bindVertexArray(quadVAO);
const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

/* ============================================================
   粒子上传
   ============================================================ */

function upload(g) {
	const vao = gl.createVertexArray();
	gl.bindVertexArray(vao);
	const vbo = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
	gl.bufferData(gl.ARRAY_BUFFER, g.data, gl.STATIC_DRAW);
	const st = g.stride * 4;
	// aPos
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
	// aSize
	gl.enableVertexAttribArray(1);
	gl.vertexAttribPointer(1, 1, gl.FLOAT, false, st, 12);
	// aColor
	gl.enableVertexAttribArray(2);
	gl.vertexAttribPointer(2, 3, gl.FLOAT, false, st, 16);
	// aSeed
	gl.enableVertexAttribArray(3);
	gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 28);
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
		light: upload(light),
		dust: upload(dust),
		model: M4.model(...s.center, 0, 1, s.tilt),
		rot: i * 1.7,
	};
});

const stars = upload(makeStarfield(isMobile ? 2600 : 6000, 11));

// 程序对象上挂 VAO 布局：属性 location 固定
gl.bindAttribLocation(progStars, 0, "aPos");
gl.bindAttribLocation(progStars, 1, "aSize");
gl.bindAttribLocation(progStars, 2, "aColor");
gl.bindAttribLocation(progStars, 3, "aSeed");
gl.bindAttribLocation(progDust, 0, "aPos");
gl.bindAttribLocation(progDust, 1, "aSize");
gl.bindAttribLocation(progDust, 2, "aColor");
gl.bindAttribLocation(progDust, 3, "aSeed");

/* ============================================================
   帧缓冲
   ============================================================ */

let W = 1,
	H = 1,
	DPR = 1;
let fboScene, texScene, fboA, texA, fboB, texB;

function createTarget(w, h) {
	const tex = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, tex);
	if (hasFloat) {
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
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	return { fbo, tex };
}

function resize() {
	DPR = Math.min(devicePixelRatio || 1, isMobile ? 1.5 : 2);
	W = Math.max(1, Math.floor(innerWidth * DPR));
	H = Math.max(1, Math.floor(innerHeight * DPR));
	canvas.width = W;
	canvas.height = H;

	[fboScene, fboA, fboB].forEach((f) => f && gl.deleteFramebuffer(f));
	[texScene, texA, texB].forEach((t) => t && gl.deleteTexture(t));

	const s = createTarget(W, H);
	fboScene = s.fbo;
	texScene = s.tex;

	const hw = Math.max(1, W >> 1),
		hh = Math.max(1, H >> 1);
	const a = createTarget(hw, hh);
	fboA = a.fbo;
	texA = a.tex;
	const b = createTarget(hw, hh);
	fboB = b.fbo;
	texB = b.tex;
}

addEventListener("resize", resize, { passive: true });
resize();

/* ============================================================
   滚动
   ============================================================ */

const stops = stopEls;
const railBtns = [...document.querySelectorAll(".rail button")];
const hint = document.getElementById("hint");
const bar = document.getElementById("progress");

let progress = 0;
let camEase = { eye: [0, 0, 3], target: [0, 0, 0] };
let pointer = { x: 0, y: 0 };
let pointerEase = { x: 0, y: 0 };

function camAt(i) {
	const s = SCENES[i];
	const c = s.center;
	return {
		eye: [c[0] + s.cam[0], c[1] + s.cam[1], c[2] + s.cam[2]],
		target: [c[0], c[1], c[2]],
		fov: s.fov,
	};
}

function readScroll() {
	const max = document.documentElement.scrollHeight - innerHeight;
	progress = max > 0 ? clamp01(scrollY / max) * (N - 1) : 0;

	const idx = Math.round(progress);
	railBtns.forEach((b, i) => b.classList.toggle("on", i === idx));
	bar.style.width = `${(progress / (N - 1)) * 100}%`;

	stops.forEach((s, i) => {
		const d = Math.abs(progress - i);
		s.classList.toggle("is-in", d < 0.45);
	});

	hint.classList.toggle("gone", scrollY > innerHeight * 0.4);
}

addEventListener("scroll", readScroll, { passive: true });
readScroll();

railBtns.forEach((b) => {
	b.addEventListener("click", () => {
		const i = Number(b.dataset.goto);
		const target = stops[i];
		if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
	});
});

addEventListener(
	"pointermove",
	(e) => {
		pointer.x = (e.clientX / innerWidth - 0.5) * 2;
		pointer.y = (e.clientY / innerHeight - 0.5) * 2;
	},
	{ passive: true },
);

/* ============================================================
   渲染
   ============================================================ */

function bindPoints(prog, u, mesh, model, cam, pointScale, time, fade, twinkle, range) {
	gl.useProgram(prog);
	gl.uniformMatrix4fv(u.uViewProj, false, VIEWPROJ);
	gl.uniformMatrix4fv(u.uModel, false, model);
	gl.uniform3fv(u.uCam, cam);
	gl.uniform1f(u.uPointScale, pointScale);
	gl.uniform1f(u.uTime, time);
	gl.uniform1f(u.uFade, fade);
	gl.uniform1f(u.uTwinkle, twinkle);
	gl.uniform2f(u.uRange, range[0], range[1]);
	gl.bindVertexArray(mesh.vao);
	gl.drawArrays(gl.POINTS, 0, mesh.count);
}

let VIEWPROJ = M4.perspective(0.8, 1, 0.05, 200);

function render(time) {
	// ---- 相机 ----
	const i0 = Math.floor(progress);
	const i1 = Math.min(N - 1, i0 + 1);
	const t = smooth(progress - i0);
	const a = camAt(i0);
	const b = camAt(i1);

	const parallaxX = pointerEase.x * 0.16;
	const parallaxY = pointerEase.y * 0.1;
	let eye = lerp3(a.eye, b.eye, t);
	eye = [eye[0] + parallaxX, eye[1] - parallaxY, eye[2]];
	let target = lerp3(a.target, b.target, t);
	// 左侧留给文字：视点向左下偏移，星系就落在画面右上方
	const shift = innerWidth > 720 ? [-0.34, 0.04, 0] : [0, -0.42, 0];
	target = [target[0] + shift[0], target[1] + shift[1], target[2] + shift[2]];
	const fov = lerp(a.fov, b.fov, t) * (Math.PI / 180);

	// 相机缓慢漂移，避免完全静止
	eye[0] += Math.sin(time * 0.09) * 0.05;
	eye[1] += Math.cos(time * 0.075) * 0.04;

	camEase.eye = lerp3(camEase.eye, eye, 0.12);
	camEase.target = lerp3(camEase.target, target, 0.12);

	const aspect = W / H;
	const proj = M4.perspective(fov, aspect, 0.05, 300);
	const view = M4.lookAt(camEase.eye, camEase.target, [0, 1, 0]);
	VIEWPROJ = M4.mul(proj, view);

	const pointScale = H * 0.008;

	// ---- 场景 pass ----
	gl.bindFramebuffer(gl.FRAMEBUFFER, fboScene);
	gl.viewport(0, 0, W, H);
	gl.clearColor(0.012, 0.008, 0.028, 1);
	gl.clear(gl.COLOR_BUFFER_BIT);

	gl.enable(gl.BLEND);
	gl.blendFunc(gl.ONE, gl.ONE); // 加法混合

	// 远景星空
	bindPoints(progStars, uStars, stars, M4.model(0, 0, 0, 0, 1), camEase.eye, pointScale, time, 0.8, 0.4, [26, 95]);

	// 星系：从远到近画
	const order = galaxies
		.map((g, idx) => ({ idx, d: Math.hypot(...SCENES[idx].center.map((c, k) => c - camEase.eye[k])) }))
		.sort((p, q) => q.d - p.d);

	for (const { idx } of order) {
		const g = galaxies[idx];
		const s = SCENES[idx];
		const dist = Math.hypot(...s.center.map((c, k) => c - camEase.eye[k]));
		// 太近的星系淡出，避免糊脸
		const fade = clamp01((dist - 0.65) / 1.1);
		if (fade <= 0.001) continue;

		const model = M4.model(...s.center, g.rot, 1, s.tilt);
		bindPoints(progStars, uStars, g.light, model, camEase.eye, pointScale, time, fade, 0.22, [7.5, 26]);
	}

	// 尘埃：正常混合，压暗旋臂之间
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	for (const { idx } of order) {
		const g = galaxies[idx];
		const s = SCENES[idx];
		const dist = Math.hypot(...s.center.map((c, k) => c - camEase.eye[k]));
		const fade = clamp01((dist - 0.65) / 1.1);
		if (fade <= 0.001) continue;
		const model = M4.model(...s.center, g.rot, 1, s.tilt);
		bindPoints(progDust, uDust, g.dust, model, camEase.eye, pointScale, time, fade * 0.7, 0.0, [9, 30]);
	}

	gl.disable(gl.BLEND);
	gl.bindVertexArray(null);

	// ---- bloom ----
	gl.useProgram(progBlur);
	gl.uniform1i(uBlur.uTex, 0);
	gl.activeTexture(gl.TEXTURE0);

	gl.bindFramebuffer(gl.FRAMEBUFFER, fboA);
	gl.viewport(0, 0, W >> 1, H >> 1);
	gl.bindTexture(gl.TEXTURE_2D, texScene);
	gl.uniform2f(uBlur.uDir, 2.2 / W, 0);
	gl.uniform1f(uBlur.uThreshold, 0.7);
	gl.bindVertexArray(quadVAO);
	gl.drawArrays(gl.TRIANGLES, 0, 3);

	gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
	gl.bindTexture(gl.TEXTURE_2D, texA);
	gl.uniform2f(uBlur.uDir, 0, 2.2 / H);
	gl.uniform1f(uBlur.uThreshold, 0);
	gl.drawArrays(gl.TRIANGLES, 0, 3);

	// 第二遍模糊，光晕更宽
	gl.bindFramebuffer(gl.FRAMEBUFFER, fboA);
	gl.bindTexture(gl.TEXTURE_2D, texB);
	gl.uniform2f(uBlur.uDir, 4.4 / W, 0);
	gl.drawArrays(gl.TRIANGLES, 0, 3);

	gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
	gl.bindTexture(gl.TEXTURE_2D, texA);
	gl.uniform2f(uBlur.uDir, 0, 4.4 / H);
	gl.drawArrays(gl.TRIANGLES, 0, 3);

	// ---- 合成 ----
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.viewport(0, 0, W, H);
	gl.useProgram(progComp);
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, texScene);
	gl.uniform1i(uComp.uScene, 0);
	gl.activeTexture(gl.TEXTURE1);
	gl.bindTexture(gl.TEXTURE_2D, texB);
	gl.uniform1i(uComp.uBloom, 1);
	gl.uniform1f(uComp.uBloomStrength, 1.15);
	gl.uniform2f(uComp.uResolution, W, H);
	gl.drawArrays(gl.TRIANGLES, 0, 3);
	gl.bindVertexArray(null);
	gl.activeTexture(gl.TEXTURE0);
}

/* ============================================================
   主循环
   ============================================================ */

let last = performance.now();
let acc = 0;

function frame(now) {
	requestAnimationFrame(frame);
	const dt = Math.min(0.06, (now - last) / 1000);
	last = now;
	acc += dt;

	pointerEase.x = lerp(pointerEase.x, pointer.x, 0.06);
	pointerEase.y = lerp(pointerEase.y, pointer.y, 0.06);

	// 星系自转
	galaxies.forEach((g, i) => {
		g.rot += SCENES[i].spin * dt;
	});

	render(acc);
}

requestAnimationFrame(frame);

/* ============================================================
   小彩蛋：月相 + 问候
   ============================================================ */

(function moon() {
	const SYN = 29.530588853;
	const ref = Date.UTC(2000, 0, 6, 18, 14);
	const p = ((((Date.now() - ref) / 864e5) % SYN) + SYN) % SYN;
	const idx = Math.floor((p / SYN) * 8 + 0.5) % 8;
	const zh = ["新月", "蛾眉月", "上弦月", "盈凸月", "满月", "亏凸月", "下弦月", "残月"];
	const el = document.getElementById("phase");
	if (el) el.textContent = `今晚 · ${zh[idx]}`;
})();
