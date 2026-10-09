/* ============================================================
   It Was Never About Being Tidy, sketch.js
   p5.js (instance mode) + plain JS for stats, tooltip, UI
   ============================================================ */

(function () {
  if (typeof PATIENTS === "undefined" || !PATIENTS.length) {
    console.error("data.js did not load, no patient data.");
    return;
  }

  /* ---------------- shared helpers ---------------- */

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const N = PATIENTS.length;

  const COL = {
    mint: [104, 228, 166],
    mintGlow: [173, 245, 210],
    mintSoft: [150, 234, 195],
    mintFaint: [198, 244, 218],
    mintMid: [66, 192, 130],
    mintDeep: [46, 152, 100],
    mintDark: [34, 116, 76],
    mintDim: [92, 124, 106],
    text: [220, 245, 231],
  };

  const OB_COL = {
    "Contamination": COL.mintDeep,
    "Harm-related": COL.mint,
    "Religious": COL.mintSoft,
    "Symmetry": COL.mintFaint,
    "Hoarding": COL.mintDark,
  };

  const CO_COL = {
    "Checking": COL.mintDeep,
    "Washing": COL.mintMid,
    "Ordering": COL.mintSoft,
    "Praying": COL.mintDark,
    "Counting": COL.mint,
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
    return both ? COL.mint : one ? COL.mintSoft : COL.mintDim;
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
     01 · THE 100, interactive grid
     ============================================================ */

  let gridMode = "gender";

  const LEGENDS = {
    gender: [
      ["female", COL.mint],
      ["male", COL.mintMid],
    ],
    obsession: Object.entries(OB_COL).map(([k, v]) => [k.toLowerCase(), v]),
    compulsion: Object.entries(CO_COL).map(([k, v]) => [k.toLowerCase(), v]),
    comorbidity: [
      ["depression + anxiety", COL.mint],
      ["one of the two", COL.mintSoft],
      ["neither", COL.mintDim],
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
      if (gridMode === "gender") return pt.gender === "Female" ? COL.mint : COL.mintMid;
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
     HERO, 100 breathing dots
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
          p.fill(...COL.mintGlow, 40);
          p.circle(pos[i][0], pos[i][1], r * 4);
          p.fill(...COL.mint, 230);
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
     02 · THE LOOP, echoing intrusive thoughts
     ============================================================ */

  const ECHO_WORDS = [
    "what if I hurt someone?",
    "did I really lock the door?",
    "it has to be even",
    "contaminated, wash again",
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
          accent: txt.indexOf("again") >= 0,
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
      p.textFont("Avenir Next");
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
        const alpha = a * (wd.accent ? 130 : 105);
        p.fill(...(wd.accent ? COL.mint : COL.text), alpha);
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

        p.textFont("Avenir Next");
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
     06 · THOUGHTS WALL, anonymous intrusive thoughts
     Submitted thoughts stay in this browser (localStorage);
     nothing is uploaded anywhere.
     ============================================================ */

  const WALL_SEEDS = [
    "am I a bad person?",
    "what if I hurt someone I love?",
    "did I really lock the door?",
    "everyone can tell I'm faking",
    "what did I touch?",
    "count to 40. again.",
    "what if I blurt it out?",
    "the stove. the stove. the stove.",
    "what if that bump in the road was someone?",
    "did I say it wrong?",
    "it has to feel right, or it isn't",
    "what if I'm secretly dangerous?",
    "they can see the thoughts",
    "wash until it's clean. it's never clean.",
    "what if I get sick from that?",
    "keep it or lose something",
    "one more check. just one.",
    "what if this feeling never ends?",
  ];
  const WALL_KEY = "thoughts-wall-v1";
  const WALL_MAX = 80;

  function loadWallThoughts() {
    try {
      const raw = JSON.parse(localStorage.getItem(WALL_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((s) => typeof s === "string" && s.trim())
        .map((s) => s.trim().slice(0, 140))
        .slice(-WALL_MAX);
    } catch (e) {
      return [];
    }
  }

  const userThoughts = loadWallThoughts();
  let wallRelease = null;

  new p5(function (p) {
    const box = document.getElementById("wall-canvas");
    let w = 0, h = 0;
    const items = [];

    function place(txt, fromBottom) {
      /* pick the emptiest of a few random spots so thoughts don't stack */
      let bx = 0, by = 0, best = -1;
      for (let a = 0; a < 14; a++) {
        const x = p.random(60, Math.max(80, w - 60));
        const y = fromBottom ? h + 26 : p.random(30, h - 30);
        let near = Infinity;
        for (const it of items) {
          const d = p.dist(x, y, it.x, it.y);
          if (d < near) near = d;
        }
        if (near > best) { best = near; bx = x; by = y; }
        if (best > 130) break;
      }
      return { x: bx, y: by };
    }

    function release(txt, fresh) {
      const t = txt.trim().slice(0, 140);
      if (!t) return;
      const pos = place(t, !!fresh);
      items.push({
        txt: t,
        x: pos.x,
        y: pos.y,
        size: p.random(13.5, 21),
        vy: p.random(0.1, 0.26),
        seed: p.random(1000),
        born: fresh ? p.millis() : -1,
      });
    }

    wallRelease = (txt) => release(txt, true);

    p.setup = function () {
      w = box.clientWidth;
      h = box.clientHeight || 340;
      p.createCanvas(w, h).parent(box);
      for (const t of WALL_SEEDS) release(t, false);
      for (const t of userThoughts) release(t, false);
    };

    p.windowResized = function () {
      w = box.clientWidth;
      h = box.clientHeight || 340;
      p.resizeCanvas(w, h);
    };

    p.draw = function () {
      p.clear();
      if (!vis.wall) return;
      const t = p.millis();
      p.textFont("Avenir Next");
      p.textAlign(p.CENTER, p.CENTER);
      p.textStyle(p.ITALIC);

      for (const it of items) {
        if (!REDUCED) {
          it.y -= it.vy;
          it.x += (p.noise(it.seed, t * 0.00045) - 0.5) * 0.7;
          if (it.y < -24) {
            it.y = h + 24;
            it.x = p.random(60, Math.max(80, w - 60));
          }
        }

        let alpha = 115;
        let fresh = 0;
        if (REDUCED) alpha = 95;
        if (it.born >= 0) {
          fresh = Math.max(0, 1 - (t - it.born) / 6000);
          alpha = 130 + fresh * 125;
          if (t - it.born > 9000) it.born = -1;
        }

        /* shrink long thoughts so they stay inside the wall */
        let size = it.size;
        const tw = p.textWidth(it.txt);
        const maxW = w - 56;
        if (tw > maxW) size = Math.max(11, (size * maxW) / tw);
        p.textSize(size);

        p.fill(...(fresh > 0 ? COL.mint : COL.text), alpha);
        p.text(it.txt, it.x, it.y);
      }
      p.textStyle(p.NORMAL);
    };
  });

  /* form wiring: counter, submit, persist */
  const thoughtForm = document.getElementById("thought-form");
  const thoughtInput = document.getElementById("thought-input");
  const thoughtCount = document.getElementById("thought-count");

  thoughtInput.addEventListener("input", () => {
    thoughtCount.textContent = thoughtInput.value.length + " / 140";
  });

  thoughtForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const txt = thoughtInput.value.trim().slice(0, 140);
    if (!txt) return;
    userThoughts.push(txt);
    try {
      localStorage.setItem(WALL_KEY, JSON.stringify(userThoughts.slice(-WALL_MAX)));
    } catch (err) {
      /* storage unavailable (e.g. private mode), the thought still joins the wall */
    }
    if (wallRelease) wallRelease(txt);
    thoughtInput.value = "";
    thoughtCount.textContent = "0 / 140";
  });

  /* ============================================================
     04 · YEARS, 100 lines of duration
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
    p.textFont("Avenir Next");

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
      p.stroke(...COL.mintGlow, 190);
      p.strokeWeight(1.5);
      p.line(yearX(avgYears), TOP - 8, yearX(avgYears), H - BOTTOM);
      p.noStroke();
      p.fill(...COL.mintGlow, 220);
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
        const c = p.lerpColor(p.color(...COL.mintDeep), p.color(...COL.mint), yrs / maxYears);
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
     07 · BREATHE, a slower loop
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
      p.fill(...COL.mintGlow, 16);
      p.circle(S / 2, S / 2, r * 2);
      p.noFill();
      p.stroke(...COL.mintGlow, 150);
      p.strokeWeight(1.6);
      p.circle(S / 2, S / 2, r * 2);
      p.noStroke();
      p.fill(...COL.mintGlow, 220);
      p.circle(S / 2, S / 2, 5);

      p.fill(...COL.text, 120);
      p.textFont("Avenir Next");
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

  setStat("age-min", Math.min(...ages));
  setStat("age-max", Math.max(...ages));
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
