/* fios: marionete em WebGL.
   O corpo é um punhado de pontos com física (Verlet e restrições de posição). A foto são duas
   malhas, casaco atrás e corpo na frente, que acompanham esses pontos e dobram sem emenda.
   Fios e penas são desenhados num canvas 2D por cima. Sem WebGL ou com movimento reduzido
   fica a versão parada do HTML. */
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var stage = document.getElementById("stage");
  var glCanvas = document.getElementById("puppet");
  var canvas2d = document.getElementById("threads");
  var backCanvas = document.getElementById("back");
  var hint = document.getElementById("hint");
  var soundBtn = document.getElementById("sound");
  var cageBtn = document.getElementById("cage");
  var gl = glCanvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
  var ctx = canvas2d.getContext("2d");
  var backCtx = backCanvas.getContext("2d");

  // sem WebGL 2 o .js sai e o CSS volta a mostrar a versão parada
  if (!gl || !ctx) { document.documentElement.classList.remove("js"); return; }

  /* ---------- medidas, em pixels da imagem ---------- */
  var IMG_W = 823, IMG_H = 1407, FIG_CX = 411;
  var CELL = 20;         // tamanho do quadradinho da malha
  var STEP = 1 / 120;    // passo fixo da física
  var GRAVITY = 3000;

  // nome: [x, y, retorno à pose, arrasto, quanto pode se afastar da pose]
  var POINTS = {
    n:   [345, 235],  sl: [240, 270],  sr: [490, 275],  hp: [360, 740],
    hl:  [295, 755],  hr: [445, 755],  ph: [437, 150],
    cl0: [225, 180],  cr0: [510, 185],
    ht:  [350, 35, 0.10, 0.990, 42],
    kl:  [325, 1010, 0.006, 0.992, 230],  al: [335, 1250, 0.008, 0.991, 380],
    kr:  [470, 1010, 0.006, 0.992, 230],  ar: [505, 1280, 0.008, 0.991, 380],
    // o casaco tem coleira: longe demais, a própria malha dele estica
    cl1: [125, 420, 0.014, 0.992, 80],   cl2: [100, 660, 0.009, 0.992, 150],
    cl3: [165, 880, 0.006, 0.992, 200],  cl4: [235, 1050, 0.005, 0.992, 240],
    cr1: [625, 410, 0.014, 0.992, 80],   cr2: [700, 650, 0.009, 0.992, 150],
    cr3: [640, 880, 0.006, 0.992, 200],  cr4: [600, 1110, 0.005, 0.992, 240]
  };
  var TORSO = ["n", "sl", "sr", "hp", "hl", "hr", "ph", "cl0", "cr0"];

  // varetas: [a, b, encurtamento máximo] (sem o terceiro valor, o tamanho é fixo)
  var STICKS = [
    ["n", "ht"],
    ["hl", "kl"], ["kl", "al"], ["hr", "kr"], ["kr", "ar"],
    ["cl0", "cl1"], ["cl1", "cl2"], ["cl2", "cl3"], ["cl3", "cl4"],
    ["cr0", "cr1"], ["cr1", "cr2"], ["cr2", "cr3"], ["cr3", "cr4"],
    // impedem joelho e casaco de dobrarem demais
    ["hl", "al", 0.72], ["hr", "ar", 0.72],
    ["cl0", "cl2", 0.8], ["cl1", "cl3", 0.8], ["cl2", "cl4", 0.8],
    ["cr0", "cr2", 0.8], ["cr1", "cr3", 0.8], ["cr2", "cr4", 0.8]
  ];

  // fios: [ponto preso, onde o fio sai no alto em relação ao centro, folga]
  var ROPES = [
    ["cl2", -430, 1.004], ["cl0", -280, 1.000], ["kl", -240, 1.006], ["ht", -40, 1.000],
    ["ph", 70, 1.000], ["kr", 210, 1.006], ["cr0", 280, 1.000], ["cr2", 470, 1.004]
  ];

  // cabeça e tronco (com braço e celular) andam inteiros, pra não deformar rosto e terno
  var HEAD_SHAPE = [[276, 60], [300, 25], [350, 10], [400, 25], [425, 70], [425, 140], [400, 145], [398, 205], [360, 226], [325, 222], [296, 175], [268, 150], [268, 110]];
  var TORSO_SHAPE = [[272, 205], [325, 225], [395, 215], [400, 142], [472, 142], [478, 235], [540, 330], [603, 425], [600, 500], [528, 505], [530, 760], [205, 765], [195, 680], [228, 520], [215, 360], [240, 250]];

  // ossos que movem as malhas: os seis primeiros são do corpo, os outros do casaco
  var BONES = [
    { torso: true, shape: TORSO_SHAPE },
    { a: "n", b: "ht", shape: HEAD_SHAPE },
    { a: "hl", b: "kl" }, { a: "kl", b: "al" }, { a: "hr", b: "kr" }, { a: "kr", b: "ar" },
    { a: "cl0", b: "cl1" }, { a: "cl1", b: "cl2" }, { a: "cl2", b: "cl3" }, { a: "cl3", b: "cl4" },
    { a: "cr0", b: "cr1" }, { a: "cr1", b: "cr2" }, { a: "cr2", b: "cr3" }, { a: "cr3", b: "cr4" }
  ];
  var BODY_BONES = [0, 1, 2, 3, 4, 5];
  var COAT_BONES = [6, 7, 8, 9, 10, 11, 12, 13];

  /* ---------- estado ---------- */
  var names = Object.keys(POINTS);
  var idx = {};
  names.forEach(function (name, i) { idx[name] = i; });
  var count = names.length;
  var X = new Float32Array(count), Y = new Float32Array(count);
  var PX = new Float32Array(count), PY = new Float32Array(count);
  var RX = new Float32Array(count), RY = new Float32Array(count);
  var BACK = new Float32Array(count), DRAG = new Float32Array(count), LEASH = new Float32Array(count);
  var isTorso = new Uint8Array(count);
  names.forEach(function (name, i) {
    var p = POINTS[name];
    RX[i] = p[0]; RY[i] = p[1];
    BACK[i] = p[2] || 0;
    DRAG[i] = p[3] || 0.994;
    LEASH[i] = p[4] || 0;
  });

  var torsoIds = TORSO.map(function (name) { isTorso[idx[name]] = 1; return idx[name]; });
  var T0X = 0, T0Y = 0;
  torsoIds.forEach(function (i) { T0X += RX[i]; T0Y += RY[i]; });
  T0X /= torsoIds.length; T0Y /= torsoIds.length;
  var frame = { c: 1, s: 0, x: T0X, y: T0Y };

  var sticks = STICKS.map(function (d) {
    var a = idx[d[0]], b = idx[d[1]];
    var len = Math.hypot(RX[a] - RX[b], RY[a] - RY[b]);
    return { a: a, b: b, len: len, min: d[2] ? len * d[2] : len };
  });

  // tela
  var vw = 1, vh = 1, dpr = 1, scale = 1, ox = 0, oy = 0, anchorY = -600;
  var bar = { x: 0, v: 0, tilt: 0, tiltV: 0 };
  var pointer = { x: 0, y: 0, fx: 0, fy: 0, vx: 0, vy: 0, inside: false, lastMove: -10 };
  var grab = null, time = 0, acc = 0, last = 0, raf = 0, nextIdleFeather = 2;

  var ropes = ROPES.map(function (d) {
    var nodes = 14;
    return {
      p: idx[d[0]], ax: d[1], slack: d[2], len: 0, x0: 0, y0: 0, nodes: nodes,
      nx: new Float32Array(nodes), ny: new Float32Array(nodes),
      npx: new Float32Array(nodes), npy: new Float32Array(nodes)
    };
  });

  /* ---------- tela e tamanhos ---------- */
  function layout() {
    var rect = stage.getBoundingClientRect();
    var css = getComputedStyle(document.documentElement);
    vw = rect.width; vh = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    glCanvas.width = canvas2d.width = backCanvas.width = Math.round(vw * dpr);
    glCanvas.height = canvas2d.height = backCanvas.height = Math.round(vh * dpr);
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);

    // mesmas medidas do CSS, lidas de um elemento pra resolver svh e calc
    var probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;height:var(--fig-h);bottom:var(--fig-bottom)";
    stage.appendChild(probe);
    var figH = probe.getBoundingClientRect().height;
    var figBottom = parseFloat(getComputedStyle(probe).bottom) || 0;
    stage.removeChild(probe);

    scale = figH / IMG_H;
    ox = vw / 2 - FIG_CX * scale;
    oy = vh - figBottom - figH;
    // os fios nascem um pouco acima da tela
    anchorY = -oy / scale - 40;

    ropes.forEach(function (r) {
      r.x0 = FIG_CX + r.ax;
      r.y0 = anchorY;
      r.len = Math.hypot(r.x0 - RX[r.p], r.y0 - RY[r.p]) * r.slack;
    });
    measureLetters();
  }

  function anchor(r) {
    var c = Math.cos(bar.tilt), s = Math.sin(bar.tilt);
    return { x: FIG_CX + bar.x + r.ax * c, y: anchorY + r.ax * s };
  }

  function resetBody(dropBy) {
    for (var i = 0; i < count; i++) {
      X[i] = PX[i] = RX[i];
      Y[i] = PY[i] = RY[i] - dropBy;
    }
    ropes.forEach(function (r) {
      var a = anchor(r);
      for (var n = 0; n < r.nodes; n++) {
        var t = n / (r.nodes - 1);
        r.nx[n] = r.npx[n] = a.x + (X[r.p] - a.x) * t;
        r.ny[n] = r.npy[n] = a.y + (Y[r.p] - a.y) * t;
      }
    });
  }

  /* ---------- física do corpo ---------- */
  function matchTorso() {
    var i, n = torsoIds.length, cx = 0, cy = 0, a = 0, b = 0;
    for (i = 0; i < n; i++) { cx += X[torsoIds[i]]; cy += Y[torsoIds[i]]; }
    cx /= n; cy /= n;
    for (i = 0; i < n; i++) {
      var id = torsoIds[i];
      var qx = RX[id] - T0X, qy = RY[id] - T0Y, rx = X[id] - cx, ry = Y[id] - cy;
      a += qx * rx + qy * ry;
      b += qx * ry - qy * rx;
    }
    var len = Math.hypot(a, b) || 1, c = a / len, s = b / len;
    for (i = 0; i < n; i++) {
      var k = torsoIds[i];
      var ux = RX[k] - T0X, uy = RY[k] - T0Y;
      X[k] = cx + c * ux - s * uy;
      Y[k] = cy + s * ux + c * uy;
    }
    frame.c = c; frame.s = s; frame.x = cx; frame.y = cy;
  }

  function solveSticks() {
    for (var i = 0; i < sticks.length; i++) {
      var st = sticks[i];
      var dx = X[st.b] - X[st.a], dy = Y[st.b] - Y[st.a];
      var d = Math.hypot(dx, dy) || 0.001;
      var target = d > st.len ? st.len : d < st.min ? st.min : d;
      if (target === d) continue;
      var diff = (d - target) / d;
      // ponto do tronco não cede: quem acompanha é o membro
      var wa = isTorso[st.a] ? (isTorso[st.b] ? 0.5 : 0.12) : (isTorso[st.b] ? 0.88 : 0.5);
      var wb = 1 - wa;
      X[st.a] += dx * diff * wa; Y[st.a] += dy * diff * wa;
      X[st.b] -= dx * diff * wb; Y[st.b] -= dy * diff * wb;
    }
  }

  function solveRopes() {
    for (var i = 0; i < ropes.length; i++) {
      var r = ropes[i], p = r.p, a = anchor(r), maxLen = r.len;
      if (grab && grab.rope === r) {
        // o fio passa pelo dedo: o que sobra de comprimento é o que segura o corpo
        var gx = pointer.fx - a.x, gy = pointer.fy - a.y;
        var gd = Math.hypot(gx, gy) || 1;
        var room = Math.min(gd, r.len - 60);
        a = { x: a.x + gx / gd * room, y: a.y + gy / gd * room };
        grab.px = a.x; grab.py = a.y;
        maxLen = r.len - room;
      }
      var dx = X[p] - a.x, dy = Y[p] - a.y;
      var d = Math.hypot(dx, dy) || 0.001;
      if (d > maxLen) {
        var f = (d - maxLen) / d;
        X[p] -= dx * f; Y[p] -= dy * f;
      }
    }
  }

  function stepBody() {
    var i, g = GRAVITY * STEP * STEP;
    for (i = 0; i < count; i++) {
      var vx = (X[i] - PX[i]) * DRAG[i], vy = (Y[i] - PY[i]) * DRAG[i];
      // trava de velocidade, pra um puxão forte não desmontar a malha
      var speed = Math.hypot(vx, vy);
      if (speed > 34) { vx *= 34 / speed; vy *= 34 / speed; }
      PX[i] = X[i]; PY[i] = Y[i];
      X[i] += vx; Y[i] += vy + g;
      if (BACK[i]) {
        var qx = RX[i] - T0X, qy = RY[i] - T0Y;
        X[i] += (frame.x + frame.c * qx - frame.s * qy - X[i]) * BACK[i];
        Y[i] += (frame.y + frame.s * qx + frame.c * qy - Y[i]) * BACK[i];
      }
    }
    if (grab && grab.point !== undefined) {
      X[grab.point] += (pointer.fx - grab.dx - X[grab.point]) * 0.3;
      Y[grab.point] += (pointer.fy - grab.dy - Y[grab.point]) * 0.3;
    }
    for (var it = 0; it < 8; it++) {
      solveRopes();
      solveSticks();
      matchTorso();
      solveLeash();
    }
    // a gaiola aperta casaco e pernas
    if (cage.on && cage.squeeze) {
      for (i = 0; i < count; i++) {
        if (isTorso[i]) continue;
        var off = X[i] - FIG_CX;
        if (Math.abs(off) > cage.squeeze) X[i] = FIG_CX + (off > 0 ? cage.squeeze : -cage.squeeze);
      }
    }
  }

  function solveLeash() {
    for (var i = 0; i < count; i++) {
      if (!LEASH[i]) continue;
      var qx = RX[i] - T0X, qy = RY[i] - T0Y;
      var dx = X[i] - (frame.x + frame.c * qx - frame.s * qy);
      var dy = Y[i] - (frame.y + frame.s * qx + frame.c * qy);
      var d = Math.hypot(dx, dy);
      if (d > LEASH[i]) {
        var f = (d - LEASH[i]) / d;
        X[i] -= dx * f; Y[i] -= dy * f;
      }
    }
  }

  function updateBar(dt) {
    var targetX = 0, targetTilt = 0;
    if ((grab && grab.rope) || (pointer.inside && pointer.mouse && !grab && !pointer.down && nearestRope(40))) {
      // segurando um fio, ou indo pegar um, a barra fica parada: senão o fio foge do cursor
      targetX = bar.x; targetTilt = bar.tilt;
    } else if (pointer.inside && time - pointer.lastMove < 4) {
      // passar o mouse só balança de leve; sacudir de verdade é arrastar o fundo
      var off = pointer.x - vw / 2;
      targetX = Math.max(-300, Math.min(300, off / scale * (pointer.down ? 0.6 : 0.14)));
      targetTilt = Math.max(-1, Math.min(1, off / (vw / 2))) * (pointer.down ? 0.16 : 0.03);
    } else {
      // parado, balança de leve pra mostrar que está vivo
      targetX = Math.sin(time * 0.7) * 14;
      targetTilt = Math.sin(time * 0.43) * 0.012;
    }
    bar.v += (targetX - bar.x) * 26 * dt;
    bar.v *= Math.exp(-7 * dt);
    bar.x += bar.v * dt;
    bar.tiltV += (targetTilt - bar.tilt) * 20 * dt;
    bar.tiltV *= Math.exp(-6 * dt);
    bar.tilt += bar.tiltV * dt;
  }

  /* ---------- fios desenhados: só visual, não seguram o corpo ---------- */
  function updateThreads() {
    // menor que o alcance do clique, senão o cursor empurra o fio pra longe antes de pegar
    var pushR = 14 / scale;
    for (var i = 0; i < ropes.length; i++) {
      var r = ropes[i], a = anchor(r), last = r.nodes - 1;
      var bx = X[r.p], by = Y[r.p];
      var held = grab && grab.rope === r;
      var pinned = held ? grab.node : -1;
      var n;
      for (n = 1; n < last; n++) {
        var vx = (r.nx[n] - r.npx[n]) * 0.965, vy = (r.ny[n] - r.npy[n]) * 0.965;
        r.npx[n] = r.nx[n]; r.npy[n] = r.ny[n];
        r.nx[n] += vx; r.ny[n] += vy + 0.05;
        // o cursor empurra o fio ao passar, e ele vibra quando solta
        if (pointer.inside && !grab && pointer.mouse) {
          var dx = r.nx[n] - pointer.fx, dy = r.ny[n] - pointer.fy, d = Math.hypot(dx, dy);
          if (d < pushR && d > 0.01) { r.nx[n] += dx / d * (pushR - d) * 0.5; r.ny[n] += dy / d * (pushR - d) * 0.5; }
        }
      }
      r.nx[0] = a.x; r.ny[0] = a.y; r.nx[last] = bx; r.ny[last] = by;
      if (held) { r.nx[pinned] = grab.px; r.ny[pinned] = grab.py; }

      var chord = Math.hypot(bx - a.x, by - a.y);
      var tight = Math.max(chord, r.len);
      var seg = tight * 1.003 / last;
      if (held) {
        var first = Math.hypot(grab.px - a.x, grab.py - a.y) / pinned;
        var rest = Math.hypot(bx - grab.px, by - grab.py) / (last - pinned);
      }
      for (var it = 0; it < 4; it++) {
        for (n = 0; n < last; n++) {
          var limit = held ? (n < pinned ? first : rest) : seg;
          var sx = r.nx[n + 1] - r.nx[n], sy = r.ny[n + 1] - r.ny[n], sd = Math.hypot(sx, sy) || 0.001;
          if (sd <= limit) continue;
          var diff = (sd - limit) / sd * 0.5;
          var fixA = n === 0 || n === pinned, fixB = n + 1 === last || n + 1 === pinned;
          if (!fixA) { r.nx[n] += sx * diff * (fixB ? 2 : 1); r.ny[n] += sy * diff * (fixB ? 2 : 1); }
          if (!fixB) { r.nx[n + 1] -= sx * diff * (fixA ? 2 : 1); r.ny[n + 1] -= sy * diff * (fixA ? 2 : 1); }
        }
      }
      // puxa de volta pra reta, o que faz a vibração morrer
      if (!held && chord >= r.len * 0.985) {
        for (n = 1; n < last; n++) {
          var t = n / last;
          r.nx[n] += (a.x + (bx - a.x) * t - r.nx[n]) * 0.06;
          r.ny[n] += (a.y + (by - a.y) * t - r.ny[n]) * 0.06;
        }
      }
    }
  }

  function drawThreads() {
    var i, n;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (var pass = 0; pass < 2; pass++) {
      ctx.lineWidth = (pass ? 1.05 : 3.4) * dpr;
      for (i = 0; i < ropes.length; i++) {
        var r = ropes[i], held = grab && grab.rope === r, last = r.nodes - 1;
        ctx.strokeStyle = pass ? (held ? "#FFFFFF" : "rgba(255, 232, 238, 0.82)") : (held ? "rgba(242, 165, 181, 0.34)" : "rgba(242, 165, 181, 0.1)");
        ctx.beginPath();
        ctx.moveTo((ox + r.nx[0] * scale) * dpr, (oy + r.ny[0] * scale) * dpr);
        for (n = 1; n < last; n++) {
          var mx = (r.nx[n] + r.nx[n + 1]) / 2, my = (r.ny[n] + r.ny[n + 1]) / 2;
          ctx.quadraticCurveTo((ox + r.nx[n] * scale) * dpr, (oy + r.ny[n] * scale) * dpr, (ox + mx * scale) * dpr, (oy + my * scale) * dpr);
        }
        ctx.lineTo((ox + r.nx[last] * scale) * dpr, (oy + r.ny[last] * scale) * dpr);
        ctx.stroke();
      }
    }
    // nó onde o fio encosta no corpo
    ctx.fillStyle = "rgba(255, 240, 244, 0.9)";
    for (i = 0; i < ropes.length; i++) {
      ctx.beginPath();
      ctx.arc((ox + X[ropes[i].p] * scale) * dpr, (oy + Y[ropes[i].p] * scale) * dpr, 1.8 * dpr, 0, 6.2832);
      ctx.fill();
    }
  }

  /* ---------- penas ---------- */
  var MAX_FEATHERS = 130;
  var feathers = [];
  var coatIds = ["cl1", "cl2", "cl3", "cl4", "cr1", "cr2", "cr3", "cr4"].map(function (n) { return idx[n]; });
  var sprites = [0, 1, 2, 3].map(makeFeather);

  function makeFeather(seed) {
    var c = document.createElement("canvas");
    c.width = 64; c.height = 128;
    var x = c.getContext("2d");
    var lean = (seed - 1.5) * 5;
    var tones = ["#F7BCC8", "#F2A5B5", "#FAD2DA", "#EC93A6"];
    x.translate(32, 124);
    x.lineCap = "round";
    // miolo macio por baixo, pra pena ter corpo
    x.globalAlpha = 0.62;
    x.fillStyle = "#F4AABA";
    x.beginPath();
    x.moveTo(0, -8);
    x.bezierCurveTo(-20 - seed, -36, -13, -84, lean, -112);
    x.bezierCurveTo(13, -84, 20 + seed, -36, 0, -8);
    x.fill();
    // por cima, só fiapos: é o que faz parecer pena de boá, e não folha
    for (var i = 0; i < 240; i++) {
      var t = Math.pow(Math.random(), 0.8);
      var y = -10 - t * 104;
      var base = lean * (t * t);
      var side = i % 2 ? 1 : -1;
      // mais larga no meio, afinando na ponta
      var reach = Math.sin(Math.min(1, t * 1.15) * Math.PI) * (24 + seed * 1.5) * (0.45 + Math.random() * 0.65);
      x.strokeStyle = tones[i % 4];
      x.globalAlpha = 0.55 + Math.random() * 0.4;
      x.lineWidth = 0.9 + Math.random() * 1.1;
      x.beginPath();
      x.moveTo(base, y);
      x.quadraticCurveTo(base + side * reach * 0.6, y - 4, base + side * reach, y - 11 - Math.random() * 6);
      x.stroke();
    }
    // penugem solta na base
    for (var j = 0; j < 26; j++) {
      x.strokeStyle = tones[j % 4];
      x.globalAlpha = 0.55;
      x.lineWidth = 0.7;
      x.beginPath();
      x.moveTo(0, -8);
      x.quadraticCurveTo((j - 13) * 0.9, -14, (j - 13) * 1.7 + (Math.random() - 0.5) * 3, -20 - Math.random() * 12);
      x.stroke();
    }
    // raque
    x.globalAlpha = 0.85;
    x.strokeStyle = "#FBE3E8";
    x.lineWidth = 1.1;
    x.beginPath(); x.moveTo(0, 2); x.quadraticCurveTo(0, -60, lean, -112); x.stroke();
    return c;
  }

  function spawnFeather(i, power) {
    if (feathers.length >= MAX_FEATHERS) return;
    var angle = Math.random() * 6.28;
    feathers.push({
      x: X[i] + (Math.random() - 0.5) * 130,
      y: Y[i] + (Math.random() - 0.5) * 110,
      vx: (X[i] - PX[i]) / STEP * 0.16 + Math.cos(angle) * 70 * power,
      vy: (Y[i] - PY[i]) / STEP * 0.16 + Math.sin(angle) * 70 * power - 40 * power,
      rot: Math.random() * 6.28,
      spin: (Math.random() - 0.5) * 2.4,
      phase: Math.random() * 6.28,
      size: (0.6 + Math.random() * 0.7) * 19,
      kind: Math.floor(Math.random() * 4),
      lane: Math.random() * 16 / scale, // cada uma pousa numa altura, pra virar monte e não fila
      age: 0,
      life: 5 + Math.random() * 5
    });
  }

  function burst(i, n) {
    for (var k = 0; k < n; k++) spawnFeather(i, 1.4);
  }

  function updateFeathers(dt) {
    // quanto mais rápido o casaco, mais pena solta
    for (var c = 0; c < coatIds.length; c++) {
      var id = coatIds[c];
      var speed = Math.hypot(X[id] - PX[id], Y[id] - PY[id]) / STEP;
      if (speed > 520 && Math.random() < (speed - 520) * 0.00003) spawnFeather(id, 1);
    }
    if (time > nextIdleFeather) {
      spawnFeather(coatIds[Math.floor(Math.random() * coatIds.length)], 0.3);
      nextIdleFeather = time + 1.4 + Math.random() * 1.6;
    }
    var floor = (vh - oy - 7) / scale;
    var windR = 220 / scale;
    for (var i = feathers.length - 1; i >= 0; i--) {
      var f = feathers[i];
      f.age += dt;
      if (f.age > f.life) { feathers.splice(i, 1); continue; }
      if (f.rest) {
        // no chão fica deitada até o vento do cursor levantar de novo
        f.rot += (f.flat - f.rot) * Math.min(1, dt * 7);
        if (pointer.inside) {
          var wx = f.x - pointer.fx, wy = f.y - pointer.fy;
          if (Math.hypot(wx, wy) < windR && Math.hypot(pointer.vx, pointer.vy) > 500) {
            f.rest = false;
            f.vy = -130 - Math.random() * 220;
            f.vx = pointer.vx * 0.12;
            f.life = f.age + 7;
          }
        }
        continue;
      }
      f.vy += 118 * dt;
      var drag = Math.exp(-2.1 * dt);
      f.vx *= drag; f.vy *= drag;
      f.vx += Math.sin(f.phase + f.age * 2.1) * 62 * dt;
      f.rot += (f.spin + Math.cos(f.phase + f.age * 2.1) * 0.9) * dt;
      // o cursor faz vento
      if (pointer.inside) {
        var dx = f.x - pointer.fx, dy = f.y - pointer.fy, d = Math.hypot(dx, dy);
        if (d < windR) {
          var w = (1 - d / windR) * dt * 5.5;
          f.vx += pointer.vx * w; f.vy += pointer.vy * w;
        }
      }
      // dentro da gaiola, as penas não escapam
      if (cage.on && cage.squeeze && Math.abs(f.x - FIG_CX) > cage.squeeze) {
        f.vx -= (f.x > FIG_CX ? 1 : -1) * 900 * dt;
      }
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.y >= floor - f.lane) {
        f.y = floor - f.lane;
        f.rest = true;
        // a pena desenhada é vertical: deitar é girar um quarto de volta pro lado mais perto
        f.flat = Math.round((f.rot - 1.5708) / 3.1416) * 3.1416 + 1.5708;
        f.life = f.age + 18 + Math.random() * 10;
      }
    }
  }

  /* ---------- som: cada fio é uma corda ---------- */
  var NOTES = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33]; // lá menor pentatônica
  var audio = null, master = null, strings = [], noiseBuf = null, drone = null, soundOn = true;
  var lastPluck = new Float32Array(ropes.length);

  // Karplus-Strong: um ruído curto dando voltas num atraso soa como corda beliscada
  function makeString(freq) {
    var rate = audio.sampleRate, len = Math.floor(rate * 2.4), period = Math.round(rate / freq);
    var buf = audio.createBuffer(1, len, rate), out = buf.getChannelData(0);
    var ring = new Float32Array(period), soft = 0, j;
    for (j = 0; j < period; j++) { soft = soft * 0.45 + (Math.random() * 2 - 1) * 0.55; ring[j] = soft; }
    for (var i = 0; i < len; i++) {
      j = i % period;
      var v = ring[j];
      out[i] = v;
      ring[j] = (v + ring[(j + 1) % period]) * 0.4985;
    }
    return buf;
  }

  function initAudio() {
    if (audio) { if (audio.state === "suspended") audio.resume(); return; }
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio = new Ctx();
    master = audio.createGain();
    master.gain.value = soundOn ? 0.42 : 0;
    var limiter = audio.createDynamicsCompressor();
    master.connect(limiter);
    limiter.connect(audio.destination);
    strings = NOTES.map(makeString);
    noiseBuf = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.5), audio.sampleRate);
    var n = noiseBuf.getChannelData(0);
    for (var i = 0; i < n.length; i++) n[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n.length, 3);
    if (audio.state === "suspended") audio.resume();
  }

  function pluck(i, power, delay) {
    if (!audio || !soundOn || !strings[i]) return;
    var src = audio.createBufferSource(), gain = audio.createGain();
    src.buffer = strings[i];
    gain.gain.value = power;
    src.connect(gain);
    if (audio.createStereoPanner) {
      var pan = audio.createStereoPanner();
      pan.pan.value = (i / (NOTES.length - 1) - 0.5) * 1.2;
      gain.connect(pan);
      pan.connect(master);
    } else {
      gain.connect(master);
    }
    src.start(audio.currentTime + (delay || 0));
  }

  function startDrone() {
    if (!audio || !soundOn) return;
    var osc = audio.createOscillator(), filter = audio.createBiquadFilter(), gain = audio.createGain();
    var now = audio.currentTime;
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(55, now);
    osc.frequency.exponentialRampToValueAtTime(165, now + CAGE.hold);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(180, now);
    filter.frequency.exponentialRampToValueAtTime(1500, now + CAGE.hold);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.34, now + CAGE.hold);
    osc.connect(filter); filter.connect(gain); gain.connect(master);
    osc.start();
    drone = { osc: osc, gain: gain };
  }

  function stopDrone() {
    if (!drone) return;
    drone.gain.gain.cancelScheduledValues(audio.currentTime);
    drone.gain.gain.setValueAtTime(0, audio.currentTime);
    drone.osc.stop(audio.currentTime + 0.02);
    drone = null;
  }

  function crash() {
    if (!audio || !soundOn) return;
    var src = audio.createBufferSource(), gain = audio.createGain();
    src.buffer = noiseBuf;
    gain.gain.value = 0.7;
    src.connect(gain); gain.connect(master);
    src.start();
    for (var i = 0; i < NOTES.length; i++) pluck(i, 0.7, i * 0.012);
  }

  // o cursor cruzou a linha do fio entre dois movimentos: toca e faz a corda vibrar
  function strum(x0, y0, x1, y1) {
    var now = performance.now() / 1000, hits = 0;
    for (var i = 0; i < ropes.length; i++) {
      var r = ropes[i], a = anchor(r), bx = X[r.p], by = Y[r.p];
      var d = (x1 - x0) * (by - a.y) - (y1 - y0) * (bx - a.x);
      if (!d) continue;
      var t = ((a.x - x0) * (by - a.y) - (a.y - y0) * (bx - a.x)) / d;
      var u = ((a.x - x0) * (y1 - y0) - (a.y - y0) * (x1 - x0)) / d;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      hits++;
      var hit = Math.round(u * (r.nodes - 1));
      var push = Math.max(-16, Math.min(16, (x1 - x0) * 0.4));
      for (var n = 1; n < r.nodes - 1; n++) {
        r.npx[n] -= push * Math.max(0, 1 - Math.abs(n - hit) / 5);
      }
      if (now - lastPluck[i] > 0.07) {
        lastPluck[i] = now;
        pluck(i, 0.5);
      }
    }
    if (hits && audio) advanceTip(1);
  }

  /* ---------- letras penduradas ---------- */
  var wordEl = document.getElementById("word");
  var letters = Array.prototype.map.call(wordEl.children, function (el) {
    return { el: el, rx: 0, ry: 0, w: 1, h: 1, cap: 0, x: 0, y: 0, a: 0, vx: 0, vy: 0, va: 0, state: "hang", timer: 0, mask: null, mw: 0, mh: 0, shown: "" };
  });
  var letterGrab = null;

  function measureLetters() {
    var fs = parseFloat(getComputedStyle(wordEl).fontSize);
    letters.forEach(function (l) {
      l.el.style.transform = "none";
      l.shown = "";
      var rect = l.el.getBoundingClientRect();
      l.rx = rect.left; l.ry = rect.top; l.w = rect.width; l.h = rect.height;
      l.cap = fs * 0.065; // folga entre o topo da caixa e o topo da letra
      // máscara pequena da letra, pra só pegar quando clica no desenho dela
      var c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(l.w / 6)); c.height = Math.max(1, Math.round(l.h / 6));
      var m = c.getContext("2d", { willReadFrequently: true });
      m.font = (fs / 6) + "px Anton, Impact, sans-serif";
      m.textAlign = "center";
      m.textBaseline = "alphabetic";
      var tm = m.measureText("H");
      var asc = tm.fontBoundingBoxAscent || fs / 6 * 0.9, desc = tm.fontBoundingBoxDescent || fs / 6 * 0.25;
      m.fillText(l.el.textContent.toUpperCase(), c.width / 2, (c.height - asc - desc) / 2 + asc);
      l.mask = m.getImageData(0, 0, c.width, c.height).data;
      l.mw = c.width; l.mh = c.height;
    });
  }

  function letterAt(sx, sy) {
    for (var i = 0; i < letters.length; i++) {
      var l = letters[i];
      if (l.state === "fall" || l.state === "rest") continue;
      var ox0 = l.rx + l.w / 2 + l.x, oy0 = l.ry + l.y;
      var dx = sx - ox0, dy = sy - oy0, c = Math.cos(-l.a), s = Math.sin(-l.a);
      var lx = (c * dx - s * dy + l.w / 2) / 6, ly = (s * dx + c * dy) / 6;
      var ix = Math.floor(lx), iy = Math.floor(ly);
      if (ix < 0 || iy < 0 || ix >= l.mw || iy >= l.mh) continue;
      if (l.mask[(iy * l.mw + ix) * 4 + 3] > 40) return l;
    }
    return null;
  }

  function cutLetter(l, note) {
    l.state = "fall";
    l.timer = 3.4 + Math.random() * 1.4;
    l.va += (Math.random() - 0.5) * 2.4;
    l.vx += (Math.random() - 0.5) * 120;
    pluck(note % NOTES.length, 0.6);
  }

  function updateLetters(dt) {
    var fall = 2100;
    for (var i = 0; i < letters.length; i++) {
      var l = letters[i];
      if (letterGrab && letterGrab.letter === l) {
        // preso no cursor: vai junto, e arrancar longe demais corta os fios
        var tx = pointer.x - letterGrab.dx, ty = pointer.y - letterGrab.dy;
        l.vx = (tx - l.x) * 16; l.vy = (ty - l.y) * 16;
        l.x += l.vx * dt; l.y += l.vy * dt;
        l.va += (-l.vx * 0.012 - l.a * 10) * dt - l.va * 3 * dt;
        l.a += l.va * dt;
        if (Math.hypot(l.x, l.y) > Math.min(190, vh * 0.26)) {
          letterGrab = null;
          cutLetter(l, i * 2 + 1);
          advanceTip(2);
        }
      } else if (l.state === "hang") {
        // pêndulo: volta pro lugar e o giro acompanha o balanço
        l.vx += (-16 * l.x - 2.2 * l.vx) * dt;
        l.vy += (-30 * l.y - 3.4 * l.vy) * dt;
        l.va += (-13 * l.a - 2 * l.va - l.vx * 0.012) * dt;
        l.x += l.vx * dt; l.y += l.vy * dt; l.a += l.va * dt;
      } else if (l.state === "fall" || l.state === "rest") {
        l.vy += fall * dt;
        l.x += l.vx * dt; l.y += l.vy * dt; l.a += l.va * dt;
        // base da letra girada, sem contar a folga da caixa
        var reach = (l.h - l.cap * 2) * Math.abs(Math.cos(l.a)) + l.w * 0.5 * Math.abs(Math.sin(l.a));
        var ground = vh - l.ry - l.cap - reach - 4;
        if (l.y > ground) {
          if (l.vy > 260) pluck(0, Math.min(0.4, l.vy / 3000));
          l.y = ground;
          l.vy *= -0.26;
          l.vx *= 0.6;
          l.va *= 0.45;
          l.state = "rest";
        }
        l.timer -= dt;
        if (l.timer <= 0 && !cage.closing) { l.state = "rise"; l.vy = 0; }
      } else if (l.state === "rise") {
        // os fios descem de novo e puxam a letra de volta
        l.vx += (-3 * l.x - 2.4 * l.vx) * dt;
        l.vy += (-5 * l.y - 3 * l.vy) * dt;
        l.va += (-5 * l.a - 3 * l.va) * dt;
        l.x += l.vx * dt; l.y += l.vy * dt; l.a += l.va * dt;
        if (Math.abs(l.y) < 14) l.state = "hang";
      }
      // o corpo batendo empurra a letra
      if (l.state === "hang" && !(letterGrab && letterGrab.letter === l)) {
        for (var c = 0; c < coatIds.length; c++) {
          var id = coatIds[c];
          var sx = ox + X[id] * scale, sy = oy + Y[id] * scale;
          if (sx < l.rx || sx > l.rx + l.w || sy < l.ry || sy > l.ry + l.h) continue;
          var svx = (X[id] - PX[id]) / STEP * scale;
          if (Math.abs(svx) > 260) { l.vx += svx * 0.018; }
        }
      }
      var tf = "translate(" + l.x.toFixed(1) + "px," + l.y.toFixed(1) + "px) rotate(" + l.a.toFixed(4) + "rad)";
      if (tf !== l.shown) { l.el.style.transform = tf; l.shown = tf; }
    }
  }

  function drawLetterThreads() {
    var k = dpr;
    backCtx.lineWidth = 1 * k;
    backCtx.strokeStyle = "rgba(242, 165, 181, 0.5)";
    backCtx.beginPath();
    for (var i = 0; i < letters.length; i++) {
      var l = letters[i];
      if (l.state === "fall" || l.state === "rest") continue;
      var cx = l.rx + l.w / 2 + l.x, cy = l.ry + l.y, c = Math.cos(l.a), s = Math.sin(l.a);
      // no O e no S o topo é curvo: preso perto do meio, senão o fio não encosta
      var side = l.w * (i > 1 ? 0.1 : 0.3);
      var lx = cx - c * side - s * l.cap, ly = cy - s * side + c * l.cap;
      var rx = cx + c * side - s * l.cap, ry = cy + s * side + c * l.cap;
      backCtx.moveTo((l.rx + l.w / 2 - side) * k, -4);
      backCtx.lineTo(lx * k, ly * k);
      backCtx.moveTo((l.rx + l.w / 2 + side) * k, -4);
      backCtx.lineTo(rx * k, ry * k);
    }
    backCtx.stroke();
  }

  /* ---------- a gaiola ---------- */
  var CAGE = { drop: 1, hold: 4.7, burst: 5.05, end: 5.75, bars: 30 };
  var cage = { on: false, closing: false, t: 0, squeeze: 0, burst: false, radius: 0 };

  function startCage() {
    if (cage.on) return;
    initAudio();
    cage.on = true;
    cage.closing = true;
    cage.t = 0;
    cage.burst = false;
    cage.squeeze = 0;
    cageBtn.disabled = true;
    cageBtn.classList.remove("is-next");
    cageBtn.textContent = "fechando";
    advanceTip(3);
    for (var i = 0; i < NOTES.length; i++) pluck(i, 0.42, i * 0.09);
    startDrone();
  }

  function cageRadius(t) {
    var max = Math.max(vw * 0.62, vh * 0.62), min = 372 * scale;
    if (t < CAGE.drop) return max;
    if (t < CAGE.hold) {
      var p = (t - CAGE.drop) / (CAGE.hold - CAGE.drop);
      return max + (min - max) * p * p * (3 - 2 * p);
    }
    if (t < CAGE.burst) return min;
    return min + (t - CAGE.burst) * max * 3.2;
  }

  function updateCage(dt) {
    if (!cage.on) return;
    cage.t += dt;
    var t = cage.t;
    cage.radius = cageRadius(t);
    if (t > CAGE.drop && t < CAGE.burst) {
      cage.squeeze = cage.radius / scale;
      var p = Math.min(1, (t - CAGE.drop) / (CAGE.hold - CAGE.drop));
      // quanto mais fecha, mais o boneco treme
      bar.v += (Math.random() - 0.5) * p * p * 500 * dt * 60 * 0.1;
      // a linha da gaiola corta as letras que ficaram de fora
      for (var i = 0; i < letters.length; i++) {
        var l = letters[i];
        // no aperto final não sobra nenhuma, mesmo as que estavam dentro
        if ((l.state === "hang" || l.state === "rise") && (t > CAGE.hold - 0.2 || Math.abs(l.rx + l.w / 2 + l.x - vw / 2) > cage.radius * 0.96)) {
          if (letterGrab && letterGrab.letter === l) letterGrab = null;
          cutLetter(l, 7 - i);
        }
      }
    }
    if (t >= CAGE.burst && !cage.burst) {
      cage.burst = true;
      cage.closing = false;
      cage.squeeze = 0;
      stopDrone();
      crash();
      // solta tudo: o corpo pula e o casaco estoura em penas
      for (var n = 0; n < count; n++) {
        PY[n] = Y[n] + 16 + Math.random() * 6;
        PX[n] = X[n] - (X[n] - FIG_CX) * 0.045;
      }
      for (var k = 0; k < 44; k++) spawnFeather(coatIds[k % coatIds.length], 3.4);
      letters.forEach(function (l) { l.timer = Math.min(l.timer, 0.8 + Math.random() * 0.8); });
    }
    if (t >= CAGE.end) {
      cage.on = false;
      cageBtn.disabled = false;
      cageBtn.textContent = "fechar a gaiola";
    }
  }

  function cageShape(u) { return Math.pow(Math.sin(u * 1.5708), 0.72); }

  function drawCage(c, front) {
    if (!cage.on) return;
    var t = cage.t, k = dpr, cx = vw / 2, top = -vh * 0.1, bottom = vh + 16, height = bottom - top;
    var fade = t > CAGE.burst ? Math.max(0, 1 - (t - CAGE.burst) / (CAGE.end - CAGE.burst)) : 1;
    var tension = Math.min(1, Math.max(0, (t - CAGE.drop) / (CAGE.hold - CAGE.drop)));
    var R = cage.radius, spin = t * 0.34;
    c.lineCap = "round";
    for (var i = 0; i < CAGE.bars; i++) {
      var phi = i / CAGE.bars * 6.2832 + spin;
      var depth = Math.cos(phi), s = Math.sin(phi);
      if ((depth >= 0) !== front) continue;
      // cada fio desce do alto com um pequeno atraso
      var reveal = Math.max(0, Math.min(1, (t - (i % 15) * 0.028) / 0.62));
      if (!reveal) continue;
      c.globalAlpha = fade * (front ? 0.52 + 0.4 * depth : 0.3);
      c.strokeStyle = "#FFE8EE";
      c.lineWidth = (front ? 1.1 + depth * 0.5 : 0.9) * k;
      c.beginPath();
      for (var n = 0; n <= 18; n++) {
        var u = n / 18 * reveal;
        // treme mais perto de estourar
        var shake = tension * tension * Math.sin(t * 46 + i * 2 + n) * 1.3;
        var x = cx + s * R * cageShape(u) + shake, y = top + height * u;
        if (n) c.lineTo(x * k, y * k); else c.moveTo(x * k, y * k);
      }
      c.stroke();
    }
    // anéis: metade da frente num canvas, metade de trás no outro
    if (t > CAGE.drop * 0.7) {
      var ringFade = fade * Math.min(1, (t - CAGE.drop * 0.7) / 0.3);
      c.lineWidth = 1 * k;
      c.strokeStyle = "#FFE8EE";
      c.globalAlpha = ringFade * (front ? 0.55 : 0.24);
      for (var r = 0; r < 5; r++) {
        var ru = 0.2 + r * 0.18, rx = R * cageShape(ru), ry = rx * 0.05 + 2;
        c.beginPath();
        c.ellipse(cx * k, (top + height * ru) * k, rx * k, ry * k, 0, front ? 0 : 3.1416, front ? 3.1416 : 6.2832);
        c.stroke();
      }
    }
    c.globalAlpha = 1;
    // clarão do estouro
    if (front && t > CAGE.burst && t < CAGE.burst + 0.22) {
      c.fillStyle = "rgba(255, 236, 241, " + (0.34 * (1 - (t - CAGE.burst) / 0.22)).toFixed(3) + ")";
      c.fillRect(0, 0, canvas2d.width, canvas2d.height);
    }
  }

  /* ---------- dicas: uma de cada vez, conforme a pessoa descobre ---------- */
  var tip = 0;
  function tipText(n) {
    if (n === 1) return pointer.mouse ? "Agora passa o cursor nos fios." : "Agora passa o dedo nos fios.";
    if (n === 2) return "Derruba uma letra.";
    return "Fecha a gaiola.";
  }
  function advanceTip(done) {
    if (done !== tip) return;
    tip = done + 1;
    hint.classList.add("is-out");
    setTimeout(function () {
      if (tip < 4) {
        hint.textContent = tipText(tip);
        hint.classList.remove("is-out");
        if (tip === 3 && !cage.on) cageBtn.classList.add("is-next");
      } else {
        hint.style.display = "none";
      }
    }, 450);
  }

  soundBtn.addEventListener("click", function () {
    soundOn = !soundOn;
    initAudio();
    if (master) master.gain.value = soundOn ? 0.42 : 0;
    if (!soundOn) stopDrone();
    soundBtn.textContent = soundOn ? "som: ligado" : "som: desligado";
    soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
  });
  cageBtn.addEventListener("click", startCage);

  function drawFeathers() {
    for (var i = 0; i < feathers.length; i++) {
      var f = feathers[i];
      var fade = Math.min(1, f.age * 4, (f.life - f.age) * 0.8);
      // pena tem tamanho de tela, pra continuar visível no celular
      var size = f.size * dpr;
      var c = Math.cos(f.rot), s = Math.sin(f.rot);
      var sp = sprites[f.kind];
      ctx.globalAlpha = Math.max(0, fade);
      ctx.setTransform(c, s, -s, c, (ox + f.x * scale) * dpr, (oy + f.y * scale) * dpr);
      ctx.drawImage(sp, -size * 0.5, -size, size, size * 2);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ---------- malhas da foto ---------- */
  var meshes = [], program = null, uMap = null;
  var boneC = new Float32Array(BONES.length), boneS = new Float32Array(BONES.length);
  var boneX = new Float32Array(BONES.length), boneY = new Float32Array(BONES.length);
  var bone0X = new Float32Array(BONES.length), bone0Y = new Float32Array(BONES.length);
  var boneDX = new Float32Array(BONES.length), boneDY = new Float32Array(BONES.length);

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - ax - dx * t, py - ay - dy * t);
  }

  function shapeDist(px, py, poly) {
    var inside = false, best = 1e9;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > py) !== (b[1] > py) && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
      best = Math.min(best, segDist(px, py, a[0], a[1], b[0], b[1]));
    }
    return inside ? 0 : best;
  }

  function setupGL() {
    BONES.forEach(function (bone, n) {
      if (bone.torso) { bone0X[n] = T0X; bone0Y[n] = T0Y; return; }
      var a0 = idx[bone.a], b0 = idx[bone.b];
      bone0X[n] = RX[a0]; bone0Y[n] = RY[a0];
      var len = Math.hypot(RX[b0] - RX[a0], RY[b0] - RY[a0]) || 1;
      boneDX[n] = (RX[b0] - RX[a0]) / len;
      boneDY[n] = (RY[b0] - RY[a0]) / len;
    });

    program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, "#version 300 es\nin vec2 p;in vec2 t;out vec2 v;uniform vec4 m;void main(){v=t;gl_Position=vec4(p*m.xy+m.zw,0.,1.);}"));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, "#version 300 es\nprecision mediump float;in vec2 v;out vec4 o;uniform sampler2D s;void main(){o=texture(s,v);}"));
    gl.linkProgram(program);
    gl.useProgram(program);
    uMap = gl.getUniformLocation(program, "m");

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
  }

  function buildMesh(img, boneIds) {
    var cols = Math.ceil(IMG_W / CELL), rows = Math.ceil(IMG_H / CELL);
    var probe = document.createElement("canvas");
    probe.width = cols; probe.height = rows;
    var pc = probe.getContext("2d", { willReadFrequently: true });
    pc.drawImage(img, 0, 0, cols, rows);
    var alpha = pc.getImageData(0, 0, cols, rows).data;
    var hit = function (c, r) { return c >= 0 && r >= 0 && c < cols && r < rows && alpha[(r * cols + c) * 4 + 3] > 2; };

    // só entram os quadradinhos que têm figura, com uma folga em volta
    var vertexOf = {}, rest = [], uv = [], indices = [];
    function vertex(c, r) {
      var key = r * (cols + 1) + c;
      if (vertexOf[key] === undefined) {
        vertexOf[key] = rest.length / 2;
        rest.push(Math.min(c * CELL, IMG_W), Math.min(r * CELL, IMG_H));
        uv.push(Math.min(c * CELL, IMG_W) / IMG_W, Math.min(r * CELL, IMG_H) / IMG_H);
      }
      return vertexOf[key];
    }
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var used = false;
        for (var a = -1; a <= 1 && !used; a++) for (var b = -1; b <= 1 && !used; b++) used = hit(c + a, r + b);
        if (!used) continue;
        var v0 = vertex(c, r), v1 = vertex(c + 1, r), v2 = vertex(c, r + 1), v3 = vertex(c + 1, r + 1);
        indices.push(v0, v1, v2, v1, v3, v2);
      }
    }

    // peso de cada osso em cada vértice: quanto mais perto, mais ele manda
    var nv = rest.length / 2;
    var vBones = new Uint8Array(nv * 3), vWeights = new Float32Array(nv * 3);
    var scores = new Float32Array(boneIds.length);
    for (var i = 0; i < nv; i++) {
      var px = rest[i * 2], py = rest[i * 2 + 1], k, sum = 0;
      for (k = 0; k < boneIds.length; k++) {
        var bone = BONES[boneIds[k]];
        var d = bone.shape ? shapeDist(px, py, bone.shape) : segDist(px, py, RX[idx[bone.a]], RY[idx[bone.a]], RX[idx[bone.b]], RY[idx[bone.b]]);
        scores[k] = Math.pow(1 / (d + 8), 4);
      }
      for (var top = 0; top < 3; top++) {
        var best = 0;
        for (k = 1; k < boneIds.length; k++) if (scores[k] > scores[best]) best = k;
        vBones[i * 3 + top] = boneIds[best];
        vWeights[i * 3 + top] = scores[best];
        sum += scores[best];
        scores[best] = -1;
      }
      for (var w = 0; w < 3; w++) vWeights[i * 3 + w] /= sum;
    }

    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var pos = new Float32Array(rest);
    var posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    var pLoc = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(pLoc);
    gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);

    var uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
    var tLoc = gl.getAttribLocation(program, "t");
    gl.enableVertexAttribArray(tLoc);
    gl.vertexAttribPointer(tLoc, 2, gl.FLOAT, false, 0, 0);

    var idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return { vao: vao, texture: texture, rest: rest, pos: pos, posBuf: posBuf, bones: vBones, weights: vWeights, nv: nv, count: indices.length };
  }

  function skinAndDraw() {
    var n;
    for (n = 0; n < BONES.length; n++) {
      var bone = BONES[n];
      if (bone.torso) {
        boneC[n] = frame.c; boneS[n] = frame.s; boneX[n] = frame.x; boneY[n] = frame.y;
      } else {
        var a = idx[bone.a], b = idx[bone.b];
        var dx = X[b] - X[a], dy = Y[b] - Y[a], len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        boneC[n] = boneDX[n] * dx + boneDY[n] * dy;
        boneS[n] = boneDX[n] * dy - boneDY[n] * dx;
        boneX[n] = X[a]; boneY[n] = Y[a];
      }
    }
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform4f(uMap, scale / vw * 2, -scale / vh * 2, ox / vw * 2 - 1, 1 - oy / vh * 2);
    for (n = 0; n < meshes.length; n++) {
      var mesh = meshes[n];
      var rest = mesh.rest, pos = mesh.pos, bones = mesh.bones, weights = mesh.weights;
      for (var v = 0; v < mesh.nv; v++) {
        var rx = rest[v * 2], ry = rest[v * 2 + 1], x = 0, y = 0;
        for (var k = 0; k < 3; k++) {
          var w = weights[v * 3 + k], id = bones[v * 3 + k];
          var ux = rx - bone0X[id], uy = ry - bone0Y[id];
          x += w * (boneX[id] + boneC[id] * ux - boneS[id] * uy);
          y += w * (boneY[id] + boneS[id] * ux + boneC[id] * uy);
        }
        pos[v * 2] = x; pos[v * 2 + 1] = y;
      }
      gl.bindVertexArray(mesh.vao);
      gl.bindTexture(gl.TEXTURE_2D, mesh.texture);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.posBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }
  }

  /* ---------- ponteiro ---------- */
  function toFigure(e) {
    var now = performance.now() / 1000;
    var fx = (e.clientX - ox) / scale, fy = (e.clientY - oy) / scale;
    var dt = Math.max(now - (pointer.stamp || now - 0.016), 0.004);
    pointer.vx = pointer.vx * 0.6 + (fx - pointer.fx) / dt * 0.4;
    pointer.vy = pointer.vy * 0.6 + (fy - pointer.fy) / dt * 0.4;
    pointer.stamp = now;
    pointer.x = e.clientX; pointer.y = e.clientY;
    pointer.fx = fx; pointer.fy = fy;
    pointer.mouse = e.pointerType === "mouse";
    pointer.lastMove = time;
  }

  function nearestRope(reachCss) {
    var reach = reachCss / scale, found = null, bestD = reach;
    ropes.forEach(function (r) {
      for (var n = 1; n < r.nodes - 1; n++) {
        var d = segDist(pointer.fx, pointer.fy, r.nx[n], r.ny[n], r.nx[n + 1], r.ny[n + 1]);
        if (d < bestD) { bestD = d; found = { rope: r, node: n }; }
      }
    });
    return found;
  }

  function nearestPoint(reachFig) {
    var found = -1, bestD = reachFig, i, d;
    for (i = 0; i < count; i++) {
      d = Math.hypot(X[i] - pointer.fx, Y[i] - pointer.fy);
      if (d < bestD) { bestD = d; found = i; }
    }
    if (found >= 0) return found;
    // em cima do terno vale qualquer lugar, mesmo longe dos pontos
    var dx = pointer.fx - frame.x, dy = pointer.fy - frame.y;
    var lx = T0X + frame.c * dx + frame.s * dy, ly = T0Y - frame.s * dx + frame.c * dy;
    if (shapeDist(lx, ly, TORSO_SHAPE) > 0) return -1;
    bestD = 1e9;
    for (i = 0; i < torsoIds.length; i++) {
      d = Math.hypot(X[torsoIds[i]] - pointer.fx, Y[torsoIds[i]] - pointer.fy);
      if (d < bestD) { bestD = d; found = torsoIds[i]; }
    }
    return found;
  }

  function onDown(e) {
    if (e.target.closest && e.target.closest("a, button")) return;
    // o navegador só libera som depois de um gesto
    initAudio();
    toFigure(e);
    pointer.inside = true;
    pointer.down = true;
    var touch = e.pointerType !== "mouse";
    var letter = letterAt(e.clientX, e.clientY);
    // no toque são muitos fios em pouco espaço: em cima da letra, o dedo pega a letra.
    // com o mouse, que é preciso, o fio ainda ganha se o clique for bem nele
    var hit = letter && touch ? null : nearestRope(letter ? 20 : (touch ? 44 : 34));
    if (hit) {
      grab = { rope: hit.rope, node: hit.node, px: pointer.fx, py: pointer.fy };
      advanceTip(0);
    } else {
      // o boneco está na frente das letras, então encostar nele ainda pega ele
      var point = nearestPoint(letter ? 50 : (touch ? 190 : 150));
      if (point >= 0) {
        grab = { point: point, dx: pointer.fx - X[point], dy: pointer.fy - Y[point] };
      } else if (letter) {
        letterGrab = { letter: letter, dx: e.clientX - letter.x, dy: e.clientY - letter.y, sx: e.clientX, sy: e.clientY, tol: touch ? 14 : 6 };
        stage.style.cursor = "grabbing";
      }
    }
    if (grab) stage.style.cursor = "grabbing";
    if ((grab || letterGrab) && stage.setPointerCapture) {
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já saiu */ }
    }
  }

  function onMove(e) {
    var x0 = pointer.fx, y0 = pointer.fy, known = pointer.stamp;
    toFigure(e);
    pointer.inside = e.pointerType === "mouse" || e.buttons > 0 || grab !== null;
    // o cursor cruzando os fios toca, com o dedo só se estiver encostado
    if (known && !grab && !letterGrab && pointer.inside) strum(x0, y0, pointer.fx, pointer.fy);
    if (!grab && !letterGrab && e.pointerType === "mouse") {
      stage.style.cursor = letterAt(e.clientX, e.clientY) || nearestRope(34) || nearestPoint(150) >= 0 ? "grab" : "";
    }
  }

  function onUp(e) {
    pointer.down = false;
    if (grab) {
      // o fio estala e o casaco solta penas
      if (grab.rope) pluck(ropes.indexOf(grab.rope), 0.9);
      burst(coatIds[Math.floor(Math.random() * coatIds.length)], 3);
      burst(coatIds[Math.floor(Math.random() * coatIds.length)], 3);
      grab = null;
      stage.style.cursor = "";
    }
    if (letterGrab) {
      // clique seco na letra também corta os fios
      if (Math.hypot(e.clientX - letterGrab.sx, e.clientY - letterGrab.sy) < letterGrab.tol) {
        cutLetter(letterGrab.letter, letters.indexOf(letterGrab.letter) * 2 + 1);
        advanceTip(2);
      }
      letterGrab = null;
      stage.style.cursor = "";
    }
    if (e.pointerType !== "mouse") pointer.inside = false;
  }

  stage.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  document.addEventListener("mouseleave", function () { pointer.inside = false; });

  /* ---------- laço ---------- */
  function tick(now) {
    raf = requestAnimationFrame(tick);
    var dt = Math.min((now - last) / 1000 || 0, 1 / 30);
    last = now;
    time += dt;
    updateBar(dt);
    acc += dt;
    var guard = 0;
    while (acc >= STEP && guard++ < 5) { stepBody(); acc -= STEP; }
    if (guard > 5) acc = 0;
    updateThreads();
    updateFeathers(dt);
    updateLetters(dt);
    updateCage(dt);
    pointer.vx *= 0.9; pointer.vy *= 0.9;
    skinAndDraw();
    backCtx.clearRect(0, 0, backCanvas.width, backCanvas.height);
    drawLetterThreads();
    drawCage(backCtx, false);
    ctx.clearRect(0, 0, canvas2d.width, canvas2d.height);
    drawThreads();
    drawFeathers();
    drawCage(ctx, true);
  }

  function start() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else start();
  });

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 120);
  });

  glCanvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    stop();
    // sem o contexto, volta pra versão parada
    stage.classList.remove("is-live");
    document.documentElement.classList.remove("js");
  });

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  Promise.all([loadImage("/fios/casaco.webp"), loadImage("/fios/corpo.webp")]).then(function (imgs) {
    layout();
    setupGL();
    // o casaco primeiro, pra ficar atrás
    meshes = [buildMesh(imgs[0], COAT_BONES), buildMesh(imgs[1], BODY_BONES)];
    // a letra só tem a medida certa com a fonte carregada
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureLetters);
    // entra caindo do alto: os fios esticam e seguram
    resetBody(oy / scale + IMG_H * 0.9);
    stage.classList.add("is-live");
    start();
  }).catch(function () {
    document.documentElement.classList.remove("js");
  });
})();
