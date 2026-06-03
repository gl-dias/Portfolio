/* eslint-disable */
/* gl-dias.dev — terminal honesto, dado em vez de hype */

const { useState, useEffect, useRef } = React;

/* ---------- fade-in on scroll ---------- */
function useFadeIn() {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.1, rootMargin: "-30px 0px" }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return [ref, shown];
}

function Fade({ delay = 0, children }) {
  const [ref, shown] = useFadeIn();
  return (
    <div ref={ref} className={shown ? "fade-in" : "fade-init"} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ---------- nav ---------- */
function Nav() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <a href="#" className="nav-logo">
          <span className="dot" />
          gl-dias
          <span style={{ color: "#56575E" }}>.dev</span>
        </a>
        <div className="nav-links">
          <a href="#projetos">projetos</a>
          <a href="#writing">writing</a>
          <a href="#sobre">sobre</a>
          <a href="#contato">contato</a>
        </div>
      </div>
    </nav>
  );
}

/* ---------- hero ---------- */
function Hero() {
  return (
    <section className="hero wrap">
      <Fade>
        <div className="hero-tag">
          <span className="at">●</span>
          <span>guilherme dias batista</span>
          <span style={{ color: "#56575E" }}>·</span>
          <span>rio de janeiro</span>
        </div>
      </Fade>

      <Fade delay={80}>
        <h1 className="hero-headline">
          Construindo <em>SaaS B2B</em>, <em>sites</em> e <em>automações com IA</em>. Pelo caminho mais curto até a coisa certa.
        </h1>
      </Fade>

      <Fade delay={160}>
        <p className="hero-sub">
          Full-stack focado em produto. Faço <strong>SaaS B2B</strong> (RdL, plataforma de editais públicos),
          <strong> sites pra clientes</strong> com captura de leads, e
          <strong> automações com IA</strong> pra processo que se repete demais.
          Stack escolhida por contexto, não por hype.
        </p>
      </Fade>

      <Fade delay={240}>
        <div className="hero-actions">
          <a className="btn btn-primary" href="#projetos">
            ver projetos →
          </a>
          <a className="btn" href="#contato">
            entrar em contato
          </a>
        </div>
      </Fade>
    </section>
  );
}

/* ---------- projetos ---------- */
const PROJECTS = [
  {
    name: "RdL",
    role: "lead",
    roleLabel: "founder · ativo",
    tagline: "Software pra empresas que disputam editais do governo.",
    desc: "SaaS B2B de monitoramento de editais de licitação pública. Pipeline de ingestão de portais oficiais, normalização de modalidades, e alertas por critério de busca. Em construção, com cliente piloto.",
    stack: ["Next.js", "Supabase", "Postgres", "Python (ingestão)", "GitHub Actions"],
    status: "v0 em uso interno · MVP pra fechar Q2",
    href: null,
  },
  {
    name: "Site Prof. Luiz Barbieri",
    role: "client",
    roleLabel: "freela · entregue",
    tagline: "Site profissional pra consultor de cursos, com captura automática de leads.",
    desc: "Site institucional do consultor Prof. Luiz Barbieri. Páginas de cursos, captura de leads e envio automático de materiais. No ar e iterando.",
    stack: ["HTML/CSS", "JS", "Apps Script", "Sheets como CMS"],
    status: "v1 publicada",
    href: "https://barbiericonsulting.pages.dev/",
  },
  {
    name: "Site LFG Tech",
    role: "client",
    roleLabel: "freela · em desenvolvimento",
    tagline: "Site institucional pra empresa de tecnologia.",
    desc: "Em construção, ainda não publicado. O link entra aqui quando o site for ao ar.",
    stack: ["HTML/CSS", "JS"],
    status: "em desenvolvimento",
    href: null,
  },
  {
    name: "Dias",
    role: "draft",
    roleLabel: "pessoal · planejado",
    tagline: "Assistente pessoal por voz que conversa e executa tarefas no computador.",
    desc: "Pra uso próprio. Não responde só (como a Alexa) — executa via Claude Code quando faz sentido. Vault Obsidian como contexto pessoal. Em planejamento detalhado, ainda não iniciado.",
    stack: ["Python", "Claude API", "Whisper", "ChromaDB", "MCP"],
    status: "fase de plano · gate de início definido",
    href: null,
  },
  {
    name: "Bot de trading cripto",
    role: "paused",
    roleLabel: "pausado · case de método",
    tagline: "Testei 6 hipóteses de trading rigorosamente, matei todas, parei no tempo certo.",
    desc: "Engine em 3 camadas (técnica + ML + juiz LLM). 91 dias de walk-forward IS/OOS, 6 hipóteses estruturalmente diferentes refutadas. Pausado depois de provar que não havia edge no regime atual.",
    stack: ["Python", "ccxt", "XGBoost", "Claude API"],
    status: "91 dias de walk-forward · 6 hipóteses refutadas · 0 trades em prod",
    href: "posts/bot-cripto.html",
    hrefLabel: "ler o post completo",
  },
];

function ProjectCard({ p, delay }) {
  return (
    <Fade delay={delay}>
      <div className="proj">
        <div className="proj-head">
          <span className="proj-name">{p.name}</span>
          <span className={"proj-role " + p.role}>{p.roleLabel}</span>
        </div>
        {p.tagline && <p className="proj-tagline">{p.tagline}</p>}
        <p className="proj-desc">{p.desc}</p>
        <div className="proj-meta">
          <span className="stack">
            <span className="stack-label">stack:</span>
            {p.stack.join(" · ")}
          </span>
          <span className="status">· {p.status}</span>
        </div>
        {p.href && (
          <a className="proj-link" href={p.href} target={p.href.startsWith("http") ? "_blank" : "_self"} rel="noopener">
            {p.hrefLabel || "visitar site"} <span className="proj-link-arrow">↗</span>
          </a>
        )}
      </div>
    </Fade>
  );
}

function Projects() {
  return (
    <section id="projetos" className="wrap section">
      <Fade>
        <div className="eyebrow">projetos selecionados</div>
        <h2 style={{ marginBottom: 8 }}>O que tenho em pé hoje.</h2>
        <p style={{ marginBottom: 28, maxWidth: 580 }}>
          Cada item tem papel, status e stack real. Sites de cliente aparecem aqui só
          quando o cliente autoriza — os outros tô tocando sozinho ou em parceria.
        </p>
      </Fade>

      <div className="proj-list">
        {PROJECTS.map((p, i) => (
          <ProjectCard key={p.name} p={p} delay={i * 40} />
        ))}
      </div>
    </section>
  );
}

/* ---------- writing ---------- */
const POSTS = [
  {
    date: "2026-06-02",
    title: "Como lancei um SaaS do zero ao cobrando em dois dias",
    draft: false,
    href: "posts/date-checklist.html",
  },
  {
    date: "2026-05-25",
    title: "Como matei 6 hipóteses de trading cripto e parei no tempo certo",
    draft: false,
    href: "posts/bot-cripto.html",
  },
];

function Writing() {
  return (
    <section id="writing" className="wrap section">
      <Fade>
        <div className="eyebrow">writing</div>
        <h2 style={{ marginBottom: 8 }}>Notas de campo.</h2>
        <p style={{ marginBottom: 28, maxWidth: 580 }}>
          Registro de decisões e pivots. O que funcionou, o que matei cedo, e o método.
          Vai crescer aos poucos.
        </p>
      </Fade>

      <div className="writing">
        {POSTS.map((post, i) => (
          <Fade key={post.title} delay={i * 30}>
            <a className="post" href={post.href}>
              <span className="post-date">{post.date}</span>
              <span className="post-title">
                {post.title}
                {post.draft && <span className="draft-tag">rascunho</span>}
              </span>
              <span className="post-arrow">→</span>
            </a>
          </Fade>
        ))}
      </div>
    </section>
  );
}

/* ---------- stack ---------- */
function Stack() {
  return (
    <section className="wrap section">
      <Fade>
        <div className="eyebrow">ferramentas afiadas, não religião</div>
        <h2 style={{ marginBottom: 8 }}>Stack atual.</h2>
        <p style={{ marginBottom: 28, maxWidth: 580 }}>
          Escolhida por contexto e dor real. Tudo aqui passou por uso de produção ou pesquisa séria.
        </p>
      </Fade>

      <Fade delay={80}>
        <div className="stack-ribbon" style={{ flexDirection: "column", gap: 14 }}>
          <div className="group">
            <span className="group-label">front</span>
            <span className="item">TypeScript</span>
            <span className="item">React</span>
            <span className="item">Next.js</span>
            <span className="item">Tailwind</span>
          </div>
          <div className="group">
            <span className="group-label">back</span>
            <span className="item">Python</span>
            <span className="item">FastAPI</span>
            <span className="item">Node.js</span>
            <span className="item">Postgres</span>
            <span className="item">Supabase</span>
          </div>
          <div className="group">
            <span className="group-label">ia</span>
            <span className="item">Claude API</span>
            <span className="item">MCP servers</span>
            <span className="item">embeddings locais</span>
          </div>
          <div className="group">
            <span className="group-label">ops</span>
            <span className="item">Docker</span>
            <span className="item">GitHub Actions</span>
            <span className="item">Vercel / Cloudflare</span>
          </div>
        </div>
      </Fade>
    </section>
  );
}

/* ---------- about / now ---------- */
function About() {
  return (
    <section id="sobre" className="wrap section">
      <Fade>
        <div className="eyebrow">sobre</div>
        <h2 style={{ marginBottom: 18 }}>Em uma frase.</h2>
        <div className="about">
          <p>
            Dev full-stack do <strong>Rio de Janeiro</strong>, movido por <strong>preguiça produtiva</strong>:
            sempre buscando o caminho mais eficiente pra fazer a coisa certa.
            Dedicado, aprendo com facilidade e gosto de problema técnico denso.
          </p>
          <p>
            Foco atual: <strong>SaaS B2B</strong> (RdL como aposta principal),
            <strong> sites com automação</strong> pra clientes, e
            <strong> IA aplicada</strong> como multiplicador. Universitário em tecnologia,
            com produto, cliente e código rodando.
          </p>
          <p>
            Quando algo trava, prefiro entender antes de buscar solução pronta.
            Quando a solução pronta é a certa, uso sem complicar.
          </p>
        </div>
      </Fade>
    </section>
  );
}

/* ---------- princípio operacional ---------- */
function Principle() {
  return (
    <section className="wrap principle section">
      <Fade>
        <div className="eyebrow">princípio operacional</div>
        <p className="principle-quote">
          <em>Preguiça produtiva.</em> Não é evitar trabalho, é evitar <em>trabalho redundante</em>.
          Refator que poupa 10 horas futuras &gt; script que roda uma vez.
          Hipótese morta cedo &gt; produto vivo sem edge.
        </p>
        <p className="principle-body">
          Por isso testo hipótese cedo, mato a que não passa, e só escalo o que sobrou em pé.
          Refutar uma ideia ruim no papel é mais barato que descobrir ela quebrada em produção.
        </p>
      </Fade>
    </section>
  );
}

/* ---------- contato ---------- */
function Contact() {
  return (
    <section id="contato" className="wrap section">
      <Fade>
        <div className="eyebrow">contato</div>
        <h2 style={{ marginBottom: 18 }}>Aberto pra projeto com escopo claro.</h2>
        <p style={{ marginBottom: 24, maxWidth: 580 }}>
          Foco em <strong>site institucional</strong> (com captura de leads e automação),
          <strong> SaaS B2B</strong> e <strong>automação com IA</strong>.
          Escopo típico: 2 a 12 semanas. Prefiro conversa por email, LinkedIn ou WhatsApp —
          me diz o problema, contexto e prazo.
        </p>
        <div className="contact">
          <div className="contact-line">
            <span className="label">email</span>
            <span className="val"><a href="https://mail.google.com/mail/?view=cm&fs=1&to=guilhermedias.batista@gmail.com&su=Contato%20pelo%20site&body=Ol%C3%A1%20Guilherme%2C%0A%0A" target="_blank" rel="noopener">guilhermedias.batista@gmail.com</a></span>
          </div>
          <div className="contact-line">
            <span className="label">whatsapp</span>
            <span className="val"><a href="https://wa.me/5521998822396" target="_blank" rel="noopener">+55 (21) 99882-2396</a></span>
          </div>
          <div className="contact-line">
            <span className="label">github</span>
            <span className="val"><a href="https://github.com/gl-dias" target="_blank" rel="noopener">github.com/gl-dias</a></span>
          </div>
          <div className="contact-line">
            <span className="label">linkedin</span>
            <span className="val"><a href="https://www.linkedin.com/in/guilherme-dias-838326241/" target="_blank" rel="noopener">linkedin.com/in/guilherme-dias</a></span>
          </div>
          <div className="contact-line">
            <span className="label">instagram</span>
            <span className="val"><a href="https://instagram.com/_gl.dias" target="_blank" rel="noopener">@_gl.dias</a></span>
          </div>
          <div className="contact-line">
            <span className="label">localização</span>
            <span className="val">Rio de Janeiro, BR · remoto</span>
          </div>
        </div>
      </Fade>
    </section>
  );
}

/* ---------- footer ---------- */
function Footer() {
  return (
    <footer className="wrap footer">
      <span>gl-dias.dev · 2026 · feito no editor, sem template</span>
    </footer>
  );
}

/* ---------- app ---------- */
function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Projects />
        <Writing />
        <Stack />
        <About />
        <Principle />
        <Contact />
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
