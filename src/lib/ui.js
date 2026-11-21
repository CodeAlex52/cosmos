import { cosmosAudio } from "./audio.js";

const reducedMotion =
	typeof window !== "undefined" &&
	window.matchMedia &&
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const finePointer =
	typeof window !== "undefined" &&
	window.matchMedia &&
	window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/* ============================================================
   1. 音频开关与全局主题同步
   ============================================================ */

function syncAudioButtons(enabled) {
	document.querySelectorAll("[data-audio-toggle]").forEach((btn) => {
		btn.classList.toggle("is-on", enabled);
		btn.setAttribute("aria-pressed", enabled ? "true" : "false");
		btn.title = enabled ? "静音宇宙声景 (M)" : "开启宇宙声景 (M)";
	});
}

document.querySelectorAll("[data-audio-toggle]").forEach((btn) => {
	btn.addEventListener("click", () => {
		cosmosAudio.toggle();
	});
});

window.addEventListener("cosmos:audio", (e) => {
	syncAudioButtons(!!e.detail?.enabled);
});

window.addEventListener("cosmos:theme", (e) => {
	cosmosAudio.setTheme(e.detail?.theme === "light" ? "light" : "dark");
});

syncAudioButtons(cosmosAudio.isEnabled());

/* ============================================================
   2. 天文十字准星光标与磁吸交互
   ============================================================ */

function initCursor() {
	const el = document.getElementById("celestial-cursor");
	if (!el || !finePointer || reducedMotion) return;

	const dot = el.querySelector(".cc-dot");
	const ring = el.querySelector(".cc-ring");
	const label = el.querySelector(".cc-label");

	let tx = -100, ty = -100;
	let rx = -100, ry = -100;
	let visible = false;
	let activeMag = null;
	let hoverEl = null;

	function resolveLabel(node) {
		if (!node) return "";
		if (node.dataset.cursor) return node.dataset.cursor;
		if (node.matches("img, [data-lightbox-src]")) return "VIEW";
		const href = node.getAttribute("href") || "";
		if (href.startsWith("/posts/")) return "READ";
		if (href.startsWith("/categories/") || href === "/archive/") return "EXPLORE";
		if (href.startsWith("http")) return "WARP";
		if (node.matches("[data-goto]")) return "JUMP";
		return "";
	}

	window.addEventListener(
		"pointermove",
		(e) => {
			tx = e.clientX;
			ty = e.clientY;
			if (!visible) {
				rx = tx;
				ry = ty;
				visible = true;
				document.documentElement.classList.add("has-celestial-cursor");
				el.classList.add("is-visible");
			}

			const target = e.target?.closest?.(
				"a, button, [data-cursor], [data-spotlight], .star-beacon, [data-lightbox-src]",
			);
			if (target !== hoverEl) {
				if (hoverEl) cosmosAudio.playHover();
				hoverEl = target;
				if (target) {
					el.classList.add("is-hover");
					const txt = resolveLabel(target);
					if (label) label.textContent = txt;
					el.classList.toggle("has-label", !!txt);
				} else {
					el.classList.remove("is-hover", "has-label");
					if (label) label.textContent = "";
				}
			}

			// 磁吸按钮微偏移
			const mag = e.target?.closest?.("[data-magnetic]");
			if (activeMag && activeMag !== mag) {
				activeMag.style.transform = "";
			}
			activeMag = mag || null;
			if (activeMag) {
				const r = activeMag.getBoundingClientRect();
				const dx = ((e.clientX - (r.left + r.width / 2)) / Math.max(1, r.width)) * 9;
				const dy = ((e.clientY - (r.top + r.height / 2)) / Math.max(1, r.height)) * 9;
				activeMag.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
			}
		},
		{ passive: true },
	);

	window.addEventListener("pointerdown", () => el.classList.add("is-down"), { passive: true });
	window.addEventListener("pointerup", () => el.classList.remove("is-down"), { passive: true });
	document.addEventListener("mouseleave", () => {
		el.classList.remove("is-visible");
		visible = false;
	});

	function tick() {
		requestAnimationFrame(tick);
		if (!visible) return;
		rx += (tx - rx) * 0.2;
		ry += (ty - ry) * 0.2;
		if (dot) dot.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
		if (ring) ring.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0)`;
	}
	requestAnimationFrame(tick);
}

initCursor();

/* ============================================================
   3. 聚光玻璃卡片与三维微倾 ([data-spotlight])
   ============================================================ */

function initSpotlights() {
	if (!finePointer || reducedMotion) return;
	document.querySelectorAll("[data-spotlight]").forEach((card) => {
		if (card.__spotWired) return;
		card.__spotWired = true;
		card.addEventListener("pointermove", (e) => {
			const r = card.getBoundingClientRect();
			const x = e.clientX - r.left;
			const y = e.clientY - r.top;
			card.style.setProperty("--mx", `${x.toFixed(1)}px`);
			card.style.setProperty("--my", `${y.toFixed(1)}px`);
			if (card.dataset.tilt !== "off") {
				const rx = ((y / Math.max(1, r.height)) - 0.5) * -5.2;
				const ry = ((x / Math.max(1, r.width)) - 0.5) * 5.2;
				card.style.transform = `perspective(760px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-1px)`;
			}
		});
		card.addEventListener("pointerleave", () => {
			card.style.transform = "";
		});
	});
}

initSpotlights();
window.__cosmosRefreshUI = () => initSpotlights();

/* ============================================================
   4. 天文字符解码动效 ([data-decode])
   ============================================================ */

function decodeText(el) {
	if (reducedMotion || el.dataset.decoded) return;
	const raw = el.textContent || "";
	if (!raw.trim()) return;
	el.dataset.decoded = "1";
	const glyphs = "0123456789ABCDEF·°′";
	const start = performance.now();
	const dur = 360;

	function step(now) {
		const p = Math.min(1, (now - start) / dur);
		const lock = Math.floor(p * raw.length);
		let out = "";
		for (let i = 0; i < raw.length; i++) {
			const ch = raw[i];
			if (i < lock || /\s/.test(ch) || ch.charCodeAt(0) > 127) {
				out += ch;
			} else {
				out += glyphs[Math.floor(Math.random() * glyphs.length)];
			}
		}
		el.textContent = out;
		if (p < 1) requestAnimationFrame(step);
		else el.textContent = raw;
	}
	requestAnimationFrame(step);
}

const decodeEls = [...document.querySelectorAll("[data-decode]")];
if (decodeEls.length && "IntersectionObserver" in window) {
	const io = new IntersectionObserver(
		(entries) => {
			entries.forEach((ent) => {
				if (ent.isIntersecting) {
					decodeText(ent.target);
					io.unobserve(ent.target);
				}
			});
		},
		{ threshold: 0.25 },
	);
	decodeEls.forEach((el) => io.observe(el));
}

/* ============================================================
   5. 宇宙命令面板 (⌘K / Ctrl+K / /)
   ============================================================ */

function initCommandPalette() {
	const root = document.getElementById("cmd-palette");
	if (!root) return;

	const input = root.querySelector(".cmd-input");
	const list = root.querySelector(".cmd-list");
	const indexEl = document.getElementById("site-index");

	let siteData = { posts: [], categories: [] };
	if (indexEl) {
		try {
			siteData = JSON.parse(indexEl.textContent || "{}");
		} catch (_) {}
	}

	const items = [];
	// 文章条目
	(siteData.posts || []).forEach((p) => {
		items.push({
			group: "星辰文字",
			title: p.title,
			meta: [p.category, p.date].filter(Boolean).join(" · "),
			hint: "READ",
			search: `${p.title} ${p.category || ""} ${p.description || ""} ${(p.tags || []).join(" ")}`.toLowerCase(),
			run: () => {
				window.location.href = `/posts/${p.id}/`;
			},
		});
	});

	// 分类星区
	(siteData.categories || []).forEach((c) => {
		items.push({
			group: "星区分类",
			title: c.name,
			meta: `${c.count} 篇文字`,
			hint: "SECTOR",
			search: `${c.name} 分类 星区`.toLowerCase(),
			run: () => {
				window.location.href = `/categories/${encodeURIComponent(c.name)}/`;
			},
		});
	});

	// 导航页面
	items.push(
		{
			group: "星图导航",
			title: "回到星图首页",
			meta: "WebGL2 沉浸星系漫游",
			hint: "HOME",
			search: "首页 星图 home index cosmos",
			run: () => {
				window.location.href = "/";
			},
		},
		{
			group: "星图导航",
			title: "全部归档时间线",
			meta: "按年份索引全部文字",
			hint: "ARCHIVE",
			search: "归档 archive 全部文章",
			run: () => {
				window.location.href = "/archive/";
			},
		},
		{
			group: "星图导航",
			title: "16+8 记录看板",
			meta: "board.664501775.workers.dev",
			hint: "BOARD",
			search: "记录 看板 board 轻断食 打卡",
			run: () => {
				window.open("https://board.664501775.workers.dev", "_blank", "noopener");
			},
		},
		{
			group: "星图导航",
			title: "RSS 订阅源",
			meta: "/rss.xml",
			hint: "RSS",
			search: "rss feed 订阅 xml",
			run: () => {
				window.location.href = "/rss.xml";
			},
		},
	);

	// 即时宇宙指令
	items.push(
		{
			group: "天文台指令",
			title: "切换 夜间深空 / 白昼宣纸",
			meta: "日蚀视效过渡 (快捷键 T)",
			hint: "THEME",
			search: "主题 明暗 昼夜 宣纸 深空 theme light dark",
			run: () => {
				window.__cosmosTheme?.toggle();
			},
		},
		{
			group: "天文台指令",
			title: "开启 / 静音 宇宙声景",
			meta: "程序化星际合成器 (快捷键 M)",
			hint: "AUDIO",
			search: "声音 音乐 声景 静音 audio sound mute",
			run: () => {
				cosmosAudio.toggle();
			},
		},
	);

	if (document.getElementById("gl")) {
		items.push(
			{
				group: "天文台指令",
				title: "释放超新星冲击波",
				meta: "触发三维恒星涟漪与星钟泛音 (Space)",
				hint: "PULSE",
				search: "冲击波 超新星 特效 shockwave pulse space",
				run: () => {
					window.__cosmosEngine?.shockwave();
				},
			},
			{
				group: "天文台指令",
				title: "切换 纯净探索模式",
				meta: "隐藏文字界面的全屏星系视图 (E / H)",
				hint: "CINEMA",
				search: "纯净 全屏 电影 模式 cinema hide ui",
				run: () => {
					window.__cosmosEngine?.toggleCinema();
				},
			},
			{
				group: "天文台指令",
				title: "重置三维观测视角",
				meta: "回正星系俯仰与偏航角 (双击空白处)",
				hint: "RESET",
				search: "重置 视角 reset orbit camera",
				run: () => {
					window.__cosmosEngine?.resetOrbit();
				},
			},
		);
	}

	let filtered = items.slice();
	let activeIdx = 0;

	function renderList() {
		if (!list) return;
		if (!filtered.length) {
			list.innerHTML = `<div class="cmd-empty">这片星域暂无匹配的坐标</div>`;
			return;
		}
		let lastGroup = "";
		list.innerHTML = filtered
			.map((it, i) => {
				const hdr = it.group !== lastGroup ? `<div class="cmd-group">${it.group}</div>` : "";
				lastGroup = it.group;
				return `${hdr}<button type="button" class="cmd-item ${i === activeIdx ? "is-active" : ""}" data-cmd-idx="${i}">
					<span class="cmd-main">
						<span class="cmd-title">${it.title}</span>
						<span class="cmd-meta">${it.meta}</span>
					</span>
					<span class="cmd-hint">${it.hint}</span>
				</button>`;
			})
			.join("");
	}

	function filter(q) {
		const s = q.trim().toLowerCase();
		filtered = s ? items.filter((it) => it.search.includes(s)) : items.slice();
		activeIdx = 0;
		renderList();
	}

	function open() {
		root.classList.add("is-open");
		root.setAttribute("aria-hidden", "false");
		if (input) {
			input.value = "";
			filter("");
			setTimeout(() => input.focus(), 10);
		}
		cosmosAudio.playClick();
	}

	function close() {
		root.classList.remove("is-open");
		root.setAttribute("aria-hidden", "true");
	}

	function runItem(idx) {
		const it = filtered[idx];
		if (!it) return;
		close();
		cosmosAudio.playClick();
		it.run();
	}

	document.querySelectorAll("[data-cmd-open]").forEach((btn) => {
		btn.addEventListener("click", open);
	});

	root.addEventListener("click", (e) => {
		if (e.target === root || e.target.closest("[data-cmd-close]")) {
			close();
			return;
		}
		const btn = e.target.closest("[data-cmd-idx]");
		if (btn) runItem(Number(btn.dataset.cmdIdx));
	});

	if (input) {
		input.addEventListener("input", () => filter(input.value));
		input.addEventListener("keydown", (e) => {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				if (filtered.length) {
					activeIdx = (activeIdx + 1) % filtered.length;
					renderList();
					list?.querySelector(".cmd-item.is-active")?.scrollIntoView({ block: "nearest" });
				}
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				if (filtered.length) {
					activeIdx = (activeIdx - 1 + filtered.length) % filtered.length;
					renderList();
					list?.querySelector(".cmd-item.is-active")?.scrollIntoView({ block: "nearest" });
				}
			} else if (e.key === "Enter") {
				e.preventDefault();
				runItem(activeIdx);
			} else if (e.key === "Escape") {
				e.preventDefault();
				close();
			}
		});
	}

	window.addEventListener("keydown", (e) => {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
			e.preventDefault();
			if (root.classList.contains("is-open")) close();
			else open();
			return;
		}
		if (e.key === "/" && !root.classList.contains("is-open")) {
			const tag = document.activeElement?.tagName;
			if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
				e.preventDefault();
				open();
			}
		} else if (e.key === "Escape" && root.classList.contains("is-open")) {
			close();
		}
	});
}

initCommandPalette();
