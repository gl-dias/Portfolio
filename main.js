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
