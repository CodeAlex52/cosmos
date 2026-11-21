(function () {
	var KEY = "cosmos-theme";
	var root = document.documentElement;
	var DARK_META = "#05030a";
	var LIGHT_META = "#efe9dd";

	function syncMeta(theme) {
		var meta = document.querySelector('meta[name="theme-color"]');
		if (meta) meta.setAttribute("content", theme === "light" ? LIGHT_META : DARK_META);
	}

	function initialTheme() {
		try {
			var saved = localStorage.getItem(KEY);
			if (saved === "light" || saved === "dark") return saved;
		} catch (_) {}
		return root.dataset.theme === "light" ? "light" : "dark";
	}

	var init = initialTheme();
	root.dataset.theme = init;
	syncMeta(init);

	var SUN =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"/></svg>';
	var MOON =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.7 8.7 0 1 0 11.1 11.1z"/></svg>';

	function applyTheme(next) {
		root.dataset.theme = next;
		syncMeta(next);
		try {
			localStorage.setItem(KEY, next);
		} catch (_) {}
		window.dispatchEvent(new CustomEvent("cosmos:theme", { detail: { theme: next } }));
	}

	function resolveOrigin(originEvent) {
		if (originEvent && typeof originEvent.clientX === "number" && (originEvent.clientX || originEvent.clientY)) {
			return { x: originEvent.clientX, y: originEvent.clientY };
		}
		var btn = document.querySelector("[data-theme-toggle], .theme-btn");
		if (btn) {
			var r = btn.getBoundingClientRect();
			if (r.width && r.height) {
				return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
			}
		}
		return { x: window.innerWidth - 42, y: 36 };
	}

	function setTheme(next, originEvent) {
		if (next !== "light" && next !== "dark") return;
		var current = root.dataset.theme === "light" ? "light" : "dark";
		if (next === current) return;

		var reduced =
			window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

		if (!document.startViewTransition || reduced) {
			applyTheme(next);
			return;
		}

		var pt = resolveOrigin(originEvent);
		var maxR = Math.hypot(
			Math.max(pt.x, window.innerWidth - pt.x),
			Math.max(pt.y, window.innerHeight - pt.y),
		);

		var transition = document.startViewTransition(function () {
			applyTheme(next);
		});

		transition.ready
			.then(function () {
				document.documentElement.animate(
					{
						clipPath: [
							"circle(0px at " + pt.x + "px " + pt.y + "px)",
							"circle(" + maxR + "px at " + pt.x + "px " + pt.y + "px)",
						],
					},
					{
						duration: 680,
						easing: "cubic-bezier(0.22, 1, 0.36, 1)",
						pseudoElement: "::view-transition-new(root)",
					},
				);
			})
			.catch(function () {});
	}

	function toggleTheme(originEvent) {
		var next = root.dataset.theme === "light" ? "dark" : "light";
		setTheme(next, originEvent);
		return next;
	}

	window.__cosmosTheme = {
		get: function () {
			return root.dataset.theme === "light" ? "light" : "dark";
		},
		set: setTheme,
		toggle: toggleTheme,
	};

	function wireButton(btn) {
		if (!btn || btn.__themeWired) return;
		btn.__themeWired = true;
		btn.addEventListener("click", function (e) {
			toggleTheme(e);
		});
	}

	function mount() {
		syncMeta(root.dataset.theme);
		var existing = document.querySelectorAll("[data-theme-toggle], .theme-btn");
		if (existing.length > 0) {
			existing.forEach(wireButton);
			return;
		}
		var nav = document.querySelector(".topbar .nav");
		if (!nav) return;
		var b = document.createElement("button");
		b.className = "theme-btn";
		b.type = "button";
		b.setAttribute("data-theme-toggle", "");
		b.setAttribute("aria-label", "切换明暗");
		b.innerHTML =
			'<span class="tb-sun">' + SUN + '</span><span class="tb-moon">' + MOON + "</span>";
		wireButton(b);
		nav.appendChild(b);
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", mount);
	} else {
		mount();
	}
})();
