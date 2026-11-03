/* Retícula: foto vira tinta de mangá num fragment shader só, em WebGL puro.
   Tudo que acontece com a foto acontece aqui no navegador, sem requisição nenhuma.
   O desenho só roda quando algo muda: parado, não gasta nada. */
(function () {
  var doc = document.documentElement;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var palco = document.getElementById("palco");
  var canvas = document.getElementById("tela");
  var parada = document.getElementById("parada");
  var legenda = document.getElementById("legenda");
  var aviso = document.getElementById("aviso");
  var entrada = document.getElementById("sua-foto");
  var tileUpload = document.getElementById("tile-upload");
  var botoesFoto = document.querySelectorAll("[data-foto]");
  var botoesMatiz = document.querySelectorAll("[data-matiz]");

  // Faixas de matiz (0 a 1) que recebem o vermelho: centro, largura, saturação mínima, valor mínimo.
  var MATIZES = {
    vermelhos: [0.985, 0.05, 0.5, 0.16],
    amarelos: [0.135, 0.045, 0.45, 0.35],
    verdes: [0.3, 0.14, 0.2, 0.08],
    azuis: [0.585, 0.085, 0.4, 0.32]
  };

  var FOTOS = {
    oculos: {
      src: "/reticula/img/oculos.webp",
      parada: "/reticula/img/oculos-tinta.webp",
      legenda: "",
      alt: "Guilherme de óculos e moletom, de perfil, com o céu em vermelho chapado e o resto em preto e branco.",
      matiz: "azuis",
      foco: [0.5, 0.36]
    },
    barco: {
      src: "/reticula/img/barco.webp",
      parada: "/reticula/img/barco-tinta.webp",
      legenda: "",
      alt: "Guilherme sentado num barco, olhando pro lado, com a mata em vermelho e preto atrás dele.",
      matiz: "verdes",
      teto: 0.5, // a bandeira tem o mesmo matiz da mata, mas é bem mais clara: fica de fora do vermelho
      foco: [0.42, 0.58]
    },
    doflamingo: {
      src: "/reticula/img/doflamingo.webp",
      parada: "/reticula/img/doflamingo-tinta.webp",
      legenda: "Imagem gerada com IA, não é foto.",
      alt: "Imagem gerada com IA: homem de terno e casaco de penas, com o terno em vermelho chapado e as penas em preto e branco.",
      matiz: "vermelhos",
      foco: [0.5, 0.32]
    }
  };

  var LADO_MAXIMO = 2048;

  var VERTICE = [
    "attribute vec2 aPos;",
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);",
    "  gl_Position = vec4(aPos, 0.0, 1.0);",
    "}"
  ].join("\n");

  var FRAGMENTO = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif",
    "varying vec2 vUv;",
    "uniform sampler2D uFoto;",   // foto no tamanho da tela
    "uniform sampler2D uLisa;",   // foto reduzida ao tamanho da trama: dá o tom sem sujeira
    "uniform sampler2D uMedia;",  // foto bem pequena e borrada: dá a média de cada região
    "uniform vec2 uRes;",
    "uniform float uCelula;",     // tamanho da trama, em pixels
    "uniform vec3 uNiveis;",      // preto, branco e gama da foto, medidos no JS
    "uniform vec4 uMatiz;",       // centro, largura, saturação mínima, valor mínimo
    "uniform float uTeto;",       // brilho acima disso não recebe vermelho
    "uniform vec3 uRevela;",      // x, y e raio do círculo de cor, em pixels

    "const vec3 PAPEL = vec3(0.957, 0.941, 0.902);",
    "const vec3 TINTA = vec3(0.039, 0.039, 0.043);",
    "const vec3 VERMELHO = vec3(0.871, 0.106, 0.082);",

    "float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }",

    "vec3 hsv(vec3 c) {",
    "  float mx = max(c.r, max(c.g, c.b));",
    "  float mn = min(c.r, min(c.g, c.b));",
    "  float d = mx - mn;",
    "  float h = 0.0;",
    "  if (d > 0.0001) {",
    "    if (mx == c.r) h = (c.g - c.b) / d;",
    "    else if (mx == c.g) h = 2.0 + (c.b - c.r) / d;",
    "    else h = 4.0 + (c.r - c.g) / d;",
    "    h = fract(h / 6.0);",
    "  }",
    "  return vec3(h, mx > 0.0 ? d / mx : 0.0, mx);",
    "}",

    // ruído sem seno, que varia menos entre GPUs de celular
    "float sorteio(vec2 p) {",
    "  vec3 q = fract(vec3(p.xyx) * 0.1031);",
    "  q += dot(q, q.yzx + 33.33);",
    "  return fract((q.x + q.y) * q.z);",
    "}",
    "float ruido(vec2 p) {",
    "  vec2 i = floor(p);",
    "  vec2 f = fract(p);",
    "  f = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(sorteio(i), sorteio(i + vec2(1.0, 0.0)), f.x),",
    "             mix(sorteio(i + vec2(0.0, 1.0)), sorteio(i + vec2(1.0, 1.0)), f.x), f.y);",
    "}",

    // linhas diagonais levemente tortas, com grossura que varia ao longo do traço
    "float hachura(vec2 p, vec2 dir, float periodo, float cobertura) {",
    "  float torto = ruido(p / (periodo * 9.0)) * 0.8 + ruido(p / (periodo * 31.0)) * 1.4;",
    "  float d = dot(p, dir) / periodo + torto;",
    "  float id = floor(d);",
    "  float f = abs(fract(d) - 0.5) * 2.0;",
    "  float ao_longo = dot(p, vec2(dir.y, -dir.x)) / (periodo * 7.0);",
    "  float largura = cobertura * (0.72 + 0.56 * ruido(vec2(ao_longo, id * 3.7)));",
    "  float aa = 2.2 / periodo;",
    "  return 1.0 - smoothstep(largura - aa, largura + aa, f);",
    "}",

    // raio em frações da célula; a grade gira 30 graus, como a retícula impressa
    "float grade(vec2 p, float periodo) {",
    "  vec2 q = mat2(0.866, -0.5, 0.5, 0.866) * p / periodo;",
    "  return length(fract(q) - 0.5);",
    "}",
    "float pontos(vec2 p, float periodo, float raio) {",
    "  float aa = 1.3 / periodo;",
    "  return 1.0 - smoothstep(raio - aa, raio + aa, grade(p, periodo));",
    "}",

    "float faixa(float t, float limite) { return smoothstep(limite - 0.006, limite + 0.006, t); }",

    "void main() {",
    "  vec2 p = gl_FragCoord.xy;",
    "  vec3 foto = texture2D(uFoto, vUv).rgb;",

    // 4. círculo de cor; a borda se desfaz em pontos de retícula
    "  float cor = 0.0;",
    "  if (uRevela.z > 0.5) {",
    "    float d = length(p - uRevela.xy) / uRevela.z;",
    "    float borda = (grade(p, uCelula * 1.15) / 0.7 - 0.5) * 0.3;",
    "    float aa = 1.5 / uRevela.z;",
    "    cor = 1.0 - smoothstep(0.9 - aa, 0.9 + aa, d + borda);",
    "    if (cor > 0.999) { gl_FragColor = vec4(foto, 1.0); return; }",
    "  }",

    // 1. luminância: tom vem da versão suavizada (detalhe menor que a trama só viraria sujeira)
    "  vec2 e1 = uCelula * 0.16 / uRes;",
    "  vec3 anel = (texture2D(uFoto, vUv + vec2(e1.x, 0.0)).rgb + texture2D(uFoto, vUv - vec2(e1.x, 0.0)).rgb",
    "             + texture2D(uFoto, vUv + vec2(0.0, e1.y)).rgb + texture2D(uFoto, vUv - vec2(0.0, e1.y)).rgb) * 0.25;",
    "  vec3 lisa = texture2D(uLisa, vUv).rgb;",
    "  vec3 media = texture2D(uMedia, vUv).rgb;",
    "  float fino = luma(mix(foto, anel, 0.6));",
    "  float suave = luma(lisa);",
    "  float base = mix(suave, fino, mix(0.3, 0.8, smoothstep(0.45, 0.68, suave)));",
    "  float t = clamp((base - uNiveis.x) / max(uNiveis.y - uNiveis.x, 0.05), 0.0, 1.0);",
    "  t = pow(t, uNiveis.z);",
    "  t += (base - luma(media)) * 0.9;",
    "  t = clamp((t - 0.5) * 1.3 + 0.5, 0.0, 1.0);",

    // pele sobe de tom: rosto de mangá é quase todo branco, a sombra é que desenha
    "  vec3 cl = hsv(lisa);",
    "  float pele = smoothstep(0.015, 0.035, cl.x) * (1.0 - smoothstep(0.095, 0.125, cl.x))",
    "             * smoothstep(0.14, 0.24, cl.y) * (1.0 - smoothstep(0.58, 0.72, cl.y)) * smoothstep(0.3, 0.42, cl.z);",
    "  t += pele * 0.2;",
    "  t += (ruido(p / (uCelula * 2.5)) - 0.5) * 0.03;",

    // contorno: o lado escuro das bordas fortes vira traço de nanquim
    // nas áreas claras o ruído é menor, então o traço pega dobras mais sutis
    "  float corte = mix(0.05, 0.024, smoothstep(0.55, 0.85, suave));",
    "  float linha = 1.0 - smoothstep(-corte * 1.5, -corte, fino - suave);",

    // 2. faixas: preto sólido, hachura cruzada, hachura, retícula e branco
    "  vec2 d1 = vec2(0.7071, 0.7071);",
    "  vec2 d2 = vec2(0.7071, -0.7071);",
    "  float h1 = hachura(p, d1, uCelula * 0.95, 0.5);",
    "  float h2 = hachura(p, d2, uCelula * 0.95, 0.34);",
    "  float tom = 1.0;",
    "  tom = mix(tom, max(h1, h2), faixa(t, 0.17));",
    "  tom = mix(tom, h1, faixa(t, 0.32));",
    "  tom = mix(tom, pontos(p, uCelula, mix(0.38, 0.2, clamp((t - 0.5) / 0.28, 0.0, 1.0))), faixa(t, 0.5));",
    "  tom = mix(tom, 0.0, faixa(t, 0.78));",

    // 3. vermelho chapado por matiz; dentro dele só entra preto, pela sombra relativa à região
    "  vec3 c = hsv(mix(lisa, anel, 0.35));",
    "  float dh = abs(c.x - uMatiz.x);",
    "  dh = min(dh, 1.0 - dh);",
    "  float m = (1.0 - smoothstep(uMatiz.y, uMatiz.y + 0.015, dh))",
    "          * smoothstep(uMatiz.z, uMatiz.z + 0.06, c.y)",
    "          * smoothstep(uMatiz.w, uMatiz.w + 0.03, c.z)",
    "          * (1.0 - smoothstep(uTeto - 0.03, uTeto, c.z));",
    "  m = smoothstep(0.42, 0.58, m);",
    "  float rel = mix(cl.z, fino, 0.3) / clamp(hsv(media).z, 0.06, 0.45);",
    "  float sombra = mix(hachura(p, d1, uCelula * 0.95, 0.46), 1.0, 1.0 - faixa(rel, 0.62));",
    "  sombra = mix(sombra, 0.0, faixa(rel, 0.8));",

    "  float tinta = max(mix(tom, sombra, m), linha);",
    "  vec3 fundo = mix(PAPEL, VERMELHO, m);",
    "  vec3 ink = mix(fundo, TINTA, tinta);",
    "  gl_FragColor = vec4(mix(ink, foto, cor), 1.0);",
    "}"
  ].join("\n");

  var gl = null;
  var prog = null;
  var unif = {};
  var texFoto = null;
  var texLisa = null;
  var texMedia = null;

  var fonte = null;       // imagem original (HTMLImage ou ImageBitmap)
  var fonteW = 0;
  var fonteH = 0;
  var fotoAtual = null;   // chave de FOTOS, ou null quando é a foto do visitante
  var matizAtual = "vermelhos";
  var niveis = [0, 1, 1];
  var cache = {};
  var pedido = 0;         // descarta carregamento antigo quando a pessoa troca rápido

  var dpr = 1;
  var telaW = 0;          // canvas em pixels de verdade
  var telaH = 0;
  var cssW = 0;
  var cssH = 0;
  var raioBase = 0;
  var celula = 8;

  var alvo = { x: 0, y: 0, r: 0 };
  var atual = { x: 0, y: 0, r: 0 };
  var caixaAnterior = null;
  var raf = 0;
  var ultimo = 0;
  var pronto = false;
  var interagiu = false;
  var intro = null;       // volta única do círculo ao abrir, pra mostrar o que a página faz
  var introFeita = false;
  var atualTexto = "";
  var atualDescricao = "";
  var atualTeto = 0;

  /* ---------- WebGL ---------- */
  function compilar(tipo, codigo) {
    var s = gl.createShader(tipo);
    gl.shaderSource(s, codigo);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) || "shader não compilou");
    }
    return s;
  }

  function criarTextura() {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function iniciarGL() {
    var opcoes = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true };
    gl = canvas.getContext("webgl", opcoes) || canvas.getContext("experimental-webgl", opcoes);
    if (!gl) return false;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compilar(gl.VERTEX_SHADER, VERTICE));
      gl.attachShader(prog, compilar(gl.FRAGMENT_SHADER, FRAGMENTO));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("programa não linkou");
    } catch (e) {
      gl = null;
      return false;
    }
    gl.useProgram(prog);

    var vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    ["uFoto", "uLisa", "uMedia", "uRes", "uCelula", "uNiveis", "uMatiz", "uTeto", "uRevela"].forEach(function (n) {
      unif[n] = gl.getUniformLocation(prog, n);
    });
    gl.uniform1i(unif.uFoto, 0);
    gl.uniform1i(unif.uMedia, 1);
    gl.uniform1i(unif.uLisa, 2);

    gl.activeTexture(gl.TEXTURE0);
    texFoto = criarTextura();
    gl.activeTexture(gl.TEXTURE1);
    texMedia = criarTextura();
    gl.activeTexture(gl.TEXTURE2);
    texLisa = criarTextura();
    return true;
  }

  /* ---------- preparo da imagem ---------- */
  // Reduz em etapas pela metade: reduzir de uma vez só serrilha, e a trama vira ruído.
  function reduzir(img, srcW, srcH, w, h) {
    var atualImg = img;
    var cw = srcW;
    var ch = srcH;
    while (cw > w * 2 || ch > h * 2) {
      var nw = Math.max(w, Math.round(cw / 2));
      var nh = Math.max(h, Math.round(ch / 2));
      var passo = document.createElement("canvas");
      passo.width = nw;
      passo.height = nh;
      var pc = passo.getContext("2d");
      pc.imageSmoothingQuality = "high";
      pc.drawImage(atualImg, 0, 0, nw, nh);
      atualImg = passo;
      cw = nw;
      ch = nh;
    }
    var fim = document.createElement("canvas");
    fim.width = w;
    fim.height = h;
    var ctx = fim.getContext("2d");
    ctx.fillStyle = "#fff"; // PNG transparente vira papel
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(atualImg, 0, 0, w, h);
    return fim;
  }

  // Borra três vezes com uma caixa 3x3, pra média por região não mostrar a grade dos pixels ao ampliar.
  function borrar(px, w, h) {
    var saida = new Uint8ClampedArray(px.length);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var r = 0, g = 0, b = 0, n = 0;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            var yy = y + dy, xx = x + dx;
            if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
            var i = (yy * w + xx) * 4;
            r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
          }
        }
        var o = (y * w + x) * 4;
        saida[o] = r / n; saida[o + 1] = g / n; saida[o + 2] = b / n; saida[o + 3] = 255;
      }
    }
    return saida;
  }

  // Preto e branco de verdade da foto, e gama que leva o tom mediano pro meio das faixas.
  function medirNiveis(px) {
    var hist = new Uint32Array(256);
    var total = px.length / 4;
    for (var i = 0; i < px.length; i += 4) {
      hist[Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])]++;
    }
    var soma = 0, lo = 0, hi = 255, med = 128;
    for (var k = 0; k < 256; k++) {
      var antes = soma;
      soma += hist[k];
      if (antes < total * 0.02 && soma >= total * 0.02) lo = k;
      if (antes < total * 0.5 && soma >= total * 0.5) med = k;
      if (antes < total * 0.98 && soma >= total * 0.98) hi = k;
    }
    var mediano = Math.min(0.95, Math.max(0.05, (med - lo) / Math.max(hi - lo, 12)));
    var gama = Math.min(1.15, Math.max(0.6, Math.log(0.5) / Math.log(mediano)));
    return [lo / 255, Math.max(hi, lo + 12) / 255, gama];
  }

  // Foto sem indicação: se tem vermelho de verdade fica nele, senão vai na cor que mais aparece.
  function escolherMatiz(px) {
    var pesos = { vermelhos: 0, amarelos: 0, verdes: 0, azuis: 0 };
    var total = px.length / 4;
    for (var i = 0; i < px.length; i += 4) {
      var r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (d < 0.001 || mx === 0) continue;
      var h = mx === r ? (g - b) / d : mx === g ? 2 + (b - r) / d : 4 + (r - g) / d;
      h = ((h / 6) % 1 + 1) % 1;
      var s = d / mx;
      for (var nome in MATIZES) {
        var m = MATIZES[nome];
        var dh = Math.abs(h - m[0]);
        dh = Math.min(dh, 1 - dh);
        if (dh <= m[1] && s >= m[2] && mx >= m[3]) pesos[nome]++;
      }
    }
    if (pesos.vermelhos / total > 0.03) return "vermelhos";
    var melhor = "vermelhos", maior = 0;
    for (var chave in pesos) {
      if (pesos[chave] > maior) { maior = pesos[chave]; melhor = chave; }
    }
    return melhor;
  }

  function subirMedia() {
    var lado = 72;
    var w = fonteW >= fonteH ? lado : Math.max(8, Math.round(lado * fonteW / fonteH));
    var h = fonteW >= fonteH ? Math.max(8, Math.round(lado * fonteH / fonteW)) : lado;
    var pequena = reduzir(fonte, fonteW, fonteH, w, h);
    var ctx = pequena.getContext("2d");
    var dados = ctx.getImageData(0, 0, w, h);
    var analise = new Uint8ClampedArray(dados.data);
    var px = analise;
    for (var i = 0; i < 3; i++) px = borrar(px, w, h);
    dados.data.set(px);
    ctx.putImageData(dados, 0, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texMedia);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, pequena);
    niveis = medirNiveis(analise);
    gl.uniform3f(unif.uNiveis, niveis[0], niveis[1], niveis[2]);
    return analise;
  }

  function subirFoto() {
    var w = Math.min(telaW, fonteW);
    var h = Math.min(telaH, fonteH);
    if (w * fonteH > h * fonteW) w = Math.round(h * fonteW / fonteH);
    else h = Math.round(w * fonteH / fonteW);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texFoto);
    var nitida = reduzir(fonte, fonteW, fonteH, Math.max(1, w), Math.max(1, h));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, nitida);
    var passo = Math.max(1.5, celula * 0.72);
    var lisa = reduzir(nitida, nitida.width, nitida.height, Math.max(1, Math.round(nitida.width / passo)), Math.max(1, Math.round(nitida.height / passo)));
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texLisa);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, lisa);
  }

  /* ---------- medida ---------- */
  // Legenda e dica ficam presas aos cantos da imagem, não às faixas pretas em volta dela.
  function marcarFolga(w, h) {
    palco.style.setProperty("--folga-x", Math.max(0, Math.floor((palco.clientWidth - w) / 2)) + "px");
    palco.style.setProperty("--folga-y", Math.max(0, Math.floor((palco.clientHeight - h) / 2)) + "px");
  }

  function medir() {
    if (!fonte) return false;
    var caixaW = palco.clientWidth;
    var caixaH = palco.clientHeight;
    if (!caixaW || !caixaH) return false;
    var escala = Math.min(caixaW / fonteW, caixaH / fonteH);
    var novoW = Math.max(1, Math.round(fonteW * escala));
    var novoH = Math.max(1, Math.round(fonteH * escala));
    var novoDpr = Math.min(window.devicePixelRatio || 1, 2);
    var limite = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 4096);
    var fator = Math.min(1, limite / Math.max(novoW * novoDpr, novoH * novoDpr));
    var pxW = Math.round(novoW * novoDpr * fator);
    var pxH = Math.round(novoH * novoDpr * fator);
    canvas.style.width = novoW + "px";
    canvas.style.height = novoH + "px";
    marcarFolga(novoW, novoH);
    if (pxW === telaW && pxH === telaH) return false;
    telaW = pxW;
    telaH = pxH;
    cssW = novoW;
    cssH = novoH;
    dpr = pxW / novoW;
    canvas.width = pxW;
    canvas.height = pxH;
    gl.viewport(0, 0, pxW, pxH);
    gl.uniform2f(unif.uRes, pxW, pxH);
    var menor = Math.min(novoW, novoH);
    celula = Math.min(9, Math.max(4.6, menor / 92)) * dpr;
    gl.uniform1f(unif.uCelula, celula);
    raioBase = Math.max(70, Math.min(menor * 0.24, 190)) * dpr;
    return true;
  }

  /* ---------- desenho ---------- */
  function pintar(x, y, r) {
    // gl_FragCoord cresce de baixo pra cima
    gl.uniform3f(unif.uRevela, x, telaH - y, r);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function desenharTudo() {
    gl.disable(gl.SCISSOR_TEST);
    pintar(atual.x, atual.y, atual.r);
    caixaAnterior = caixaDoCirculo();
  }

  function caixaDoCirculo() {
    if (atual.r < 0.5) return null;
    var a = atual.r * 1.18 + celula;
    return [atual.x - a, atual.y - a, atual.x + a, atual.y + a];
  }

  // Só repinta o que o círculo tocou: é o que segura a conta em GPU fraca e em WebGL por software.
  function desenharParcial() {
    var nova = caixaDoCirculo();
    var c = caixaAnterior;
    if (!nova && !c) return;
    var a = c && nova ? [Math.min(c[0], nova[0]), Math.min(c[1], nova[1]), Math.max(c[2], nova[2]), Math.max(c[3], nova[3])] : (nova || c);
    var x0 = Math.max(0, Math.floor(a[0]));
    var y0 = Math.max(0, Math.floor(a[1]));
    var x1 = Math.min(telaW, Math.ceil(a[2]));
    var y1 = Math.min(telaH, Math.ceil(a[3]));
    caixaAnterior = nova;
    if (x1 <= x0 || y1 <= y0) return;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(x0, telaH - y1, x1 - x0, y1 - y0);
    pintar(atual.x, atual.y, atual.r);
    gl.disable(gl.SCISSOR_TEST);
  }

  function agendar() {
    if (!raf && !document.hidden && pronto) raf = requestAnimationFrame(quadro);
  }

  function quadro(agora) {
    raf = 0;
    var dt = Math.min(agora - (ultimo || agora - 16), 100) / 1000;
    ultimo = agora;

    if (intro) {
      if (!intro.inicio) intro.inicio = agora;
      var f = (agora - intro.inicio) / 2400;
      if (f >= 1) {
        intro = null;
        alvo.r = 0;
      } else {
        var ang = f * Math.PI * 2 - Math.PI / 2;
        alvo.x = (intro.x + Math.cos(ang) * 0.1) * telaW;
        alvo.y = (intro.y + Math.sin(ang) * 0.06) * telaH;
        alvo.r = raioBase;
      }
    }

    // inércia independente da taxa de quadros: a 15 fps o círculo chega no mesmo tempo
    var k = reduced ? 1 : 1 - Math.exp(-dt * 11);
    var kr = reduced ? 1 : 1 - Math.exp(-dt * 8);
    atual.x += (alvo.x - atual.x) * k;
    atual.y += (alvo.y - atual.y) * k;
    atual.r += (alvo.r - atual.r) * kr;
    var parado = Math.abs(alvo.x - atual.x) < 0.4 && Math.abs(alvo.y - atual.y) < 0.4 && Math.abs(alvo.r - atual.r) < 0.4;
    if (parado) {
      atual.x = alvo.x;
      atual.y = alvo.y;
      atual.r = alvo.r;
    }
    desenharParcial();
    if (!parado || intro) agendar();
    else ultimo = 0;
  }

  /* ---------- trocar imagem ---------- */
  function atualizarBotoes() {
    botoesFoto.forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-foto") === fotoAtual ? "true" : "false");
    });
    if (tileUpload) tileUpload.classList.toggle("ativo", fotoAtual === null && !!fonte);
    botoesMatiz.forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-matiz") === matizAtual ? "true" : "false");
    });
  }

  function aplicarMatiz(nome) {
    matizAtual = nome;
    var m = MATIZES[nome];
    gl.uniform4f(unif.uMatiz, m[0], m[1], m[2], m[3]);
  }

  function usarImagem(img, w, h, texto, matiz, descricao, teto) {
    if (fonte && fonte !== img && fonte.close) fonte.close(); // solta a foto anterior do visitante da memória
    fonte = img;
    intro = null;
    atual.r = 0;
    alvo.r = 0;
    fonteW = w;
    fonteH = h;
    telaW = 0;
    telaH = 0;
    atualTexto = texto;
    atualDescricao = descricao;
    atualTeto = teto || 1.1;
    legenda.textContent = texto;
    palco.classList.toggle("com-ia", fotoAtual === "doflamingo");
    canvas.setAttribute("aria-label", descricao);
    medir();
    var pequena = subirMedia();
    aplicarMatiz(matiz || escolherMatiz(pequena));
    gl.uniform1f(unif.uTeto, atualTeto);
    subirFoto();
    atualizarBotoes();
    desenharTudo();
    if (!pronto) {
      pronto = true;
      palco.classList.add("vivo");
    }
    agendar();
  }

  function carregarPreset(nome) {
    var foto = FOTOS[nome];
    var meu = ++pedido;
    fotoAtual = nome;
    falar("");
    atualizarBotoes();
    function aplicar(img) {
      if (meu !== pedido) return;
      usarImagem(img, img.naturalWidth, img.naturalHeight, foto.legenda, foto.matiz, foto.alt, foto.teto);
      if (!interagiu && !reduced && !introFeita) {
        introFeita = true;
        intro = { x: foto.foco[0], y: foto.foco[1], inicio: 0 };
        atual.x = alvo.x = foto.foco[0] * telaW;
        atual.y = alvo.y = (foto.foco[1] - 0.06) * telaH;
        agendar();
      }
    }
    if (cache[nome]) {
      aplicar(cache[nome]);
      return;
    }
    var img = new Image();
    img.onload = function () {
      cache[nome] = img;
      aplicar(img);
    };
    img.onerror = function () {
      if (meu === pedido) falar("Não consegui carregar essa imagem. Tenta de novo.");
    };
    img.src = foto.src;
  }

  function falar(texto) {
    aviso.textContent = texto;
  }

  // createImageBitmap abre o arquivo sem criar URL nenhuma: a foto só existe na memória desta aba.
  function abrirArquivo(arquivo) {
    if (window.createImageBitmap) return window.createImageBitmap(arquivo);
    return new Promise(function (ok, erro) {
      var url = URL.createObjectURL(arquivo);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        ok(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        erro(new Error("imagem inválida"));
      };
      img.src = url;
    });
  }

  function aoEscolherArquivo() {
    var arquivo = entrada.files && entrada.files[0];
    if (!arquivo) return;
    var meu = ++pedido;
    abrirArquivo(arquivo).then(function (img) {
      if (meu !== pedido) return;
      fotoAtual = null;
      falar("");
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      // foto de celular tem 12 megapixels ou mais; mais de 2048 de lado não aparece e só gasta memória
      var escala = Math.min(1, LADO_MAXIMO / Math.max(w, h));
      var guardada = img;
      if (escala < 1) {
        var nw = Math.max(1, Math.round(w * escala));
        var nh = Math.max(1, Math.round(h * escala));
        guardada = reduzir(img, w, h, nw, nh);
        if (img.close) img.close();
        w = nw;
        h = nh;
      }
      usarImagem(guardada, w, h, "Sua foto, só neste navegador", null, "A foto que você escolheu, em preto, branco e vermelho.");
    }).catch(function () {
      if (meu === pedido) falar("Esse arquivo não abriu aqui. Tenta um JPG, PNG ou WebP.");
    }).then(function () {
      entrada.value = "";
    });
  }

  /* ---------- ponteiro ---------- */
  function posicao(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr };
  }

  function apontar(e, abrir) {
    var p = posicao(e);
    if (abrir && atual.r < 1) {
      // nasce onde o dedo tocou, em vez de vir deslizando do último lugar
      atual.x = p.x;
      atual.y = p.y;
    }
    if (intro) {
      intro = null;
    }
    interagiu = true;
    palco.classList.add("tocado");
    alvo.x = p.x;
    alvo.y = p.y;
    alvo.r = raioBase;
    agendar();
  }

  function fechar() {
    alvo.r = 0;
    agendar();
  }

  function ligarPonteiro() {
    canvas.addEventListener("pointerenter", function (e) {
      if (e.pointerType === "mouse") apontar(e, true);
    });
    canvas.addEventListener("pointermove", function (e) {
      if (e.pointerType === "mouse" || e.buttons || e.pressure > 0) apontar(e, false);
    });
    canvas.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "mouse" && canvas.setPointerCapture) {
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já foi embora */ }
      }
      apontar(e, true);
    });
    canvas.addEventListener("pointerup", function (e) {
      if (e.pointerType !== "mouse") fechar();
    });
    canvas.addEventListener("pointercancel", fechar);
    canvas.addEventListener("pointerleave", function (e) {
      if (e.pointerType === "mouse") fechar();
    });

    // no teclado, o círculo abre com o foco e anda com as setas
    canvas.addEventListener("keyup", function (e) {
      if (e.key === "Tab" && atual.r < 1) {
        interagiu = true;
        intro = null;
        atual.x = alvo.x = telaW / 2;
        atual.y = alvo.y = telaH / 2;
        alvo.r = raioBase;
        palco.classList.add("tocado");
        agendar();
      }
    });
    canvas.addEventListener("keydown", function (e) {
      var passo = Math.max(telaW, telaH) * 0.04;
      var dx = e.key === "ArrowLeft" ? -passo : e.key === "ArrowRight" ? passo : 0;
      var dy = e.key === "ArrowUp" ? -passo : e.key === "ArrowDown" ? passo : 0;
      if (!dx && !dy) return;
      e.preventDefault();
      if (alvo.r < 1) {
        atual.x = alvo.x = telaW / 2;
        atual.y = alvo.y = telaH / 2;
        alvo.r = raioBase;
      }
      alvo.x = Math.max(0, Math.min(telaW, alvo.x + dx));
      alvo.y = Math.max(0, Math.min(telaH, alvo.y + dy));
      interagiu = true;
      intro = null;
      palco.classList.add("tocado");
      agendar();
    });
    canvas.addEventListener("blur", fechar);
  }

  /* ---------- começo ---------- */
  function modoParado() {
    doc.classList.add("sem-webgl");
    function ajustar() {
      if (!parada.naturalWidth) return;
      marcarFolga(parada.clientWidth, parada.clientHeight);
    }
    parada.addEventListener("load", ajustar);
    window.addEventListener("resize", ajustar);
    ajustar();
    botoesFoto.forEach(function (b) {
      b.addEventListener("click", function () {
        var foto = FOTOS[b.getAttribute("data-foto")];
        fotoAtual = b.getAttribute("data-foto");
        parada.src = foto.parada;
        parada.alt = foto.alt;
        legenda.textContent = foto.legenda;
        palco.classList.toggle("com-ia", fotoAtual === "doflamingo");
        atualizarBotoes();
      });
    });
    fotoAtual = botoesFoto[0].getAttribute("data-foto");
    atualizarBotoes();
  }

  function aoRedimensionar() {
    if (!pronto || !fonte) return;
    if (medir()) {
      subirFoto();
      atual.r = 0;
      alvo.r = 0;
      intro = null;
      desenharTudo();
    }
  }

  function comecar() {
    if (!iniciarGL()) {
      modoParado();
      return;
    }

    botoesFoto.forEach(function (b) {
      b.addEventListener("click", function () {
        carregarPreset(b.getAttribute("data-foto"));
      });
    });
    botoesMatiz.forEach(function (b) {
      b.addEventListener("click", function () {
        aplicarMatiz(b.getAttribute("data-matiz"));
        atualizarBotoes();
        if (pronto) desenharTudo();
      });
    });
    entrada.addEventListener("change", aoEscolherArquivo);
    ligarPonteiro();

    var espera = 0;
    function adiar() {
      cancelAnimationFrame(espera);
      espera = requestAnimationFrame(aoRedimensionar);
    }
    if (window.ResizeObserver) new ResizeObserver(adiar).observe(palco);
    else window.addEventListener("resize", adiar);

    // aba oculta não pinta nada; ao voltar, retoma de onde parou
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        ultimo = 0;
      } else if (pronto) {
        desenharTudo();
        agendar();
      }
    });

    canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      pronto = false;
      palco.classList.remove("vivo");
      // enquanto isso fica a versão parada, com a legenda da imagem que está de fato na tela
      var foto = FOTOS[fotoAtual] || FOTOS.oculos;
      parada.src = foto.parada;
      parada.alt = foto.alt;
      legenda.textContent = foto.legenda;
    });
    canvas.addEventListener("webglcontextrestored", function () {
      if (!iniciarGL() || !fonte) return;
      var matiz = matizAtual;
      usarImagem(fonte, fonteW, fonteH, atualTexto, matiz, atualDescricao, atualTeto);
    });

    carregarPreset(botoesFoto[0].getAttribute("data-foto"));
  }

  comecar();
})();
