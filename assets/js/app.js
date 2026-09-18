/* ============================================================
   QIST Platform — shared application layer
   Data strategy: if a QIST API backend is reachable (see
   QIST.apiBase), use it; otherwise run in "static mode" from
   bundled JSON + a localStorage overlay so the site is fully
   functional on GitHub Pages.
   ============================================================ */
const QIST = {
  // Set to a deployed FastAPI URL (e.g. "https://api.qist.org") to go live.
  // Can also be overridden without redeploy: localStorage.setItem('qist_api_url', '...')
  apiBase: localStorage.getItem('qist_api_url') || '',
  apiAlive: false,
  cache: {},

  /* ---------- generic fetch helpers ---------- */
  async detectApi() {
    if (!this.apiBase) return false;
    try {
      const r = await fetch(this.apiBase + '/api/health', { signal: AbortSignal.timeout(2500) });
      this.apiAlive = r.ok;
    } catch (_) { this.apiAlive = false; }
    return this.apiAlive;
  },

  async loadJSON(name) {
    if (this.cache[name]) return this.cache[name];
    const r = await fetch(`data/${name}.json`);
    this.cache[name] = await r.json();
    return this.cache[name];
  },

  /* localStorage overlay: user-created records on the static site */
  overlay(key) {
    try { return JSON.parse(localStorage.getItem('qist_' + key) || '[]'); }
    catch (_) { return []; }
  },
  saveOverlay(key, arr) { localStorage.setItem('qist_' + key, JSON.stringify(arr)); },
  pushOverlay(key, item) {
    const arr = this.overlay(key);
    item.id = item.id || 'loc_' + Date.now() + '_' + Math.floor(Math.random() * 1e5);
    arr.unshift(item);
    this.saveOverlay(key, arr);
    return item;
  },

  /* ---------- domain data ---------- */
  async getPeople() {
    if (this.apiAlive) {
      const r = await fetch(this.apiBase + '/api/people');
      return r.json();
    }
    const base = await this.loadJSON('people');
    const removed = new Set(this.overlay('removed_people'));
    const edits = Object.fromEntries(this.overlay('edited_people').map(p => [p.id, p]));
    const merged = base.filter(p => !removed.has(p.id)).map(p => edits[p.id] ? { ...p, ...edits[p.id] } : p);
    return [...this.overlay('people'), ...merged];
  },

  async getPosts(channel) {
    let posts;
    if (this.apiAlive) {
      const r = await fetch(this.apiBase + '/api/posts' + (channel ? `?channel=${channel}` : ''));
      posts = await r.json();
    } else {
      const base = await this.loadJSON('posts');
      const removed = new Set(this.overlay('removed_posts'));
      posts = [...this.overlay('posts'), ...base.filter(p => !removed.has(p.id))];
      if (channel) posts = posts.filter(p => p.channel === channel);
    }
    return posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  },

  async addPost(post) {
    post.date = post.date || new Date().toISOString().slice(0, 10);
    const u = this.currentUser();
    post.author = u ? u.name : 'Guest';
    if (this.apiAlive) {
      const r = await fetch(this.apiBase + '/api/posts', {
        method: 'POST', headers: this.authHeaders(), body: JSON.stringify(post)
      });
      return r.json();
    }
    return this.pushOverlay('posts', post);
  },

  async getNewsletter() {
    if (this.apiAlive) {
      const r = await fetch(this.apiBase + '/api/newsletter');
      return r.json();
    }
    return this.loadJSON('newsletter');
  },

  channels() {
    return [
      { id: 'jobs',       name: 'Jobs & Vacancies',        em: '💼', desc: 'Academic and industry positions relevant to Kazakhstani researchers — faculty openings, postdocs, PhD studentships, industry R&D roles.' },
      { id: 'grants',     name: 'Research Grants',         em: '🏛️', desc: 'Funding calls, fellowships and grant programmes — national (Kazakhstan MSHE), international (Horizon Europe, NSF, DFG) and private foundations.' },
      { id: 'conferences',name: 'Conferences & Events',    em: '🎓', desc: 'Calls for papers, upcoming conferences, workshops, summer schools and QIST community meetups.' },
      { id: 'collab',     name: 'Collaboration Requests',  em: '🤝', desc: 'Looking for a co-author, a dataset, lab access or a project partner? Post here and find collaborators across the diaspora.' },
      { id: 'general',    name: 'General Discussion',      em: '💬', desc: 'Everything else: advice on applications, life in academia, relocation, announcements and community news.' }
    ];
  },

  /* ---------- auth (demo/static mode uses localStorage; API mode uses JWT) ---------- */
  currentUser() {
    try { return JSON.parse(localStorage.getItem('qist_session') || 'null'); }
    catch (_) { return null; }
  },
  authHeaders() {
    const u = this.currentUser();
    const h = { 'Content-Type': 'application/json' };
    if (u && u.token) h['Authorization'] = 'Bearer ' + u.token;
    return h;
  },

  /* Учётные записи существуют только на сервере.
     Раньше здесь лежали демо-логин и пароль администратора прямо в публичном JS —
     любой посетитель мог войти в админку. Удалено 2026-09-18, см. DECISIONS D-11. */
  authAvailable() { return this.apiAlive; },

  async login(email, password) {
    if (this.apiAlive) {
      const r = await fetch(this.apiBase + '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Invalid credentials');
      const data = await r.json();
      localStorage.setItem('qist_session', JSON.stringify(data));
      return data;
    }
    // Бэкенд недоступен — честно говорим, что входа нет, вместо поддельной сессии.
    throw new Error('NO_BACKEND');
  },

  async register(fields) {
    if (this.apiAlive) {
      const r = await fetch(this.apiBase + '/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields)
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Registration failed');
      const data = await r.json();
      localStorage.setItem('qist_session', JSON.stringify(data));
      return data;
    }
    // Регистрация в localStorage создавала иллюзию аккаунта: данные оставались
    // в браузере посетителя и до нас не доходили. Убрано 2026-09-18.
    throw new Error('NO_BACKEND');
  },

  logout() {
    localStorage.removeItem('qist_session');
    location.href = 'index.html';
  },

  requireRole(role) {
    const u = this.currentUser();
    if (!u || (role === 'admin' && u.role !== 'admin')) {
      location.href = 'login.html?next=' + encodeURIComponent(location.pathname.split('/').pop());
      return null;
    }
    return u;
  },

  /* ---------- UI helpers ---------- */
  initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  },
  avatarColor(name) {
    const palette = ['#2c4a77', '#2e6e62', '#7a4a2c', '#5a3d6e', '#a33a3a', '#1f6079', '#6e662e'];
    let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return palette[h % palette.length];
  },
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 3200);
  },

  personCard(p, opts = {}) {
    const tags = (p.topics || []).map(t =>
      `<span class="tag" data-topic="${this.esc(t)}">${this.esc(t)}</span>`).join('');
    return `
    <div class="card person-card" data-id="${this.esc(p.id)}">
      <div class="top">
        <div class="avatar" style="background:${this.avatarColor(p.name)}">${this.initials(p.name)}</div>
        <div>
          <h3>${this.esc(p.name)}</h3>
          <div class="role">${this.esc(p.title || '')}${p.institution ? ' · ' + this.esc(p.institution) : ''}</div>
          ${(p.city || p.country) ? `<div class="loc">${this.hasPreciseGeo(p) ? '📍' : '🌐'} ${this.esc(this.geoLabel(p))}</div>` : ''}
          ${p.possible_duplicate_of ? '<div class="loc" style="color:var(--red)">возможный дубликат записи — на проверке</div>' : ''}
        </div>
      </div>
      <div class="tags">${tags}</div>
      ${opts.footer || ''}
    </div>`;
  },

  /* ---------- shared chrome ---------- */
  renderHeader(active) {
    const u = this.currentUser();
    // Публичное меню — только объекты, не аудитории. См. DECISIONS.md D-01.
    // map.html и matching.html намеренно не в меню: карта — это вид внутри
    // Researchers, подбор персонален и живёт за входом.
    const links = [
      ['index.html', 'Home'], ['opportunities.html', 'Opportunities'],
      ['directory.html', 'Researchers'], ['about.html', 'About QIST']
    ];
    const nav = links.map(([href, label]) =>
      `<a href="${href}" class="${active === href ? 'active' : ''}">${label}</a>`).join('');
    const auth = u
      ? `<a class="btn btn-ghost btn-sm" href="profile.html">👤 ${this.esc(u.name.split(' ')[0])}</a>
         ${u.role === 'admin' ? '<a class="btn btn-primary btn-sm" href="admin.html">Admin</a>' : ''}
         <button class="btn btn-ghost btn-sm" onclick="QIST.logout()">Sign out</button>`
      : `<a class="btn btn-ghost btn-sm" href="login.html">Sign in</a>
         <a class="btn btn-primary btn-sm" href="login.html#register">Join QIST</a>`;
    document.getElementById('site-header').innerHTML = `
      <div class="container">
        <a class="brand" href="index.html"><span class="seal">Q</span> QIST</a>
        <button class="nav-toggle" onclick="document.querySelector('.main-nav').classList.toggle('open')">☰</button>
        <nav class="main-nav">${nav}</nav>
        <div class="nav-auth">${auth}</div>
      </div>`;
  },

  renderFooter() {
    const el = document.getElementById('site-footer');
    if (!el) return;
    el.innerHTML = `
      <div class="container">
        <div class="cols">
          <div>
            <h4>QIST — Qazaq International Science and Technology Association</h4>
            <p class="small">The global community of researchers, PhD students, postdocs, professors and
            industry experts from Kazakhstan working in 30+ countries. We connect scholars, share
            opportunities and promote Qazaq science worldwide. <a href="https://qista.org" style="display:inline" target="_blank" rel="noopener">qista.org</a></p>
          </div>
          <div>
            <h4>Platform</h4>
            <a href="directory.html?view=map">Researcher map</a>
            <a href="directory.html">People directory</a>
            <a href="opportunities.html">Opportunities</a>
            <a href="matching.html">Academic matching</a>
          </div>
          <div>
            <h4>Community</h4>
            <a href="newsletter.html">Newsletter</a>
            <a href="channels.html?c=jobs">Jobs board</a>
            <a href="channels.html?c=grants">Grants</a>
            <a href="login.html#register">Become a member</a>
          </div>
        </div>
        <div class="fine">© ${new Date().getFullYear()} QIST community · Built by and for Kazakhstani researchers · <a href="https://github.com/Zangir/qist-platform" style="display:inline">Source on GitHub</a></div>
      </div>`;
  },

  /* ---------- QIST primary research fields ----------
     The canonical list researchers pick from. Keep this array as the
     single source of truth — the map, directory and matching pages all
     read it from here.

     Records may carry their own value:
       p.primaryField  = "Neuroscience"
       p.primaryFields = ["Neuroscience", "Biomedical Sciences, and Medicine"]
     When neither is set, classify() infers fields from the free-text
     `topics` and `title` already in data/people.json. That inference is a
     bridge for the 497 legacy records, not a permanent answer: ask people
     to choose their field at registration and store it on the record.
     ------------------------------------------------------------------ */
  PRIMARY_FIELDS: [
    'Artificial Intelligence',
    'Computer Science',
    'Data Science, and Statistics',
    'Cybersecurity, and Digital Technologies',
    'Robotics',
    'Engineering',
    'Electronics',
    'Materials Science',
    'Physics and Physical Sciences',
    'Mathematics and Computational Sciences',
    'Chemistry and Chemical Sciences',
    'Astronomy, Space Science',
    'Biology and Life Sciences',
    'Biotechnology, Genetics, and Bioinformatics',
    'Biomedical Sciences, and Medicine',
    'Neuroscience',
    'Pharmaceutical Sciences',
    'Public Health, Epidemiology',
    'Environmental Science',
    'Earth Sciences and Geosciences',
    'Energy, Renewable Energy',
    'Agriculture and Food Science',
    'Veterinary Sciences',
    'Economics',
    'Management, Entrepreneurship, Innovation',
    'Education, and Learning Sciences',
    'Law, Legal Studies, and Governance',
    'Politics, International Relations, and Public Policy',
    'Social Sciences',
    'Behavioral Sciences',
    'Communication and Media',
    'Architecture, and Design',
    'Arts, and Humanities',
    'Interdisciplinary Research',
    'Other Research Area'
  ],

  // keyword rules, evaluated against `topics` + `title` only (bios are too noisy)
  FIELD_RULES: [
    ['Artificial Intelligence', /\b(a\.?i\.?|artificial intelligence|machine learning|deep learning|llms?|large language models?|nlp|natural language processing|neural networks?|computer vision|generative ai|edge ai|ai accelerators|word embeddings|semantic parsing|multimodal ai|vision.language|kazllm|reasoning)\b/],
    ['Computer Science', /\b(computer science|software engineer|programming|algorithms?|computer engineering|computer graphics|devops|hci|human.computer interaction|media computer science|computational linguist|informatics)\b/],
    ['Data Science, and Statistics', /\b(data science|data analysis|data analytics|statistic|biostatistic|big data|econometric|bayesian|analytics|quantitat\w+ analys|data.driven|predictive modeling)\b/],
    ['Cybersecurity, and Digital Technologies', /\b(cyber ?security|syber security|information security|network security|blockchain|digital transformation|digital technolog|data protection|digital ethics|digital health algorithms)\b/],
    ['Robotics', /\b(robot\w*|human.robot|industrial automation|cyber.physical|intelligent control|drone technolog)\b/],
    ['Engineering', /\b(engineering|engineer\b|mechanical|civil\b|tribology|manufacturing|metrology|hydraulic|thermal.fluid|combustion|aerospace|transport\w* engineer|surface engineering|biomechanics|construction)\b/],
    ['Electronics', /\b(electronic\w*|semiconductor|integrated circuit|microelectrode|photonic|optoelectronic|electrical engineering|medium voltage|signal processing|wireless communication|fiber optic|sensing)\b/],
    ['Materials Science', /\b(material\w*|nanomaterial|nanotechnolog|nanoscience|polymer|coatings|corrosion|composite|perovskite|graphene|biomaterial|metallurg|ceramic|additive manufacturing|3d printing)\b/],
    ['Physics and Physical Sciences', /\b(physic\w*|optics|spectroscopy|quantum|laser|plasma|condensed matter|terahertz|nonlinear optics|gravitation|accelerator|ultrafast|topological insulators)\b/],
    ['Mathematics and Computational Sciences', /\b(mathematic\w*|mathemeatics|math\b|algebra|differential equations|pdes?|functional analysis|spectral theory|optimal stopping|optimization|game theory|integrable systems|computational (science|economics|materials|biology|microbiology)|inverse problems|navier.stokes)\b/],
    ['Chemistry and Chemical Sciences', /\b(chemistry|chemical\w*|catalysis|electrochemi\w*|organometallic|supramolecular|sorption|mass spectrometry|ssnmr|nmr\b|photocatalysis|cheminformatics|xps|xrd)\b/],
    ['Astronomy, Space Science', /\b(astronom\w*|astrophysic\w*|cosmolog\w*|space\b|nasa|black holes?|primordial|universe|satellite)\b/],
    ['Biology and Life Sciences', /\b(biolog\w*|life science\w*|microbiolog\w*|cell (biology|therapy|signaling)|plant\b|evolution|evo.devo|embryolog\w*|physiolog\w*|redox biology|mitophagy|parasitolog\w*)\b/],
    ['Biotechnology, Genetics, and Bioinformatics', /\b(biotech\w*|genetic\w*|genomic\w*|bioinformatic\w*|synthetic biology|gene therapy|epigenetic\w*|proteomic\w*|metagenomic\w*|dna|rna\b|stem cells?|protein (engineering|biomarker)|enetics)\b/],
    ['Biomedical Sciences, and Medicine', /\b(medicine|medical|biomedic\w*|biomedicine|clinical|oncolog\w*|cancer|cardio\w*|surger\w*|surgeon|immuno\w*|diabet\w*|nephrolog\w*|patholog\w*|radiolog\w*|pediatric\w*|obstetric\w*|gynecolog\w*|ophthalmolog\w*|anesthes\w*|hematolog\w*|md\b|patient|disease\w*|therapy|tissue engineering|regenerative medicine|vaccin\w*|nursing|dialysis|transplantation|endocrin\w*|rheumato\w*|dermatolog\w*|otolaryngolog\w*)\b/],
    ['Neuroscience', /\b(neuroscience|neurolog\w*|neurosurg\w*|neuromodulation|neurorehab\w*|neuroimaging|neurodegeneration|brain|parkinson\w*|alzheimer\w*|cognitive neuro\w*|dbs\b|eeg|fmri|stroke)\b/],
    ['Pharmaceutical Sciences', /\b(pharmac\w*|drug (discovery|delivery)|biopharma\w*|pharma\b|mucoadhesive)\b/],
    ['Public Health, Epidemiology', /\b(public health\w*|publich? healt|epidemiolog\w*|health (policy|polic\w*|system\w*|equity|financing|literacy|communication|awareness)|global health|nutrition|hpv|screening|biosafety)\b/],
    ['Environmental Science', /\b(environment\w*|sustainab\w*|climate|pollution|waste\w*|water (quality|purification|resources|treatment|technolog\w*)|circular\w*|life cycle assessment|carbon capture|co.?2|emissions|sewage|wastewater|ccs\b)\b/],
    ['Earth Sciences and Geosciences', /\b(geolog\w*|geophys\w*|geoscience\w*|earth (science|observation)|geodesy|gnss|seismic|hydrolog\w*|glaciolog\w*|glacier|soil\b|mining|oceanograph\w*|remote sensing|gis\b|petrol\b|oil ?& ?gas|rare earth|ore enrichment)\b/],
    ['Energy, Renewable Energy', /\b(energy|renewable|solar|hydrogen|batter\w+|lithium|photovoltaic|smart grid\w*|e.fuel|biofuel\w*|nuclear\b|wind\b|bess\b|fcr\b)\b/],
    ['Agriculture and Food Science', /\b(agricultur\w*|agro\w*|food\b|crop\w*|fertiliz\w*|precision agriculture|forestry|rural development|honey)\b/],
    ['Veterinary Sciences', /\b(veterinar\w*|animal health)\b/],
    ['Economics', /\b(economic\w*|economist|economics|finance|financial|macroeconom\w*|monetary|trade\b|banking|accounting|fintech|equity valuation|market.data)\b/],
    ['Management, Entrepreneurship, Innovation', /\b(management|manager|entrepreneur\w*|innovation|business|leadership|hrm\b|human capital|marketing|branding|strategy|strategic|startup|consulting|project management|supply chain|logistics|corporate governance|csr\b|people analytics|productivity|hospitality|tourism)\b/],
    ['Education, and Learning Sciences', /\b(education\w*|educator|teach\w*|learning|pedagog\w*|curriculum|school\b|edtech|literacy|college (access|success|counseling)|academic mobility|mentoring)\b/],
    ['Law, Legal Studies, and Governance', /\b(law\b|legal\b|governance|human rights|regulation\b|compliance|civil service|public administration)\b/],
    ['Politics, International Relations, and Public Policy', /\b(politic\w*|international relations|public policy|policy\b|diplomacy|foreign policy|geopolit\w*|security studies|elite studies|migration|development studies|eurasia|institutional development)\b/],
    ['Social Sciences', /\b(social science\w*|sociolog\w*|social polic\w*|anthropolog\w*|human geography|gender|social\b|demograph\w*)\b/],
    ['Behavioral Sciences', /\b(behavio\w*|psycholog\w*|cognitive|consumer behavior|well.being|burnout|affective touch)\b/],
    ['Communication and Media', /\b(communication|media\b|journalis\w*|public relations|social media)\b/],
    ['Architecture, and Design', /\b(architect\w*|design\b|urban (planning|road|forestry)|built environment|smart buildings|robotic fabrication)\b/],
    ['Arts, and Humanities', /\b(arts?\b|humanities|histor\w*|philosoph\w*|literature|language\w*|culture|cultural heritage|museum\w*|islamic studies|linguist\w*)\b/],
    ['Interdisciplinary Research', /\b(interdisciplinar\w*|multidisciplinar\w*|transdisciplinar\w*)\b/]
  ],

  _fieldCache: new WeakMap(),

  /* Returns the canonical field(s) for a person, always at least one. */
  primaryFields(p) {
    if (!p || typeof p !== 'object') return ['Other Research Area'];

    // 1. an explicit value on the record always wins
    const explicit = []
      .concat(p.primaryFields || [])
      .concat(p.primaryField ? [p.primaryField] : [])
      .filter(f => this.PRIMARY_FIELDS.indexOf(f) > -1);
    if (explicit.length) return explicit;

    // 2. otherwise infer, and remember the answer
    if (this._fieldCache.has(p)) return this._fieldCache.get(p);
    const hay = ((p.topics || []).join(' ') + ' ' + (p.title || '')).toLowerCase();
    const hits = [];
    for (const [field, re] of this.FIELD_RULES) {
      if (re.test(hay)) hits.push(field);
    }
    const out = hits.length ? hits.slice(0, 4) : ['Other Research Area'];
    this._fieldCache.set(p, out);
    return out;
  },

  /* Convenience: the single best field, for badges and cards. */
  primaryField(p) { return this.primaryFields(p)[0]; },

  /* { field: count } across a list of people. */
  fieldCounts(people) {
    const counts = {};
    (people || []).forEach(p => this.primaryFields(p).forEach(f => {
      counts[f] = (counts[f] || 0) + 1;
    }));
    return counts;
  },

  /* ================= ВОЗМОЖНОСТИ И ПРАВО УЧАСТИЯ =================
     Данные: data/opportunities.json + data/eligibility.json
     Вердикт никогда не придумывается — он берётся из таблицы programmes
     и всегда сопровождается ссылкой на первоисточник.
     ============================================================== */

  OPPORTUNITY_TYPES: {
    grant:           'Грант и конкурс',
    consortium_role: 'Роль в консорциуме',
    academic_job:    'Академическая вакансия',
    industry_job:    'Индустриальная R&D-позиция',
    coauthor:        'Поиск соавтора',
    rnd_challenge:   'R&D-задача от компании',
    expert_request:  'Запрос экспертизы',
    conference:      'Конференция и публикация'
  },

  FUNDING_LABELS: {
    confirmed:          'финансирование подтверждено',
    not_confirmed:      'финансирование не подтверждено',
    cofunding_required: 'требуется софинансирование'
  },

  // Ранги стадии карьеры: заявленная стадия должна быть не ниже требуемой.
  STAGE_RANK: { any: 0, phd_student: 1, phd_plus: 2, postdoc_plus: 3, pi_only: 4 },

  /* Куда уходит отклик «Интересно».
     Пусто = приём откликов не подключён, и кнопка честно отключается.
     Поддерживается URL формы (Tally / Formspree / свой backend) либо
     "mailto:адрес". См. README.md, раздел «Приём откликов». */
  INTEREST_ENDPOINT: '',

  /* Контакт команды QIST. Используется на about.html для запросов
     «это мой профиль» и «удалите мои данные». Пока пусто — кнопки
     честно отключаются, а не ведут в никуда. */
  CONTACT_EMAIL: '',

  /* Куда уходит запись в пилот и подписка на письмо.
     Может быть тем же URL, что INTEREST_ENDPOINT. Пусто — форма честно
     отключается и не делает вид, что собрала адрес. */
  SIGNUP_ENDPOINT: '',

  async getOpportunities() {
    if (this.apiAlive) {
      try {
        const r = await fetch(this.apiBase + '/api/opportunities');
        if (r.ok) return await r.json();
      } catch (_) { /* падаем на статические данные */ }
    }
    const all = await this.loadJSON('opportunities');
    return all.filter(o => o.status === 'published');
  },

  async getEligibility() { return this.loadJSON('eligibility'); },

  /* Возвращает вердикт по стране. Никогда не бросает исключение:
     неизвестный статус — это тоже честный ответ. */
  checkCountry(opp, countryCode, elig) {
    const key  = (opp.eligibility && opp.eligibility.programme) || 'open';
    const prog = elig.programmes[key] || elig.programmes.open;
    const status = prog.countries[countryCode] || prog.default || 'unknown';
    const def = elig.statuses[status] || elig.statuses.unknown;
    const countryName = elig.countries[countryCode] || 'Ваша страна';
    return {
      status, verdict: def.verdict, label: def.label,
      text: def.text.replace('{country}', countryName),
      programme: prog.name,
      source: prog.source_url ? {
        url: prog.source_url, name: prog.source_name,
        version: prog.source_version, date: prog.source_date
      } : null
    };
  },

  checkStage(opp, userStage) {
    const need = this.STAGE_RANK[opp.career_stage] ?? 0;
    const have = this.STAGE_RANK[userStage] ?? 0;
    return { ok: have >= need, need: opp.career_stage, have: userStage };
  },

  isExpired(opp) {
    if (!opp.deadline) return false;
    return new Date(opp.deadline) < new Date(new Date().toDateString());
  },

  daysLeft(opp) {
    if (!opp.deadline) return null;
    return Math.ceil((new Date(opp.deadline) - new Date()) / 86400000);
  },

  /* Отклик. Возвращает {ok, reason} — вызывающий код сам решает, что показать. */
  /* Общая отправка формы на настроенный endpoint. {ok, reason} */
  async submitForm(endpoint, payload) {
    if (!endpoint) return { ok: false, reason: 'not_configured' };
    if (endpoint.startsWith('mailto:')) {
      const subj = encodeURIComponent(payload._subject || 'ScienceBridge');
      const body = encodeURIComponent(JSON.stringify(payload, null, 2));
      location.href = `${endpoint}?subject=${subj}&body=${body}`;
      return { ok: true, reason: 'mailto' };
    }
    try {
      const r = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return r.ok ? { ok: true, reason: 'posted' } : { ok: false, reason: 'http_' + r.status };
    } catch (_) { return { ok: false, reason: 'network' }; }
  },

  /* Как показывать координаты. 338 записей каталога имеют координаты центра
     страны, а не места работы: города и организации в исходных данных нет.
     Показывать их как точный адрес — значит выдумывать точность. */
  geoLabel(person) {
    const prec = person.geo_precision || (person.city ? 'city' : 'country');
    if (prec === 'city')    return [person.city, person.country].filter(Boolean).join(', ');
    if (prec === 'country') return (person.country || '') + ' · город не указан';
    return 'Местоположение не указано';
  },
  hasPreciseGeo(person) { return (person.geo_precision || (person.city ? 'city' : 'country')) === 'city'; },

  async recordInterest(opp, ctx) {
    return this.submitForm(this.INTEREST_ENDPOINT, {
      _subject: 'Интерес к возможности: ' + opp.title,
      kind: 'opportunity_interest',
      opportunity_id: opp.id, opportunity_title: opp.title,
      country: ctx.country, career_stage: ctx.stage,
      user: (this.currentUser() || {}).email || '',
      at: new Date().toISOString()
    });
  },

  async boot(active) {
    this.renderHeader(active);
    this.renderFooter();
    await this.detectApi();
  }
};
