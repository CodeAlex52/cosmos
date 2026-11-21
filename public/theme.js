(function () {
	var KEY = "cosmos-theme";
	var root = document.documentElement;
	var saved = localStorage.getItem(KEY);
	if (saved) root.dataset.theme = saved;

	var SUN =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"/></svg>';
	var MOON =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.7 8.7 0 1 0 11.1 11.1z"/></svg>';

	function makeButton() {
		var b = document.createElement("button");
		b.className = "theme-btn";
		b.type = "button";
		b.setAttribute("aria-label", "切换明暗");
		b.innerHTML =
			'<span class="tb-sun">' + SUN + "</span><span class=\"tb-moon\">" + MOON + "</span>";
		b.addEventListener("click", function () {
			var next = root.dataset.theme === "light" ? "dark" : "light";
			root.dataset.theme = next;
			localStorage.setItem(KEY, next);
		});
		return b;
	}

	function mount() {
		var nav = document.querySelector(".topbar .nav");
		if (!nav) return;
		nav.appendChild(makeButton());
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", mount);
	} else {
		mount();
	}
})();
