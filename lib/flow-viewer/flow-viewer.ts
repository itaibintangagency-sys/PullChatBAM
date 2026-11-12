import type { FlowData, FlowNode, Kind, Scenario } from "./types";

/* ───────── konstanta tampilan (satuan: world units, kecuali dinyatakan px) ───────── */

const NS = "http://www.w3.org/2000/svg";
const SEG_SEC = 0.84;          // detik per koneksi pada kecepatan 1× (naikkan = lebih lambat)
const FOLLOW_K = 0.85;         // zoom saat kamera mengikuti pulsa
const MAX_K = 2.4;
const TAIL = 120;              // panjang "ekor komet" (world units)

const KIND_LABEL: Record<Kind, string> = {
  trigger: "Pemicu",
  code: "Olah data",
  decision: "Percabangan",
  data: "Baca / tulis data",
  http: "Panggil layanan lain",
  merge: "Penggabung",
  wait: "Jeda",
  stop: "Titik berhenti",
  message: "Kirim pesan / balasan",
  subflow: "Panggil alur lain",
};

/** Ikon 24×24, digambar dengan garis. */
const ICON: Record<Kind, string> = {
  trigger: "M13 2 4 14h7l-1 8 9-12h-7z",
  code: "M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14",
  decision: "M12 3v6m0 0-6 6v6m6-12 6 6v6",
  data: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  http: "M4 8h13l-3-3M20 16H7l3 3",
  merge: "M6 4l6 8 6-8M12 12v8",
  wait: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  stop: "M7 7l10 10M17 7 7 17",
  message: "M4 5h16v11H9l-5 4z",
  subflow: "M4 6h7v5H4zM13 13h7v5h-7zM11 8.5h2.5a2 2 0 0 1 2 2V13",
};

/* ───────── util ───────── */

function s<K extends keyof SVGElementTagNameMap>(
  tag: K, attrs: Record<string, string | number> = {}, parent?: Element,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent?.appendChild(e);
  return e;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls = "", html = "", parent?: Element,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Bungkus teks menjadi maksimal 2 baris. */
function wrap(text: string, max = 17): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) { lines.push(cur); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) { lines.length = 2; lines[1] = lines[1].replace(/.{0,2}$/, "…"); }
  return lines;
}

interface Cam { x: number; y: number; k: number }          // layar = world * k + (x, y)
interface Seg { core: SVGPathElement; halo: SVGPathElement; base: SVGPathElement; len: number }

export interface ViewerOptions {
  /** true: roda mouse langsung zoom (cocok untuk halaman penuh). false: perlu Ctrl/⌘ (cocok untuk embed). */
  captureWheel?: boolean;
  /** mulai otomatis saat viewer terlihat di layar */
  autoplay?: boolean;
  /** elemen tambahan di kiri judul (mis. tombol "kembali"); dimiliki oleh pemanggil */
  leading?: HTMLElement;
}

export class FlowViewer {
  private root: HTMLElement;
  private svg!: SVGSVGElement;
  private world!: SVGGElement;
  private gEdges!: SVGGElement; private gHalo!: SVGGElement; private gCore!: SVGGElement;
  private gHead!: SVGGElement; private gNodes!: SVGGElement; private gPulse!: SVGGElement;
  private headPath!: SVGPathElement; private pulseGlow!: SVGCircleElement; private pulseDot!: SVGCircleElement;

  private nodeEls = new Map<number, SVGGElement>();
  private labelEls = new Map<number, SVGTextElement>();
  private edgeEls = new Map<string, SVGPathElement>();
  private stageBtns: HTMLButtonElement[] = [];

  private ui!: {
    chips: HTMLButtonElement[]; play: HTMLButtonElement; slider: HTMLInputElement; speed: HTMLButtonElement[];
    follow: HTMLButtonElement; capStep: HTMLElement; capTitle: HTMLElement; capSub: HTMLElement; capFoot: HTMLElement;
    tip: HTMLElement; names: HTMLButtonElement[];
  };

  private cam: Cam = { x: 0, y: 0, k: 0.1 };
  private W = 0; private H = 0;
  private fitK = 0.1;
  private tween: { from: Cam; to: Cam; t: number; dur: number } | null = null;
  private follow = true;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  private scenario!: Scenario;
  private segs: Seg[] = [];
  private pos = 0;               // 0 … path.length-1 ; bagian bulat = node, pecahan = progres di koneksi
  private playing = false;
  private speed = 2;
  private shown = 0;            // jumlah segmen yang sudah menyala penuh
  private curNode = -1;
  private plainNames = true;
  private raf = 0; private last = 0;
  private userMoved = false;
  private ro?: ResizeObserver;
  private io?: IntersectionObserver;
  private headEl?: HTMLElement; private navEl?: HTMLElement; private scenTop = 78;

  constructor(host: HTMLElement, private data: FlowData, private opts: ViewerOptions = {}) {
    this.root = host;
    this.root.classList.add("fv");
    this.root.tabIndex = 0;
    this.build();
    this.bind();
    this.ro = new ResizeObserver(() => this.measure());
    this.ro.observe(this.root);
    this.measure(true);
    this.selectScenario(0, false);

    if (this.reduced) this.speed = 4;
    this.syncSpeedUi();

    if (this.opts.autoplay !== false && !this.reduced) {
      this.io = new IntersectionObserver(es => {
        if (es.some(e => e.isIntersecting)) { this.io?.disconnect(); setTimeout(() => this.play(), 700); }
      }, { threshold: 0.4 });
      this.io.observe(this.root);
    }
  }

  /** Panggil saat komponen dilepas (mis. cleanup useEffect di React). */
  destroy() {
    this.playing = false;
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.ro?.disconnect(); this.io?.disconnect();
    this.root.innerHTML = "";
    this.root.classList.remove("fv", "is-playing", "has-route", "is-dragging");
  }

  /* ═════════ 1. Membangun DOM ═════════ */

  private build() {
    const d = this.data;
    this.root.innerHTML = "";

    this.svg = s("svg", { class: "fv-svg", role: "img", "aria-label": `Diagram alur kerja: ${d.title}` });
    this.root.appendChild(this.svg);

    const defs = s("defs", {}, this.svg);
    const mk = s("marker", { id: "fv-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 9, markerHeight: 9, markerUnits: "userSpaceOnUse", orient: "auto" }, defs);
    s("path", { d: "M0 1 10 5 0 9z", class: "fv-arrow" }, mk);

    this.world = s("g", { class: "fv-world" }, this.svg);
    const gStages = s("g", { class: "fv-stages-bg" }, this.world);
    this.gEdges = s("g", { class: "fv-edges" }, this.world);
    this.gHalo = s("g", { class: "fv-halo" }, this.world);
    this.gCore = s("g", { class: "fv-core" }, this.world);
    this.gHead = s("g", { class: "fv-head" }, this.world);
    this.gNodes = s("g", { class: "fv-nodes" }, this.world);
    this.gPulse = s("g", { class: "fv-pulse" }, this.world);

    /* panel tahap */
    d.stages.forEach((st, i) => {
      const [x1, y1, x2, y2] = st.box;
      s("rect", { x: x1, y: y1, width: x2 - x1, height: y2 - y1, rx: 28, class: "fv-stage", style: `--hue:${st.hue}`, "data-stage": i }, gStages);
    });

    /* koneksi dasar */
    const byId = d.nodes;
    d.edges.forEach(e => {
      const a = byId[e.from], b = byId[e.to];
      const p = s("path", { d: this.curve(a, b), class: "fv-edge", "marker-end": "url(#fv-arrow)" }, this.gEdges);
      if (!this.edgeEls.has(`${e.from}>${e.to}`)) this.edgeEls.set(`${e.from}>${e.to}`, p);
      if (a.sub === "if") {
        const lab = s("text", { class: "fv-branch", "text-anchor": "middle" }, this.gEdges);
        lab.textContent = e.out === 0 ? "ya" : "tidak";
        lab.setAttribute("data-path-from", String(e.from));
        queueMicrotask(() => {
          const len = p.getTotalLength();
          const pt = p.getPointAtLength(Math.min(len * 0.3, 90));
          lab.setAttribute("x", String(pt.x)); lab.setAttribute("y", String(pt.y - 7));
        });
      }
    });

    /* node */
    d.nodes.forEach(n => this.gNodes.appendChild(this.makeNode(n)));

    /* kepala komet + pulsa */
    this.headPath = s("path", { class: "fv-headpath" }, this.gHead);
    this.pulseGlow = s("circle", { class: "fv-pulse-glow", r: 0 }, this.gPulse);
    this.pulseDot = s("circle", { class: "fv-pulse-dot", r: 0 }, this.gPulse);

    /* label tahap (HTML, menempel di tepi layar) */
    const stageLayer = h("div", "fv-stage-labels", "", this.root);
    d.stages.forEach((st, i) => {
      const b = h("button", "fv-stage-label", `<span>${st.short}</span>`, stageLayer);
      b.style.setProperty("--hue", String(st.hue));
      b.title = st.desc;
      b.addEventListener("click", () => this.flyToStage(i));
      this.stageBtns.push(b);
    });

    /* kepala */
    const head = h("header", "fv-head-bar", "", this.root);
    const left = h("div", "fv-head-left", "", head);
    if (this.opts.leading) left.appendChild(this.opts.leading);
    h("div", "fv-titlebox", `<h2>${d.title}</h2><p>${d.subtitle}</p>`, left);
    const tools = h("div", "fv-tools", "", head);
    const names = h("div", "fv-seg", "", tools);
    names.setAttribute("role", "group"); names.setAttribute("aria-label", "Gaya nama langkah");
    const nSimple = h("button", "", "Sederhana", names); nSimple.setAttribute("aria-pressed", "true");
    const nTech = h("button", "", "Teknis", names); nTech.setAttribute("aria-pressed", "false");
    const zoom = h("div", "fv-seg fv-zoom", "", tools);
    const zOut = h("button", "", "−", zoom); zOut.setAttribute("aria-label", "Perkecil");
    const zFit = h("button", "", "Semua", zoom); zFit.setAttribute("aria-label", "Tampilkan seluruh alur");
    const zIn = h("button", "", "+", zoom); zIn.setAttribute("aria-label", "Perbesar");
    zOut.onclick = () => this.zoomBy(1 / 1.5);
    zIn.onclick = () => this.zoomBy(1.5);
    zFit.onclick = () => { this.userMoved = false; this.flyToFit(); };
    nSimple.onclick = () => this.setNames(true);
    nTech.onclick = () => this.setNames(false);

    /* skenario */
    const nav = h("nav", "fv-scenarios", "", this.root);
    nav.setAttribute("aria-label", "Pilih skenario pesan");
    this.headEl = head; this.navEl = nav;
    const chips = d.scenarios.map((sc, i) => {
      const b = h("button", "fv-chip", sc.title, nav);
      b.onclick = () => { this.selectScenario(i, true); };
      return b;
    });

    /* keterangan */
    const cap = h("section", "fv-caption", "", this.root);
    const capStep = h("div", "fv-cap-step", "", cap);
    const capTitle = h("div", "fv-cap-title", "", cap);
    const capSub = h("div", "fv-cap-sub", "", cap);
    const capFoot = h("div", "fv-cap-foot", "", cap);

    /* transport */
    const bar = h("footer", "fv-transport", "", this.root);
    const play = h("button", "fv-play", "", bar);
    play.onclick = () => (this.playing ? this.pause() : this.play());
    const slider = h("input", "fv-slider", "", bar);
    slider.type = "range"; slider.min = "0"; slider.step = "1"; slider.value = "0";
    slider.setAttribute("aria-label", "Langkah");
    slider.oninput = () => { this.pause(); this.pos = Number(slider.value); this.renderPos(); this.centerOnPulse(true); };
    const speedBox = h("div", "fv-seg fv-speed", "", bar);
    const speed = [1, 2, 4].map(v => {
      const b = h("button", "", `${v}×`, speedBox);
      b.onclick = () => { this.speed = v; this.syncSpeedUi(); };
      return b;
    });
    const follow = h("button", "fv-follow", "Ikuti jalur", bar);
    follow.onclick = () => { this.follow = !this.follow; this.userMoved = !this.follow; this.syncFollowUi(); if (this.follow) this.ensureLoop(); };

    /* legenda */
    const lg = h("div", "fv-legend", "", this.root);
    lg.innerHTML = (["trigger", "decision", "data", "http", "message", "subflow", "stop"] as Kind[])
      .map(k => `<span class="k-${k}"><svg viewBox="-14 -14 28 28" aria-hidden="true">${this.shapeMarkup(k, 11)}</svg>${KIND_LABEL[k]}</span>`).join("");

    /* tooltip */
    const tip = h("div", "fv-tip", "", this.root); tip.hidden = true; tip.setAttribute("role", "tooltip");

    this.ui = { chips, play, slider, speed, follow, capStep, capTitle, capSub, capFoot, tip, names: [nSimple, nTech] };
  }

  private shapeMarkup(kind: Kind, r: number): string {
    if (kind === "decision") return `<polygon class="shape" points="0,${-r} ${r},0 0,${r} ${-r},0"/>`;
    if (kind === "stop") return `<circle class="shape" r="${r}"/>`;
    return `<rect class="shape" x="${-r}" y="${-r}" width="${r * 2}" height="${r * 2}" rx="${r * 0.38}"/>`;
  }

  private makeNode(n: FlowNode): SVGGElement {
    const g = s("g", { class: `fv-node k-${n.kind}`, transform: `translate(${n.x} ${n.y})`, "data-id": n.id, style: `--hue:${this.data.stages[n.stage].hue}` });
    s("circle", { class: "fv-node-halo", r: 54 }, g);
    const r = n.kind === "trigger" ? 32 : n.kind === "decision" ? 36 : n.kind === "stop" ? 27 : 28;
    if (n.kind === "decision") s("polygon", { class: "shape", points: `0,${-r} ${r},0 0,${r} ${-r},0` }, g);
    else if (n.kind === "stop") s("circle", { class: "shape", r }, g);
    else s("rect", { class: "shape", x: -r, y: -r, width: r * 2, height: r * 2, rx: n.kind === "trigger" ? 22 : 14 }, g);
    const ic = s("path", { class: "icon", d: ICON[n.kind], transform: "translate(-13 -13) scale(1.08)" }, g);
    void ic;
    const t = s("text", { class: "fv-label", y: r + 22, "text-anchor": "middle" }, g);
    this.labelEls.set(n.id, t);
    this.fillLabel(n);
    this.nodeEls.set(n.id, g);
    return g;
  }

  private fillLabel(n: FlowNode) {
    const t = this.labelEls.get(n.id)!;
    t.textContent = "";
    const lines = wrap(this.plainNames ? n.plain : n.tech, this.plainNames ? 17 : 19);
    lines.forEach((ln, i) => {
      const ts = s("tspan", { x: 0, dy: i === 0 ? 0 : 17 }, t);
      ts.textContent = ln;
    });
  }

  /** Kurva ala n8n: keluar dari sisi kanan node, masuk ke sisi kiri node tujuan. */
  private curve(a: FlowNode, b: FlowNode): string {
    const sx = a.x + 30, sy = a.y, tx = b.x - 32, ty = b.y;
    const dx = tx - sx;
    if (dx > 50) {
      const c = Math.max(40, dx * 0.5);
      return `M${sx} ${sy}C${sx + c} ${sy} ${tx - c} ${ty} ${tx} ${ty}`;
    }
    return `M${sx} ${sy}C${sx + 90} ${sy} ${tx - 90} ${ty} ${tx} ${ty}`;
  }

  /* ═════════ 2. Interaksi ═════════ */

  private bind() {
    const svg = this.svg;
    const pointers = new Map<number, { x: number; y: number }>();
    let dragStart: { x: number; y: number; cam: Cam } | null = null;
    let pinch: { d: number; k: number } | null = null;
    let moved = 0;

    svg.addEventListener("pointerdown", e => {
      svg.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      moved = 0;
      if (pointers.size === 1) dragStart = { x: e.clientX, y: e.clientY, cam: { ...this.cam } };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.cam.k };
      }
    });
    svg.addEventListener("pointermove", e => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.k * (dist / pinch.d), true);
        this.stopFollow();
      } else if (pointers.size === 1 && dragStart) {
        const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
        moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
        if (moved > 4) {
          this.tween = null; this.stopFollow();
          this.setCam({ ...this.cam, x: dragStart.cam.x + dx, y: dragStart.cam.y + dy });
          this.root.classList.add("is-dragging");
        }
      }
      this.hover(e);
    });
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) { dragStart = null; this.root.classList.remove("is-dragging"); }
    };
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);
    svg.addEventListener("pointerleave", () => (this.ui.tip.hidden = true));

    svg.addEventListener("wheel", e => {
      const want = this.opts.captureWheel !== false || e.ctrlKey || e.metaKey;
      if (!want) return;
      e.preventDefault();
      this.stopFollow();
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016));
      this.zoomAt(e.offsetX, e.offsetY, this.cam.k * f, true);
    }, { passive: false });

    this.root.addEventListener("keydown", e => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === " " && (e.target as HTMLElement).tagName !== "BUTTON") { e.preventDefault(); this.playing ? this.pause() : this.play(); }
      else if (e.key === "+" || e.key === "=") this.zoomBy(1.4);
      else if (e.key === "-") this.zoomBy(1 / 1.4);
      else if (e.key === "0") { this.userMoved = false; this.flyToFit(); }
      else if (e.key === "ArrowRight") { this.pause(); this.pos = Math.min(this.maxPos, Math.floor(this.pos) + 1); this.renderPos(); this.centerOnPulse(); }
      else if (e.key === "ArrowLeft") { this.pause(); this.pos = Math.max(0, Math.ceil(this.pos) - 1); this.renderPos(); this.centerOnPulse(); }
    });
  }

  private hover(e: PointerEvent) {
    const target = (e.target as Element).closest?.(".fv-node") as SVGGElement | null;
    const tip = this.ui.tip;
    if (!target || this.root.classList.contains("is-dragging")) { tip.hidden = true; return; }
    const n = this.data.nodes[Number(target.getAttribute("data-id"))];
    const st = this.data.stages[n.stage];
    const tech = n.plain !== n.tech ? `<em>${n.tech}</em>` : "";
    tip.innerHTML = `<strong>${n.plain}</strong>${tech}<span>${KIND_LABEL[n.kind]} · ${st.title}</span>`;
    tip.hidden = false;
    const r = this.root.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    tip.style.transform = `translate(${Math.min(x + 14, this.W - 260)}px, ${Math.min(y + 16, this.H - 90)}px)`;
  }

  private setNames(plain: boolean) {
    this.plainNames = plain;
    this.ui.names[0].setAttribute("aria-pressed", String(plain));
    this.ui.names[1].setAttribute("aria-pressed", String(!plain));
    this.data.nodes.forEach(n => this.fillLabel(n));
    this.updateCaption();
  }

  /* ═════════ 3. Kamera ═════════ */

  private measure(first = false) {
    const r = this.root.getBoundingClientRect();
    this.W = r.width; this.H = r.height;
    /* header bisa lebih tinggi (tombol "Semua alur", pemilih alur): baris skenario ikut turun */
    let bottom = 0;
    this.headEl?.querySelectorAll<HTMLElement>(".fv-titlebox, .fv-tools, .lib-nav").forEach(e => {
      if (getComputedStyle(e).display === "none") return;
      bottom = Math.max(bottom, e.getBoundingClientRect().bottom - r.top);
    });
    this.scenTop = Math.max(this.W < 700 ? 104 : 78, Math.ceil(bottom) + 10);
    if (this.navEl) this.navEl.style.top = `${this.scenTop}px`;
    const fit = this.fitCam();
    this.fitK = fit.k;
    if (first || !this.userMoved) { this.setCam(fit); }
  }

  /** Bidang yang bebas dari HUD. */
  private insets() {
    const narrow = this.W < 700;
    return { t: this.scenTop + 54, b: narrow ? 210 : 150, l: 24, r: 24 };
  }

  private bounds() {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const st of this.data.stages) {
      x1 = Math.min(x1, st.box[0]); y1 = Math.min(y1, st.box[1]);
      x2 = Math.max(x2, st.box[2]); y2 = Math.max(y2, st.box[3]);
    }
    const minH = 360, minW = 640;
    if (y2 - y1 < minH) { const c = (y1 + y2) / 2; y1 = c - minH / 2; y2 = c + minH / 2; }
    if (x2 - x1 < minW) { const c = (x1 + x2) / 2; x1 = c - minW / 2; x2 = c + minW / 2; }
    return { x1, y1, x2, y2 };
  }

  private fitCam(): Cam {
    const b = this.bounds(), i = this.insets();
    const w = b.x2 - b.x1, hgt = b.y2 - b.y1;
    const aw = Math.max(100, this.W - i.l - i.r), ah = Math.max(100, this.H - i.t - i.b);
    const k = Math.min(aw / w, ah / hgt, 1.15);
    return { k, x: i.l + (aw - w * k) / 2 - b.x1 * k, y: i.t + (ah - hgt * k) / 2 - b.y1 * k };
  }

  private setCam(c: Cam) {
    this.cam = { x: c.x, y: c.y, k: clamp(c.k, this.fitK * 0.8, MAX_K) };
    const { x, y, k } = this.cam;
    this.world.setAttribute("transform", `translate(${x} ${y}) scale(${k})`);

    /* lebar garis konstan di layar, apa pun zoom-nya */
    this.gEdges.setAttribute("stroke-width", String(1.5 / k));
    this.gHalo.setAttribute("stroke-width", String(11 / k));
    this.gCore.setAttribute("stroke-width", String(2.6 / k));
    this.gHead.setAttribute("stroke-width", String(4.4 / k));
    this.gPulse.setAttribute("data-k", k.toFixed(3));
    this.pulseDot.setAttribute("r", String(5.5 / k));
    this.pulseGlow.setAttribute("r", String(17 / k));

    const lod = k < 0.2 ? "far" : k < 0.5 ? "mid" : "near";
    if (this.root.dataset.lod !== lod) this.root.dataset.lod = lod;
    this.root.style.setProperty("--gx", `${x}px`);
    this.root.style.setProperty("--gy", `${y}px`);
    this.root.style.setProperty("--gs", `${k * 28}px`);
    this.placeStageLabels();
  }

  private placeStageLabels() {
    const { x, y, k } = this.cam;
    const minY = this.insets().t - 14;
    const placed: { x1: number; x2: number; y: number }[] = [];   // supaya label tidak bertumpuk
    const cur = this.currentStage();
    this.data.stages.forEach((st, i) => {
      const b = this.stageBtns[i];
      const left = st.box[0] * k + x, right = st.box[2] * k + x, top = st.box[1] * k + y;
      const w = b.offsetWidth || 120;
      const visible = right > 0 && left < this.W && top > -60 && top < this.H + 40;
      b.style.visibility = visible ? "visible" : "hidden";
      if (!visible) return;
      const px = clamp(left + 4, 10, Math.max(10, right - w - 8));
      const py0 = clamp(top - 34, minY, this.H - 40);
      const free = (yy: number) => !placed.some(q => px < q.x2 + 6 && px + w > q.x1 - 6 && Math.abs(yy - q.y) < 30);
      let py = py0, ok = free(py0);
      for (let s = 1; !ok && s <= 8; s++) {
        for (const yy of [py0 - 32 * s, py0 + 32 * s]) {
          if (yy >= minY && yy <= this.H - 40 && free(yy)) { py = yy; ok = true; break; }
        }
      }
      if (!ok && cur !== i) { b.style.visibility = "hidden"; return; }   // tidak ada ruang: sembunyikan (tahap aktif tetap tampil)
      placed.push({ x1: px, x2: px + w, y: py });
      b.style.transform = `translate(${px}px, ${py}px)`;
      b.classList.toggle("is-current", cur === i);
    });
  }

  private zoomAt(sx: number, sy: number, nk: number, instant = false) {
    const k = clamp(nk, this.fitK * 0.8, MAX_K);
    const wx = (sx - this.cam.x) / this.cam.k, wy = (sy - this.cam.y) / this.cam.k;
    this.userMoved = true;
    if (instant) { this.tween = null; this.setCam({ k, x: sx - wx * k, y: sy - wy * k }); }
  }
  private zoomBy(f: number) { this.stopFollow(); this.zoomAt(this.W / 2, this.H / 2, this.cam.k * f, true); }

  private flyTo(to: Cam, dur = 0.9) {
    if (this.reduced) { this.setCam(to); return; }
    this.tween = { from: { ...this.cam }, to, t: 0, dur };
    this.ensureLoop();
  }
  private flyToFit() { this.flyTo(this.fitCam()); }
  private flyToStage(i: number) {
    this.stopFollow();
    const [x1, y1, x2, y2] = this.data.stages[i].box, ins = this.insets();
    const aw = this.W - ins.l - ins.r, ah = this.H - ins.t - ins.b;
    const k = clamp(Math.min(aw / (x2 - x1), ah / (y2 - y1)), this.fitK, 1.1);
    this.userMoved = true;
    this.flyTo({ k, x: ins.l + (aw - (x2 - x1) * k) / 2 - x1 * k, y: ins.t + (ah - (y2 - y1) * k) / 2 - y1 * k });
  }
  private stopFollow() {
    if (!this.follow) return;
    this.follow = false; this.userMoved = true; this.syncFollowUi();
  }

  private camToCenter(wx: number, wy: number, k: number): Cam {
    const ins = this.insets();
    const cx = ins.l + (this.W - ins.l - ins.r) / 2, cy = ins.t + (this.H - ins.t - ins.b) / 2;
    return { k, x: cx - wx * k, y: cy - wy * k };
  }
  private centerOnPulse(snap = false) {
    const p = this.pulsePoint();
    if (!p) return;
    const to = this.camToCenter(p.x, p.y, this.follow ? FOLLOW_K : this.cam.k);
    if (this.follow) { if (snap || this.reduced) this.setCam(to); else this.flyTo(to, 0.5); }
  }

  /* ═════════ 4. Pemutar ═════════ */

  private get path() { return this.scenario.path; }
  private get maxPos() { return this.path.length - 1; }

  /** Tandai node yang gagal (merah). Dipakai oleh replay eksekusi. */
  markErrors(ids: number[]) {
    this.nodeEls.forEach(g => g.classList.remove("is-error"));
    ids.forEach(id => this.nodeEls.get(id)?.classList.add("is-error"));
  }

  selectScenario(i: number, play: boolean) {
    this.pause();
    this.scenario = this.data.scenarios[i];
    this.ui.chips.forEach((c, j) => c.setAttribute("aria-pressed", String(i === j)));

    this.gHalo.replaceChildren(); this.gCore.replaceChildren();
    this.segs = [];
    this.nodeEls.forEach(g => g.classList.remove("on", "seen", "inpath"));
    this.path.forEach(id => this.nodeEls.get(id)!.classList.add("inpath"));
    this.root.classList.add("has-route");

    for (let j = 0; j < this.path.length - 1; j++) {
      const base = this.edgeEls.get(`${this.path[j]}>${this.path[j + 1]}`)!;
      const d = base.getAttribute("d")!;
      const halo = s("path", { d, class: "halo" }, this.gHalo);
      const core = s("path", { d, class: "core" }, this.gCore);
      const len = base.getTotalLength();
      for (const p of [halo, core]) { p.setAttribute("stroke-dasharray", `0 ${len}`); }
      this.segs.push({ halo, core, base, len });
    }

    this.pos = 0; this.shown = 0; this.curNode = -1;
    this.ui.slider.max = String(this.maxPos);
    this.renderPos();
    this.userMoved = false;
    if (play) { this.follow = !this.reduced; this.syncFollowUi(); this.play(); }
    else { this.flyToFit(); this.syncPlayUi(); }
  }

  play() {
    if (this.pos >= this.maxPos) { this.pos = 0; this.shown = 0; this.curNode = -1; }
    this.playing = true; this.syncPlayUi();
    if (this.follow) this.flyTo(this.camToCenter(this.nodeAt(0).x, this.nodeAt(0).y, FOLLOW_K), 0.8);
    this.ensureLoop();
  }
  pause() { this.playing = false; this.syncPlayUi(); }

  private finish() {
    this.playing = false; this.syncPlayUi();
    if (this.follow) setTimeout(() => { if (!this.playing) { this.userMoved = false; this.flyToFit(); } }, 700);
  }

  private nodeAt(i: number) { return this.data.nodes[this.path[i]]; }

  private pulsePoint(): { x: number; y: number } | null {
    if (!this.segs.length) return null;
    const f = clamp(Math.floor(this.pos), 0, this.segs.length - 1);
    const frac = this.pos >= this.maxPos ? 1 : clamp(this.pos - f, 0, 1);
    const sg = this.segs[f];
    return sg.base.getPointAtLength(sg.len * frac);
  }

  private currentStage(): number {
    return this.scenario && this.curNode >= 0 ? this.data.nodes[this.path[this.curNode]].stage : -1;
  }

  private renderPos() {
    const N = this.path.length;
    const done = this.pos >= this.maxPos;
    const f = done ? N - 2 : Math.floor(this.pos);
    const frac = done ? 1 : this.pos - f;
    const lit = done ? N - 1 : f;               // segmen penuh = 0 … lit-1

    /* segmen yang berubah */
    const lo = Math.min(this.shown, lit), hi = Math.max(this.shown, lit);
    for (let i = lo; i < hi; i++) this.setSeg(i, i < lit ? 1 : 0);
    this.shown = lit;

    /* segmen yang sedang berjalan */
    if (!done && this.segs[f]) {
      const sg = this.segs[f];
      this.setSeg(f, frac);
      this.headPath.setAttribute("d", sg.base.getAttribute("d")!);
      const head = sg.len * frac, tail = Math.min(TAIL, head);
      this.headPath.setAttribute("stroke-dasharray", `${tail} ${sg.len * 2}`);
      this.headPath.setAttribute("stroke-dashoffset", String(-(head - tail)));
      this.headPath.style.opacity = "1";
    } else {
      this.headPath.style.opacity = "0";
    }

    /* pulsa */
    const pt = this.pulsePoint();
    if (pt) {
      this.pulseGlow.setAttribute("cx", String(pt.x)); this.pulseGlow.setAttribute("cy", String(pt.y));
      this.pulseDot.setAttribute("cx", String(pt.x)); this.pulseDot.setAttribute("cy", String(pt.y));
    }

    /* status node */
    const cur = Math.min(Math.floor(this.pos + 1e-6), N - 1);
    if (cur !== this.curNode) {
      this.curNode = cur;
      this.path.forEach((id, i) => {
        const g = this.nodeEls.get(id)!;
        g.classList.toggle("on", i === cur);
        g.classList.toggle("seen", i < cur);
      });
      this.updateCaption();
      this.placeStageLabels();
    }
    this.ui.slider.value = String(Math.floor(this.pos));
  }

  private setSeg(i: number, f: number) {
    const sg = this.segs[i];
    if (!sg) return;
    const v = f >= 1 ? "" : `${sg.len * f} ${sg.len * 2}`;
    for (const p of [sg.halo, sg.core]) {
      if (f >= 1) p.removeAttribute("stroke-dasharray"); else p.setAttribute("stroke-dasharray", v || `0 ${sg.len}`);
    }
    sg.core.classList.toggle("settled", f >= 1);
    sg.halo.classList.toggle("settled", f >= 1);
  }

  private updateCaption() {
    if (this.curNode < 0) return;
    const n = this.nodeAt(this.curNode), st = this.data.stages[n.stage];
    const total = this.path.length, atEnd = this.curNode === total - 1;
    this.ui.capStep.textContent = `Langkah ${this.curNode + 1} dari ${total}`;
    this.ui.capTitle.textContent = this.plainNames ? n.plain : n.tech;
    const dot = /[.?!]$/.test(st.title) ? "" : ".";
    this.ui.capSub.innerHTML = `<b>${st.title}${dot}</b> ${st.desc}`;
    this.ui.capFoot.textContent = atEnd ? this.scenario.desc : "";
    this.ui.capFoot.hidden = !atEnd;
    this.root.style.setProperty("--cap-hue", String(st.hue));
  }

  private syncPlayUi() {
    const p = this.ui.play;
    const atEnd = !!this.scenario && this.pos >= this.maxPos && !this.playing;
    p.innerHTML = this.playing
      ? `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3h3.5v14H5zM11.5 3H15v14h-3.5z"/></svg><span>Jeda</span>`
      : atEnd
        ? `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3a7 7 0 1 0 6.6 4.7M10 3V0M10 3 7 6" fill="none" stroke-width="1.8" stroke-linecap="round"/></svg><span>Ulangi</span>`
        : `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3l12 7-12 7z"/></svg><span>Putar</span>`;
    this.root.classList.toggle("is-playing", this.playing);
  }
  private syncSpeedUi() { this.ui.speed.forEach((b, i) => b.setAttribute("aria-pressed", String([1, 2, 4][i] === this.speed))); }
  private syncFollowUi() { this.ui.follow.setAttribute("aria-pressed", String(this.follow)); }

  /* ═════════ 5. Loop animasi (hanya berjalan saat perlu) ═════════ */

  private ensureLoop() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    const dt = clamp((now - this.last) / 1000, 0, 0.05);   // rAF kadang lebih awal dari performance.now()
    this.last = now;

    if (this.playing) {
      this.pos = clamp(this.pos + (dt * this.speed) / SEG_SEC, 0, this.maxPos);
      this.renderPos();
      if (this.pos >= this.maxPos) this.finish();
    }

    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = ease(tw.t);
      this.setCam({
        x: tw.from.x + (tw.to.x - tw.from.x) * e,
        y: tw.from.y + (tw.to.y - tw.from.y) * e,
        k: tw.from.k + (tw.to.k - tw.from.k) * e,
      });
      if (tw.t >= 1) this.tween = null;
    } else if (this.follow && this.playing) {
      const p = this.pulsePoint();
      if (p) {
        const to = this.camToCenter(p.x, p.y, FOLLOW_K);
        const a = 1 - Math.exp(-dt * 5);
        this.setCam({ x: this.cam.x + (to.x - this.cam.x) * a, y: this.cam.y + (to.y - this.cam.y) * a, k: this.cam.k + (to.k - this.cam.k) * a });
      }
    }

    if (this.playing || this.tween) this.raf = requestAnimationFrame(this.tick);
    else this.raf = 0;
  };
}
