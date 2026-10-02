/* ============================================================
   It Was Never About Being Tidy — sketch.js
   p5.js (instance mode) + plain JS for stats, tooltip, UI
   ============================================================ */

(function () {
  if (typeof PATIENTS === "undefined" || !PATIENTS.length) {
    console.error("data.js did not load — no patient data.");
    return;
  }

  /* ---------------- shared helpers ---------------- */

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const N = PATIENTS.length;

  const COL = {
    coral: [238, 123, 108],
    teal: [111, 179, 201],
    sage: [127, 182, 158],
    gold: [201, 161, 95],
    purple: [143, 155, 212],
    mauve: [181, 139, 181],
    amber: [242, 193, 78],
    gray: [96, 105, 120],
    text: [233, 230, 223],
  };

  const OB_COL = {
    "Contamination": COL.sage,
    "Harm-related": COL.coral,
    "Religious": COL.gold,
    "Symmetry": COL.purple,
    "Hoarding": COL.mauve,
  };

  const CO_COL = {
    "Checking": COL.sage,
    "Washing": COL.teal,
    "Ordering": COL.gold,
    "Praying": COL.mauve,
    "Counting": COL.coral,
  };

  const css = (a) => `rgb(${a[0]},${a[1]},${a[2]})`;
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const clamp01 = (k) => Math.min(1, Math.max(0, k));

  /* visibility flags, driven by IntersectionObserver */
  const vis = {};
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => (vis[e.target.dataset.vis] = e.isIntersecting)),
    { threshold: 0.18 }
  );
  document.querySelectorAll("[data-vis]").forEach((el) => io.observe(el));

  /* shared tooltip */
  const tip = document.getElementById("tooltip");
  function showTip(p, html) {
    const r = p.canvas.getBoundingClientRect();
    const x = Math.min(r.left + p.mouseX + 16, window.innerWidth - 275);
    const y = Math.min(r.top + p.mouseY + 16, window.innerHeight - 120);
    tip.innerHTML = html;
    tip.style.left = Math.max(8, x) + "px";
    tip.style.top = Math.max(8, y) + "px";
    tip.style.opacity = 1;
  }
  function hideTip() {
    tip.style.opacity = 0;
  }

  /* patient text bits */
  const yearsOf = (pt) => (pt.durMonths / 12).toFixed(1);
  function comorbidColor(pt) {
    const both = pt.depression === "Yes" && pt.anxiety === "Yes";
    const one = pt.depression === "Yes" || pt.anxiety === "Yes";
    return both ? COL.coral : one ? COL.gold : COL.gray;
  }
  function patientTip(pt) {
    return (
      `<strong>Patient ${pt.id}</strong> · age ${pt.age} · ${pt.gender}<br>` +
      `${pt.obsession} &rarr; ${pt.compulsion}<br>` +
      `Y-BOCS ${pt.ybocsObs} (obs) / ${pt.ybocsComp} (comp)<br>` +
      `symptoms for ${yearsOf(pt)} yrs · meds: ${pt.medication}`
    );
  }
  function panelHTML(pt) {
    return (
      `<h4>Patient ${pt.id}'s file</h4><ul>` +
      `<li><span>Age</span><strong>${pt.age}</strong></li>` +
      `<li><span>Gender</span><strong>${pt.gender}</strong></li>` +
      `<li><span>Ethnicity</span><strong>${pt.ethnicity}</strong></li>` +
      `<li><span>Education</span><strong>${pt.education}</strong></li>` +
      `<li><span>Marital status</span><strong>${pt.marital}</strong></li>` +
      `<li><span>Diagnosed</span><strong>${pt.dxDate}</strong></li>` +
      `<li><span>Symptoms for</span><strong>${yearsOf(pt)} yrs</strong></li>` +
      `<li><span>Family history</span><strong>${pt.familyHx}</strong></li>` +
      `<li class="hi"><span>Obsession</span><strong>${pt.obsession}</strong></li>` +
      `<li class="hi"><span>Compulsion</span><strong>${pt.compulsion}</strong></li>` +
      `<li class="hi"><span>Y-BOCS obs / comp</span><strong>${pt.ybocsObs} / ${pt.ybocsComp}</strong></li>` +
      `<li><span>Depression</span><strong>${pt.depression}</strong></li>` +
      `<li><span>Anxiety</span><strong>${pt.anxiety}</strong></li>` +
      `<li><span>Medication</span><strong>${pt.medication}</strong></li>` +
      `<li><span>Previous dx</span><strong>${pt.prevDx}</strong></li>` +
      `</ul>`
    );
  }

  /* ============================================================
     01 · THE 100 — interactive grid
     ============================================================ */

  let gridMode = "gender";

  const LEGENDS = {
    gender: [
      ["female", COL.coral],
      ["male", COL.teal],
    ],
    obsession: Object.entries(OB_COL).map(([k, v]) => [k.toLowerCase(), v]),
    compulsion: Object.entries(CO_COL).map(([k, v]) => [k.toLowerCase(), v]),
    comorbidity: [
      ["depression + anxiety", COL.coral],
      ["one of the two", COL.gold],
      ["neither", COL.gray],
    ],
  };

  const legendEl = document.getElementById("grid-legend");
  function buildLegend(mode) {
    legendEl.innerHTML = LEGENDS[mode]
      .map(([label, c]) => `<span class="key"><i style="background:${css(c)}"></i>${label}</span>`)
      .join("");
  }
  buildLegend(gridMode);

  const panelEl = document.getElementById("patient-panel");
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      gridMode = btn.dataset.mode;
      buildLegend(gridMode);
    });
  });

  new p5(function (p) {
    const box = document.getElementById("grid-canvas");
    let w = 0, t0 = null, hoverIdx = -1, panelIdx = -1;
    const M = 18, COLS = 10;

    const cell = () => (w - M * 2) / COLS;
    const dotR = (pt) => p.map(pt.age, 18, 76, cell() * 0.16, cell() * 0.34);
    const center = (i) => {
      const c = cell();
      const cx = M + (i % COLS) * c + c / 2;
      const cy = M + Math.floor(i / COLS) * c + c / 2;
      return [cx, cy];
    };

    function modeColor(pt) {
      if (gridMode === "gender") return pt.gender === "Female" ? COL.coral : COL.teal;
      if (gridMode === "obsession") return OB_COL[pt.obsession];
      if (gridMode === "compulsion") return CO_COL[pt.compulsion];
      return comorbidColor(pt);
    }

    p.setup = function () {
      w = box.clientWidth;
      p.createCanvas(w, w).parent(box);
    };

    p.windowResized = function () {
      w = box.clientWidth;
      p.resizeCanvas(w, w);
    };

    p.draw = function () {
      p.clear();
      if (vis.grid && t0 === null) t0 = p.millis();
      if (t0 === null) {
        /* not yet on screen: draw a faint placeholder grid */
        p.noStroke();
        p.fill(...COL.text, 20);
        for (let i = 0; i < N; i++) {
          const [cx, cy] = center(i);
          p.circle(cx, cy, 4);
        }
        return;
      }
      const t = p.millis();
      hoverIdx = -1;

      for (let i = 0; i < N; i++) {
        const pt = PATIENTS[i];
        const [cx, cy] = center(i);
        const r = dotR(pt);
        const en = easeOut(clamp01((t - t0 - i * 12) / 650));
        const rr = r * en;

        const d = p.dist(p.mouseX, p.mouseY, cx, cy);
        const hovered = d < r + 3;
        if (hovered) hoverIdx = i;

        const c = modeColor(pt);
        p.noStroke();
        p.fill(...c, 235 * en + (hovered ? 20 : 0));
        p.circle(cx, cy, rr * 2);

        if (hovered) {
          p.noFill();
          p.stroke(...COL.text, 190);
          p.strokeWeight(1.4);
          p.circle(cx, cy, rr * 2 + 9);
        }
      }

      p.cursor(hoverIdx >= 0 ? "pointer" : "arrow");

      if (hoverIdx >= 0) {
        showTip(p, patientTip(PATIENTS[hoverIdx]));
        if (hoverIdx !== panelIdx) {
          panelIdx = hoverIdx;
          panelEl.innerHTML = panelHTML(PATIENTS[hoverIdx]);
        }
      } else {
        hideTip();
      }
    };

    /* tap support */
    p.mousePressed = function () {
      if (hoverIdx >= 0) {
        panelIdx = hoverIdx;
        panelEl.innerHTML = panelHTML(PATIENTS[hoverIdx]);
      }
    };
  });

  /* ============================================================
     HERO — 100 breathing dots
     ============================================================ */

  new p5(function (p) {
    const box = document.getElementById("hero-canvas");
    let w = 0, h = 0;
    const dots = [];
    const N_HERO = 100, ME = 57;

    p.setup = function () {
      w = box.clientWidth;
      h = box.clientHeight;
      p.createCanvas(w, h).parent(box);
      for (let i = 0; i < N_HERO; i++) {
        dots.push({ offX: 0, offY: 0, tx: 0, ty: 0, seed: p.random(1000) });
      }
    };

    p.windowResized = function () {
      w = box.clientWidth;
      h = box.clientHeight;
      p.resizeCanvas(w, h);
    };

    p.draw = function () {
      p.clear();
      const t = REDUCED ? 0 : p.millis() / 1000;
      const cx = w / 2, cy = h / 2;
      const ringR = Math.min(w, h) * 0.34;
      const pos = [];

      for (let i = 0; i < N_HERO; i++) {
        const a = (i / N_HERO) * p.TWO_PI;
        const wob = (p.noise(i * 0.53, t * 0.12 + dots[i].seed) - 0.5) * 100;
        let x = cx + Math.cos(a) * (ringR + wob);
        let y = cy + Math.sin(a) * (ringR + wob) * 0.92;

        /* gentle mouse repulsion */
        if (!REDUCED) {
          const d = p.dist(p.mouseX, p.mouseY, x, y);
          if (d < 110 && d > 0.001) {
            dots[i].tx = ((x - p.mouseX) / d) * (110 - d) * 0.45;
            dots[i].ty = ((y - p.mouseY) / d) * (110 - d) * 0.45;
          } else {
            dots[i].tx = 0;
            dots[i].ty = 0;
          }
          dots[i].offX += (dots[i].tx - dots[i].offX) * 0.07;
          dots[i].offY += (dots[i].ty - dots[i].offY) * 0.07;
          x += dots[i].offX;
          y += dots[i].offY;
        }
        pos.push([x, y]);
      }

      /* faint web between neighbors */
      p.noFill();
      for (let i = 0; i < N_HERO; i++) {
        for (const j of [i + 1, (i + 3) % N_HERO]) {
          if (j >= N_HERO) continue;
          const d = p.dist(pos[i][0], pos[i][1], pos[j][0], pos[j][1]);
          if (d < 130) {
            p.stroke(...COL.text, (1 - d / 130) * 40);
            p.strokeWeight(1);
            p.line(pos[i][0], pos[i][1], pos[j][0], pos[j][1]);
          }
        }
      }

      /* the dots */
      for (let i = 0; i < N_HERO; i++) {
        const breathe = REDUCED ? 0 : Math.sin(t * 1.4 + i * 0.7);
        if (i === ME) {
          const r = 6 + 1.8 * Math.sin(t * 2.1);
          p.noStroke();
          p.fill(...COL.amber, 40);
          p.circle(pos[i][0], pos[i][1], r * 4);
          p.fill(...COL.amber, 230);
          p.circle(pos[i][0], pos[i][1], r * 2);
        } else {
          p.noStroke();
          p.fill(...COL.text, 150 + breathe * 40);
          p.circle(pos[i][0], pos[i][1], 6.4 + breathe * 2.2);
        }
      }
    };
  });

  /* ============================================================
     02 · THE LOOP — echoing intrusive thoughts
     ============================================================ */

  const ECHO_WORDS = [
    "what if I hurt someone?",
    "did I really lock the door?",
    "it has to be even",
    "contaminated — wash again",
    "count to 40",
    "check it one more time",
    "pray until it feels right",
    "what if it wasn't enough?",
    "order it or something bad happens",
    "keep it or lose something",
    "again. again. again.",
    "everyone can tell",
    "did I say it wrong?",
    "what did I touch?",
    "not right yet",
  ];

  new p5(function (p) {
    const box = document.getElementById("echo-canvas");
    let w = 0, h = 0;
    const words = [];

    p.setup = function () {
      w = box.clientWidth;
      h = 250;
      p.createCanvas(w, h).parent(box);
      for (const txt of ECHO_WORDS) {
        words.push({
          txt,
          x: p.random(110, Math.max(140, w - 110)),
          y: p.random(36, h - 36),
          size: p.random(15, 30),
          period: p.random(5.5, 9.5),
          offset: p.random(0, 8),
          coral: txt.indexOf("again") >= 0,
        });
      }
    };

    p.windowResized = function () {
      w = box.clientWidth;
      p.resizeCanvas(w, h);
      for (const wd of words) wd.x = p.random(110, Math.max(140, w - 110));
    };

    p.draw = function () {
      p.clear();
      if (!vis.echo) return;
      const t = p.millis() / 1000;
      p.textAlign(p.CENTER, p.CENTER);
      p.textFont("Georgia, serif");
      p.textStyle(p.ITALIC);
      for (const wd of words) {
        let a;
        if (REDUCED) {
          a = 0.4;
        } else {
          const ph = (((t - wd.offset) % wd.period) + wd.period) % wd.period / wd.period;
          a = Math.sin(Math.PI * ph);
          wd.drawY = wd.y - ph * 16;
        }
        const alpha = a * (wd.coral ? 130 : 105);
        p.fill(...(wd.coral ? COL.coral : COL.text), alpha);
        p.textSize(wd.size);
        p.text(wd.txt, wd.x, REDUCED ? wd.y : wd.drawY);
      }
      p.textStyle(p.NORMAL);
    };
  });

  /* ============================================================
     02b · type-of bars (obsessions & compulsions)
     ============================================================ */

  function barsSketch(containerId, key, palette) {
    return new p5(function (p) {
      const box = document.getElementById(containerId);
      let w = 0, h = 0, t0 = null;
      const LABEL_W = 118, COUNT_W = 40, PAD = 14, ROW_H = 46;

      const counts = {};
      PATIENTS.forEach((pt) => (counts[pt[key]] = (counts[pt[key]] || 0) + 1));
      const rows = Object.keys(counts)
        .map((k) => [k, counts[k]])
        .sort((a, b) => b[1] - a[1]);

      p.setup = function () {
        w = box.clientWidth;
        h = rows.length * ROW_H + 10;
        p.createCanvas(w, h).parent(box);
      };

      p.windowResized = function () {
        w = box.clientWidth;
        p.resizeCanvas(w, h);
      };

      p.draw = function () {
        p.clear();
        if (vis[key === "obsession" ? "obs-bars" : "comp-bars"]) {
          if (t0 === null) t0 = p.millis();
        }
        const en = t0 === null ? 0 : easeOut(clamp01((p.millis() - t0) / 900));
        const maxV = rows[0][1];
        const hoverRow =
          p.mouseX >= 0 && p.mouseX <= w ? Math.floor((p.mouseY - 5) / ROW_H) : -1;

        p.textFont("Inter, sans-serif");
        rows.forEach(([label, count], i) => {
          const y = 5 + i * ROW_H;
          const hovered = i === hoverRow;
          const c = palette[label] || COL.text;
          const barMax = w - LABEL_W - COUNT_W - PAD * 2;
          const bw = (count / maxV) * barMax * easeOut(clamp01(en * 1.4 - i * 0.06));

          /* label */
          p.noStroke();
          p.fill(...COL.text, hovered ? 255 : 200);
          p.textSize(13);
          p.textAlign(p.RIGHT, p.CENTER);
          p.text(label, LABEL_W - 10, y + ROW_H / 2);

          /* bar */
          p.fill(...c, hovered ? 255 : 205);
          p.rect(LABEL_W, y + ROW_H / 2 - 9, Math.max(2, bw), 18, 9);

          /* count */
          p.fill(...COL.text, 150);
          p.textAlign(p.LEFT, p.CENTER);
          p.text(String(count), LABEL_W + Math.max(2, bw) + 10, y + ROW_H / 2);

          if (hovered) {
            showTip(
              p,
              `<strong>${label}</strong><br>${count} of ${N} patients (${count}%)`
            );
          }
        });

        if (hoverRow < 0 || hoverRow >= rows.length) hideTip();
        p.cursor(hoverRow >= 0 && hoverRow < rows.length ? "pointer" : "arrow");
      };
    });
  }

  barsSketch("obs-bars", "obsession", OB_COL);
  barsSketch("comp-bars", "compulsion", CO_COL);

  /* ============================================================
     03 · SEVERITY — Y-BOCS scatter with severity bands
     ============================================================ */

  new p5(function (p) {
    const box = document.getElementById("scatter-canvas");
    let w = 0, h = 0, t0 = null, hoverIdx = -1;
    const L = 58, R = 112, T = 34, B = 50;
    const BANDS = [
      [0, 7, "subclinical"],
      [8, 15, "mild"],
      [16, 23, "moderate"],
      [24, 31, "severe"],
      [32, 40, "extreme"],
    ];
    const BAND_A = { subclinical: 0, mild: 5, moderate: 10, severe: 14, extreme: 18 };

    const X = (v) => L + (w - L - R) * (v / 40);
    const Y = (v) => T + (h - T - B) * (1 - v / 40);

    p.setup = function () {
      w = box.clientWidth;
      h = Math.min(560, Math.max(400, w * 0.55));
      p.createCanvas(w, h).parent(box);
    };

    p.windowResized = function () {
      w = box.clientWidth;
      h = Math.min(560, Math.max(400, w * 0.55));
      p.resizeCanvas(w, h);
    };

    p.draw = function () {
      p.clear();
      if (vis.scatter && t0 === null) t0 = p.millis();
      const en = t0 === null ? 0 : easeOut(clamp01((p.millis() - t0) / 1200));

      /* severity bands (describe both axes) */
      p.noStroke();
      for (const [lo, hi, name] of BANDS) {
        const a = BAND_A[name];
        if (a > 0) {
          p.fill(...COL.text, a);
          p.rect(L, Y(hi), w - L - R, Y(lo) - Y(hi));
        }
      }

      /* grid + ticks */
      p.stroke(...COL.text, 26);
      p.strokeWeight(1);
      for (let v = 0; v <= 40; v += 8) {
        p.line(X(v), T, X(v), h - B);
        p.line(L, Y(v), w - R, Y(v));
      }
      p.textFont("Inter, sans-serif");
      p.textSize(10.5);
      p.noStroke();
      p.fill(...COL.text, 120);
      p.textAlign(p.CENTER, p.TOP);
      for (let v = 0; v <= 40; v += 8) p.text(v, X(v), h - B + 8);
      p.textAlign(p.RIGHT, p.CENTER);
      for (let v = 0; v <= 40; v += 8) p.text(v, L - 8, Y(v));

      /* band labels on the right */
      p.textSize(10.5);
      p.textAlign(p.LEFT, p.CENTER);
      for (const [lo, hi, name] of BANDS) {
        p.fill(...COL.text, 100);
        p.text(name, w - R + 10, (Y(lo) + Y(hi)) / 2);
      }

      /* axis titles */
      p.fill(...COL.text, 150);
      p.textSize(11.5);
      p.textAlign(p.CENTER, p.TOP);
      p.text("Y-BOCS obsessions \u2192", L + (w - L - R) / 2, h - B + 24);
      p.push();
      p.translate(14, T + (h - T - B) / 2);
      p.rotate(-p.HALF_PI);
      p.text("Y-BOCS compulsions \u2192", 0, 0);
      p.pop();

      /* in-canvas legend */
      p.textAlign(p.LEFT, p.CENTER);
      p.textSize(10.5);
      let lx = L + 4;
      const leg = [
        ["both dx", COL.coral],
        ["one dx", COL.gold],
        ["neither", COL.gray],
      ];
      for (const [label, c] of leg) {
        p.noStroke();
        p.fill(...c, 220);
        p.circle(lx, 15, 9);
        p.fill(...COL.text, 130);
        p.text(label, lx + 8, 15);
        lx += 8 + p.textWidth(label) + 22;
      }

      /* dots */
      hoverIdx = -1;
      for (let i = 0; i < N; i++) {
        const pt = PATIENTS[i];
        const x = X(pt.ybocsObs), y = Y(pt.ybocsComp);
        const pop = easeOut(clamp01((p.millis() - t0 - i * 6) / 500));
        const r = 5.5 * (t0 === null ? 0 : pop);
        const d = p.dist(p.mouseX, p.mouseY, x, y);
        const hovered = d < 9;
        if (hovered) hoverIdx = i;
        const c = comorbidColor(pt);
        p.noStroke();
        p.fill(...c, hovered ? 255 : 225);
        p.circle(x, y, r * 2);
        if (hovered) {
          p.noFill();
          p.stroke(...COL.text, 190);
          p.strokeWeight(1.4);
          p.circle(x, y, r * 2 + 9);
        }
      }

      p.cursor(hoverIdx >= 0 ? "pointer" : "arrow");
      if (hoverIdx >= 0) {
        const pt = PATIENTS[hoverIdx];
        showTip(
          p,
          `<strong>Patient ${pt.id}</strong> · age ${pt.age}<br>` +
            `obs ${pt.ybocsObs} · comp ${pt.ybocsComp}<br>` +
            `depression: ${pt.depression} · anxiety: ${pt.anxiety}`
        );
      } else {
        hideTip();
      }
    };
  });

  /* ============================================================
     04 · YEARS — 100 lines of duration
     ============================================================ */

  new p5(function (p) {
    const box = document.getElementById("duration-canvas");
    let w = 0, t0 = null;
    const ROW_H = 12.5, TOP = 36, BOTTOM = 48, X0 = 26;
    const sorted = [...PATIENTS].sort((a, b) => a.durMonths - b.durMonths);
    const H = N * ROW_H + TOP + BOTTOM;
    const avgYears = (PATIENTS.reduce((s, pt) => s + pt.durMonths, 0) / N) / 12;
    const maxYears = Math.ceil(Math.max(...PATIENTS.map((pt) => pt.durMonths)) / 12);

    const X1 = () => w - 26;
    const yearX = (yrs) => X0 + (X1() - X0) * (yrs / maxYears);
    const rowY = (i) => TOP + i * ROW_H + ROW_H / 2;

    p.setup = function () {
      w = box.clientWidth;
      p.createCanvas(w, H).parent(box);
    };

    p.windowResized = function () {
      w = box.clientWidth;
      p.resizeCanvas(w, H);
    };

    p.draw = function () {
      p.clear();
      if (vis.duration && t0 === null) t0 = p.millis();
      const t = p.millis();
      p.strokeCap(p.ROUND);
      p.textFont("Inter, sans-serif");

      /* ticks */
      p.noStroke();
      p.fill(...COL.text, 110);
      p.textSize(10.5);
      p.textAlign(p.CENTER, p.TOP);
      for (let y = 0; y <= maxYears; y += 5) {
        p.text(y + (y === 1 ? " yr" : " yrs"), yearX(y), H - BOTTOM + 12);
        p.stroke(...COL.text, 30);
        p.strokeWeight(1);
        p.line(yearX(y), TOP - 8, yearX(y), H - BOTTOM);
        p.noStroke();
      }

      /* average marker */
      p.stroke(...COL.amber, 190);
      p.strokeWeight(1.5);
      p.line(yearX(avgYears), TOP - 8, yearX(avgYears), H - BOTTOM);
      p.noStroke();
      p.fill(...COL.amber, 220);
      p.textAlign(p.LEFT, p.BOTTOM);
      p.text("avg " + avgYears.toFixed(1) + " yrs", yearX(avgYears) + 8, TOP - 2);

      /* longest annotation */
      p.fill(...COL.text, 110);
      p.textAlign(p.RIGHT, p.BOTTOM);
      p.text("longest: " + (sorted[N - 1].durMonths / 12).toFixed(1) + " yrs", X1(), H - BOTTOM + 30);

      /* the 100 lines */
      let hoverIdx = -1;
      p.strokeWeight(3);
      for (let i = 0; i < N; i++) {
        const pt = sorted[i];
        const yrs = pt.durMonths / 12;
        const grow = easeOut(clamp01((t - t0 - i * 14) / 550));
        const hovered =
          p.mouseY > rowY(i) - ROW_H / 2 &&
          p.mouseY < rowY(i) + ROW_H / 2 &&
          p.mouseX >= X0 &&
          p.mouseX <= X1();
        if (hovered) hoverIdx = i;
        const c = p.lerpColor(p.color(...COL.sage), p.color(...COL.coral), yrs / maxYears);
        p.stroke(p.red(c), p.green(c), p.blue(c), hovered ? 255 : 215);
        p.line(X0, rowY(i), X0 + (X1() - X0) * (yrs / maxYears) * grow, rowY(i));
      }
      p.strokeCap(p.ROUND);

      p.cursor(hoverIdx >= 0 ? "pointer" : "arrow");
      if (hoverIdx >= 0) {
        const pt = sorted[hoverIdx];
        showTip(
          p,
          `<strong>Patient ${pt.id}</strong> · age ${pt.age} · ${pt.gender}<br>` +
            `diagnosed ${pt.dxDate}<br>symptoms for <strong>${yearsOf(pt)} years</strong>`
        );
      } else {
        hideTip();
      }
    };
  });

  /* ============================================================
     07 · BREATHE — a slower loop
     ============================================================ */

  new p5(function (p) {
    const box = document.getElementById("breathe-canvas");
    const S = 300;
    let t0 = null;

    p.setup = function () {
      p.createCanvas(S, S).parent(box);
    };

    p.draw = function () {
      p.clear();
      if (!vis.breathe) return;
      if (t0 === null) t0 = p.millis();
      const t = (p.millis() - t0) / 1000;
      const period = 9;
      const ph = (t % period) / period;
      const r = S * 0.22 + S * 0.085 * Math.sin(p.TWO_PI * ph - p.HALF_PI);
      const label =
        ph < 0.35 ? "breathe in" : ph < 0.5 ? "hold" : ph < 0.85 ? "breathe out" : "hold";

      p.noStroke();
      p.fill(...COL.amber, 16);
      p.circle(S / 2, S / 2, r * 2);
      p.noFill();
      p.stroke(...COL.amber, 150);
      p.strokeWeight(1.6);
      p.circle(S / 2, S / 2, r * 2);
      p.noStroke();
      p.fill(...COL.amber, 220);
      p.circle(S / 2, S / 2, 5);

      p.fill(...COL.text, 120);
      p.textFont("Georgia, serif");
      p.textStyle(p.ITALIC);
      p.textSize(15);
      p.textAlign(p.CENTER, p.CENTER);
      p.text(REDUCED ? "breathe" : label, S / 2, S / 2 + r + 24);
      p.textStyle(p.NORMAL);
    };
  });

  /* ============================================================
     plain-JS wiring: stats, count-ups, med chips, reveals
     ============================================================ */

  const setStat = (k, v) =>
    document.querySelectorAll(`[data-stat="${k}"]`).forEach((el) => (el.textContent = v));

  const sum = (fn) => PATIENTS.reduce((s, pt) => s + fn(pt), 0);
  const ages = PATIENTS.map((pt) => pt.age);
  const durs = PATIENTS.map((pt) => pt.durMonths);
  const yObsAvg = sum((pt) => pt.ybocsObs) / N;
  const yCompAvg = sum((pt) => pt.ybocsComp) / N;
  const severeOrExtreme = PATIENTS.filter(
    (pt) => Math.max(pt.ybocsObs, pt.ybocsComp) >= 24
  ).length;
  const moderatePlus = PATIENTS.filter(
    (pt) => Math.max(pt.ybocsObs, pt.ybocsComp) >= 16
  ).length;

  setStat("age-min", Math.min(...ages));
  setStat("age-max", Math.max(...ages));
  setStat("yobs", yObsAvg.toFixed(1));
  setStat("ycomp", yCompAvg.toFixed(1));
  setStat("severe", severeOrExtreme);
  setStat("modplus", moderatePlus);
  setStat("avg-years", (sum((pt) => pt.durMonths) / N / 12).toFixed(1));
  setStat("over10", durs.filter((d) => d / 12 > 10).length);
  setStat("max-years", (Math.max(...durs) / 12).toFixed(1));

  /* count-up stat cards */
  const countIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        countIO.unobserve(e.target);
        const el = e.target;
        const target = +el.dataset.count;
        const suffix = el.dataset.suffix || "";
        if (REDUCED) {
          el.textContent = target + suffix;
          return;
        }
        const start = performance.now();
        const dur = 1300;
        (function step(now) {
          const k = clamp01((now - start) / dur);
          el.textContent = Math.round(target * easeOut(k)) + suffix;
          if (k < 1) requestAnimationFrame(step);
        })(start);
      });
    },
    { threshold: 0.5 }
  );
  document.querySelectorAll("[data-count]").forEach((el) => countIO.observe(el));

  /* medication chips */
  const medCounts = {};
  PATIENTS.forEach((pt) => (medCounts[pt.medication] = (medCounts[pt.medication] || 0) + 1));
  document.getElementById("med-chips").innerHTML = Object.entries(medCounts)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([med, c]) =>
        `<span class="chip">${med === "None" ? "no medication" : med} &times; <strong>${c}</strong></span>`
    )
    .join("");

  /* section reveal */
  const revealIO = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          revealIO.unobserve(e.target);
        }
      }),
    { threshold: 0.08 }
  );
  document.querySelectorAll(".reveal").forEach((el) => revealIO.observe(el));
})();
