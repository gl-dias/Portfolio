/* gl-dias.dev: único JS da home. O conteúdo já vem no HTML; isso aqui é só enfeite. */

(function () {
  var root = document.documentElement;
  var items = document.querySelectorAll(".reveal");

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !("IntersectionObserver" in window)) {
    root.classList.remove("js");
    window.__revealReady = true;
    return;
  }

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    },
    { rootMargin: "0px 0px -10% 0px" }
  );

  items.forEach(function (el) { io.observe(el); });
  window.__revealReady = true;
})();
