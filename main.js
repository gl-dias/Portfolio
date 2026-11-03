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

/* ---------- placar: plaquinhas que viram no hero e no quadro de status ---------- */
// O texto de verdade já está no HTML (é o que leitor de tela e quem não tem JS recebem);
// as plaquinhas são só desenho por cima, com aria-hidden.
(function () {
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !document.documentElement.animate) return;

  var LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  var FLIP_MS = 120;
  var STEP_MS = 75;
  var STAGGER_MS = 32;
  var HOLD_MS = 2800;

  function makeCell() {
    var el = document.createElement("span");
    el.className = "flap-cell";
    var glyphs = ["flap-top", "flap-bottom", "flap-top flap-leaf", "flap-bottom flap-leaf"].map(function (cls) {
      var half = document.createElement("span");
      half.className = "flap-half " + cls;
      var glyph = document.createElement("b");
      half.appendChild(glyph);
      el.appendChild(half);
      return glyph;
    });
    return { el: el, top: glyphs[0], bottom: glyphs[1], leafTop: glyphs[2], leafBottom: glyphs[3], ch: " " };
  }

  function build(container) {
    var total = parseInt(container.getAttribute("data-cells"), 10);
    var cells = [];
    for (var i = 0; i < total; i++) {
      var cell = makeCell();
      container.appendChild(cell.el);
      cells.push(cell);
    }
    return cells;
  }

  function flip(cell, next) {
    var prev = cell.ch;
    cell.ch = next;
    cell.top.textContent = next;      // atrás da folha de cima já está a letra nova
    cell.bottom.textContent = prev;   // a metade de baixo só muda quando a folha pousa
    cell.leafTop.textContent = prev;
    cell.leafBottom.textContent = next;
    cell.leafTop.parentNode.animate(
      [{ transform: "rotateX(0deg)" }, { transform: "rotateX(-90deg)" }],
      { duration: FLIP_MS / 2, easing: "ease-in", fill: "both" }
    );
    cell.leafBottom.parentNode.animate(
      [{ transform: "rotateX(90deg)" }, { transform: "rotateX(0deg)" }],
      { duration: FLIP_MS / 2, delay: FLIP_MS / 2, easing: "ease-out", fill: "both" }
    );
  }

  function roll(cell, target, delay) {
    if (cell.ch === target) return;
    var flips = 3 + Math.floor(Math.random() * 3);
    for (var i = 1; i <= flips; i++) {
      (function (step) {
        setTimeout(function () {
          flip(cell, step === flips ? target : LETTERS.charAt(Math.floor(Math.random() * LETTERS.length)));
        }, delay + STEP_MS * step);
      })(i);
    }
  }

  function show(cells, word, startDelay) {
    var text = word.toLocaleUpperCase("pt-BR");
    cells.forEach(function (cell, i) {
      roll(cell, text.charAt(i) || " ", startDelay + i * STAGGER_MS);
    });
  }

  /* hero: troca de palavra em loop, só enquanto ele está na tela */
  var hero = document.querySelector(".flap-hero");
  if (hero) {
    var heroCells = build(hero);
    var words = hero.getAttribute("data-words").split("|");
    var current = 0;
    var heroVisible = true;
    var timer = null;

    var next = function () {
      timer = null;
      if (!heroVisible || document.hidden) return;
      current = (current + 1) % words.length;
      show(heroCells, words[current], 0);
      schedule();
    };
    var schedule = function () {
      if (timer === null) timer = setTimeout(next, HOLD_MS + heroCells.length * STAGGER_MS);
    };

    show(heroCells, words[0], 150);
    schedule();

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        heroVisible = entries[0].isIntersecting;
        if (heroVisible) schedule();
      }).observe(hero);
    }
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) schedule();
    });
  }

  /* quadro: cada status vira uma vez, quando o quadro entra na tela */
  var board = document.querySelector(".board");
  if (board) {
    var rows = [];
    board.querySelectorAll(".flap-status").forEach(function (container) {
      rows.push({ cells: build(container), word: container.getAttribute("data-word") });
    });
    var fill = function () {
      rows.forEach(function (row, i) { show(row.cells, row.word, i * 120); });
    };
    if ("IntersectionObserver" in window) {
      var boardIo = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        boardIo.disconnect();
        fill();
      }, { rootMargin: "0px 0px -15% 0px" });
      boardIo.observe(board);
    } else {
      fill();
    }
  }
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

/* ---------- email abre no Gmail no computador ---------- */
// mailto só funciona com app de email configurado, e no computador quase todo mundo usa o Gmail no navegador:
// clicava e nada acontecia. No computador o link vira o "escrever" do Gmail já com destinatário e assunto;
// no celular fica o mailto, que abre o app de email normalmente.
(function () {
  if (!window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
    var parts = a.getAttribute("href").slice(7).split("?");
    var subject = new URLSearchParams(parts[1] || "").get("subject");
    var url = "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(parts[0]);
    if (subject) url += "&su=" + encodeURIComponent(subject);

    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
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
