/**
 * sky.js — 内页与 404 交互式高分屏 Canvas2D 宇宙画布
 * mode="constellation"：深度视差星空 + 光标交互金色星座连线 + 偶发流星 + 宣纸墨点模式
 * mode="blackhole"：404 交互式引力透镜吸积盘黑洞（白昼转为禅意圆相墨圈）
 */

const canvas = document.getElementById("sky-canvas");

if (canvas) {
	const ctx = canvas.getContext("2d");
	const mode = canvas.dataset.mode || "constellation";
	const reducedMotion =
		window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	let W = 1, H = 1, DPR = 1;
	let isLight = document.documentElement.dataset.theme === "light";
	const pointer = { x: -9999, y: -9999, active: false };
	const pointerEase = { x: 0, y: 0 };

	function resize() {
		DPR = Math.min(window.devicePixelRatio || 1, 2);
		W = Math.max(1, window.innerWidth);
		H = Math.max(1, window.innerHeight);
		canvas.width = Math.floor(W * DPR);
		canvas.height = Math.floor(H * DPR);
		ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
	}
	window.addEventListener("resize", resize, { passive: true });
	resize();

	window.addEventListener("cosmos:theme", (e) => {
		isLight = e.detail?.theme === "light";
	});

	window.addEventListener(
		"pointermove",
		(e) => {
			pointer.x = e.clientX;
			pointer.y = e.clientY;
			pointer.active = true;
		},
		{ passive: true },
	);

	window.addEventListener(
		"pointerleave",
		() => {
			pointer.active = false;
		},
		{ passive: true },
	);

	// 粒子初始化
	const stars = Array.from({ length: mode === "blackhole" ? 130 : 105 }, () => ({
		x: Math.random(),
		y: Math.random(),
		depth: 0.2 + Math.random() * 0.85,
		r: 0.6 + Math.pow(Math.random(), 2.2) * 2.0,
		phase: Math.random() * Math.PI * 2,
		speed: 0.8 + Math.random() * 1.4,
		warm: Math.random(),
	}));

	const disk =
		mode === "blackhole"
			? Array.from({ length: 280 }, (_, i) => {
					const t = Math.pow(Math.random(), 0.72);
					return {
						r: 68 + t * 210,
						ang: (i / 280) * Math.PI * 2 + Math.random() * 0.6,
						spd: (0.42 + Math.random() * 0.25) / (0.35 + t * 1.4),
						size: 0.8 + Math.random() * 2.1,
						alpha: 0.22 + (1 - t) * 0.65,
						tilt: 0.34 + (Math.random() - 0.5) * 0.08,
						warm: Math.random(),
					};
				})
			: [];

	let shoot = null;
	let shootCooldown = 2.5;

	function renderConstellation(now, dt) {
		ctx.clearRect(0, 0, W, H);
		const scroll = window.scrollY || 0;

		const pts = [];
		for (let i = 0; i < stars.length; i++) {
			const s = stars[i];
			const x = s.x * W;
			const rawY = s.y * H - scroll * s.depth * 0.14;
			const y = ((rawY % H) + H) % H;
			const tw = reducedMotion ? 0.75 : 0.45 + 0.55 * Math.sin(now * 0.0014 * s.speed + s.phase);
			const alpha = (0.18 + s.depth * 0.52) * tw;

			if (isLight) {
				ctx.fillStyle = `rgba(38, 46, 58, ${(alpha * 0.48).toFixed(3)})`;
			} else {
				const r = Math.round(215 + s.warm * 40);
				const g = Math.round(210 + s.warm * 22);
				const b = Math.round(255 - s.warm * 45);
				ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
			}
			ctx.beginPath();
			ctx.arc(x, y, s.r, 0, Math.PI * 2);
			ctx.fill();

			if (s.depth > 0.42) pts.push({ x, y });
		}

		// 光标交互星座连线
		if (pointer.active && !reducedMotion) {
			const maxD = 150;
			const near = [];
			for (let i = 0; i < pts.length; i++) {
				const dx = pts[i].x - pointer.x;
				const dy = pts[i].y - pointer.y;
				const d = Math.hypot(dx, dy);
				if (d < maxD) near.push({ x: pts[i].x, y: pts[i].y, d });
			}

			ctx.lineWidth = 0.85;
			for (let i = 0; i < near.length; i++) {
				const a = (1 - near[i].d / maxD) * (isLight ? 0.22 : 0.34);
				ctx.strokeStyle = isLight ? `rgba(150, 104, 44, ${a.toFixed(3)})` : `rgba(220, 177, 102, ${a.toFixed(3)})`;
				ctx.beginPath();
				ctx.moveTo(pointer.x, pointer.y);
				ctx.lineTo(near[i].x, near[i].y);
				ctx.stroke();

				for (let j = i + 1; j < near.length; j++) {
					const sd = Math.hypot(near[i].x - near[j].x, near[i].y - near[j].y);
					if (sd < 105) {
						const sa = (1 - sd / 105) * (isLight ? 0.14 : 0.22);
						ctx.strokeStyle = isLight ? `rgba(150, 104, 44, ${sa.toFixed(3)})` : `rgba(220, 177, 102, ${sa.toFixed(3)})`;
						ctx.beginPath();
						ctx.moveTo(near[i].x, near[i].y);
						ctx.lineTo(near[j].x, near[j].y);
						ctx.stroke();
					}
				}
			}
		}

		// 偶发流星
		if (!reducedMotion) {
			if (!shoot) {
				shootCooldown -= dt;
				if (shootCooldown <= 0) {
					shoot = {
						x: Math.random() * W * 0.8 + W * 0.1,
						y: Math.random() * H * 0.35,
						vx: -460 - Math.random() * 260,
						vy: 220 + Math.random() * 140,
						life: 0,
						max: 0.65 + Math.random() * 0.35,
					};
					shootCooldown = 4 + Math.random() * 6;
				}
			} else {
				shoot.life += dt;
				shoot.x += shoot.vx * dt;
				shoot.y += shoot.vy * dt;
				const p = shoot.life / shoot.max;
				if (p >= 1) {
					shoot = null;
				} else {
					const a = Math.sin(p * Math.PI) * (isLight ? 0.42 : 0.72);
					const tx = shoot.x - shoot.vx * 0.12;
					const ty = shoot.y - shoot.vy * 0.12;
					const grad = ctx.createLinearGradient(shoot.x, shoot.y, tx, ty);
					if (isLight) {
						grad.addColorStop(0, `rgba(150, 104, 44, ${a.toFixed(3)})`);
						grad.addColorStop(1, "rgba(150, 104, 44, 0)");
					} else {
						grad.addColorStop(0, `rgba(242, 210, 148, ${a.toFixed(3)})`);
						grad.addColorStop(1, "rgba(138, 184, 242, 0)");
					}
					ctx.strokeStyle = grad;
					ctx.lineWidth = 1.4;
					ctx.beginPath();
					ctx.moveTo(shoot.x, shoot.y);
					ctx.lineTo(tx, ty);
					ctx.stroke();
				}
			}
		}
	}

	function renderBlackhole(now, dt) {
		ctx.clearRect(0, 0, W, H);
		const targetX = pointer.active ? (pointer.x - W / 2) * 0.08 : 0;
		const targetY = pointer.active ? (pointer.y - H / 2) * 0.08 : 0;
		pointerEase.x += (targetX - pointerEase.x) * 0.06;
		pointerEase.y += (targetY - pointerEase.y) * 0.06;

		const cx = W * 0.5 + pointerEase.x;
		const cy = H * 0.34 + pointerEase.y;
		const horizonR = Math.min(W, H) < 560 ? 48 : 64;

		// 引力透镜弯曲的背景星点
		for (let i = 0; i < stars.length; i++) {
			const s = stars[i];
			let sx = s.x * W;
			let sy = s.y * H;
			const dx = sx - cx;
			const dy = sy - cy;
			const d = Math.hypot(dx, dy) || 1;
			if (d < horizonR * 4.5) {
				const push = (horizonR * 1.45) / Math.max(horizonR * 0.65, d);
				sx += (dx / d) * push * 18;
				sy += (dy / d) * push * 18;
			}
			const tw = reducedMotion ? 0.8 : 0.5 + 0.5 * Math.sin(now * 0.0015 + s.phase);
			ctx.fillStyle = isLight
				? `rgba(27, 36, 48, ${(0.28 * tw).toFixed(3)})`
				: `rgba(225, 220, 245, ${(0.45 * tw).toFixed(3)})`;
			ctx.beginPath();
			ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
			ctx.fill();
		}

		// 外围吸积盘晕光
		const halo = ctx.createRadialGradient(cx, cy, horizonR * 0.85, cx, cy, horizonR * 3.8);
		if (isLight) {
			halo.addColorStop(0, "rgba(150, 104, 44, 0.22)");
			halo.addColorStop(0.45, "rgba(150, 104, 44, 0.07)");
			halo.addColorStop(1, "rgba(239, 233, 221, 0)");
		} else {
			halo.addColorStop(0, "rgba(240, 205, 138, 0.34)");
			halo.addColorStop(0.35, "rgba(220, 177, 102, 0.12)");
			halo.addColorStop(1, "rgba(5, 3, 10, 0)");
		}
		ctx.fillStyle = halo;
		ctx.beginPath();
		ctx.arc(cx, cy, horizonR * 3.8, 0, Math.PI * 2);
		ctx.fill();

		// 旋转吸积盘粒子
		const rotTilt = -0.22;
		const cosT = Math.cos(rotTilt), sinT = Math.sin(rotTilt);
		for (let i = 0; i < disk.length; i++) {
			const p = disk[i];
			if (!reducedMotion) p.ang += p.spd * dt;
			const lx = Math.cos(p.ang) * p.r;
			const ly = Math.sin(p.ang) * p.r * p.tilt;
			const px = cx + lx * cosT - ly * sinT;
			const py = cy + lx * sinT + ly * cosT;

			if (isLight) {
				ctx.fillStyle =
					p.warm > 0.72
						? `rgba(150, 104, 44, ${(p.alpha * 0.72).toFixed(3)})`
						: `rgba(27, 36, 48, ${(p.alpha * 0.55).toFixed(3)})`;
			} else {
				ctx.fillStyle =
					p.warm > 0.4
						? `rgba(242, 205, 138, ${p.alpha.toFixed(3)})`
						: `rgba(165, 198, 255, ${(p.alpha * 0.8).toFixed(3)})`;
			}
			ctx.beginPath();
			ctx.arc(px, py, p.size, 0, Math.PI * 2);
			ctx.fill();
		}

		// 事件视界黑洞核 / 白昼宣纸禅意圆相
		ctx.save();
		ctx.beginPath();
		ctx.arc(cx, cy, horizonR, 0, Math.PI * 2);
		ctx.fillStyle = isLight ? "#efe9dd" : "#05030a";
		ctx.fill();
		ctx.lineWidth = isLight ? 2.2 : 1.5;
		ctx.strokeStyle = isLight ? "rgba(150, 104, 44, 0.55)" : "rgba(242, 210, 148, 0.75)";
		ctx.stroke();
		ctx.restore();
	}

	let last = performance.now();
	function frame(now) {
		requestAnimationFrame(frame);
		const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
		last = now;
		if (mode === "blackhole") renderBlackhole(now, dt);
		else renderConstellation(now, dt);
	}
	requestAnimationFrame(frame);
}
