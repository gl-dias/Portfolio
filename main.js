/* gl-dias.dev: único JS do site. O conteúdo já vem no HTML; isso aqui é só enfeite. */

/* ---------- reveal ---------- */
(function () {
  var items = document.querySelectorAll(".reveal");
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduced || !("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("is-in"); });
  } else {
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
  }

  // só confirma depois que o reveal está montado; sem isso o <head> tira o .js e mostra tudo
  window.__revealReady = true;
})();

/* ---------- menu mobile ---------- */
(function () {
  var nav = document.querySelector(".nav");
  var toggle = document.querySelector(".nav-toggle");
  if (!nav || !toggle) return;

  function setOpen(open) {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "fechar menu" : "abrir menu");
  }

  toggle.addEventListener("click", function () {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });
  nav.querySelectorAll(".nav-links a").forEach(function (a) {
    a.addEventListener("click", function () { setOpen(false); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      setOpen(false);
      toggle.focus();
    }
  });
})();

/* ---------- copiar email ---------- */
(function () {
  var btn = document.querySelector(".copy-btn");
  var status = document.getElementById("copy-status");
  if (!btn) return;

  function done(msg) {
    btn.textContent = msg;
    if (status) status.textContent = msg === "copiado" ? "email copiado" : "";
    setTimeout(function () {
      btn.textContent = "copiar";
      if (status) status.textContent = "";
    }, 2000);
  }

  btn.addEventListener("click", function () {
    var text = btn.getAttribute("data-copy");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { done("copiado"); },
        function () { done("não rolou"); }
      );
    } else {
      done("não rolou");
    }
  });
})();

/* ---------- zoom nas miniaturas dos projetos ---------- */
(function () {
  var thumbs = document.querySelectorAll(".proj-thumb[data-zoom-src]");
  if (!thumbs.length) return;

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DURATION = reduced ? 0 : 300;
  var RADIUS = 8;
  var open = null;

  // maior retângulo na proporção da miniatura que cabe na tela com margem, sem passar de 1440px
  function target(rect) {
    var vw = document.documentElement.clientWidth;
    var vh = window.innerHeight;
    var m = vw < 640 ? 12 : 40;
    var ratio = rect.height / rect.width;
    var w = Math.min(vw - 2 * m, 1440);
    var h = w * ratio;
    if (h > vh - 2 * m) { h = vh - 2 * m; w = h / ratio; }
    return { left: (vw - w) / 2, top: (vh - h) / 2, width: w, height: h };
  }

  // a imagem grande fica parada no centro; isso encolhe ela de volta pro lugar da miniatura
  function placeOnThumb(img, rect, t) {
    var s = rect.width / t.width;
    img.style.transform = "translate(" + (rect.left - t.left) + "px," + (rect.top - t.top) + "px) scale(" + s + ")";
    img.style.borderRadius = RADIUS / s + "px";
  }

  function warm(thumb) {
    new Image().src = thumb.getAttribute("data-zoom-src");
  }

  function zoomIn(thumb) {
    if (open) return;
    var rect = thumb.getBoundingClientRect();
    var t = target(rect);

    var overlay = document.createElement("div");
    overlay.className = "zoom-overlay";

    var img = document.createElement("img");
    img.className = "zoom-img";
    img.src = thumb.currentSrc || thumb.src;
    img.alt = thumb.alt;
    img.style.left = t.left + "px";
    img.style.top = t.top + "px";
    img.style.width = t.width + "px";
    img.style.height = t.height + "px";
    placeOnThumb(img, rect, t);

    document.body.appendChild(overlay);
    document.body.appendChild(img);
    thumb.style.opacity = "0";
    open = { thumb: thumb, overlay: overlay, img: img, t: t, scrollY: window.scrollY };

    // força o layout na posição da miniatura antes de animar pro centro
    void img.offsetWidth;
    overlay.classList.add("is-open");
    img.style.transform = "none";
    img.style.borderRadius = RADIUS + "px";

    // começa com a miniatura (já carregada) e troca pela de 1440px quando ela estiver pronta
    var hi = new Image();
    hi.src = thumb.getAttribute("data-zoom-src");
    var swap = function () { if (open && open.img === img) img.src = hi.src; };
    if (hi.decode) hi.decode().then(swap, function () {});
    else hi.onload = swap;

    overlay.addEventListener("click", zoomOut);
    img.addEventListener("click", zoomOut);
  }

  function zoomOut() {
    if (!open || open.closing) return;
    var o = open;
    o.closing = true;
    o.overlay.classList.remove("is-open");
    placeOnThumb(o.img, o.thumb.getBoundingClientRect(), o.t);
    setTimeout(function () {
      o.overlay.remove();
      o.img.remove();
      o.thumb.style.opacity = "";
      open = null;
    }, DURATION);
  }

  thumbs.forEach(function (thumb) {
    thumb.setAttribute("role", "button");
    thumb.setAttribute("tabindex", "0");
    thumb.setAttribute("aria-label", "ampliar imagem: " + thumb.alt);
    thumb.addEventListener("pointerenter", function () { warm(thumb); }, { once: true });
    thumb.addEventListener("click", function () { zoomIn(thumb); });
    thumb.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      if (open) zoomOut();
      else zoomIn(thumb);
    });
  });

  document.addEventListener("keydown", function (e) {
    if (open && (e.key === "Escape" || e.key === "Tab")) zoomOut();
  });
  window.addEventListener("scroll", function () {
    if (open && Math.abs(window.scrollY - open.scrollY) > 40) zoomOut();
  }, { passive: true });
  window.addEventListener("resize", zoomOut);
})();
