/* ============================================================
   アタックチャンス・パネルゲーム  (6チーム / オセロ式)
   ============================================================ */
const { useState, useEffect, useRef, useCallback } = React;

const SIZE = 6;
const CELLS = SIZE * SIZE;

const TEAMS = [
  { name: "あか",     color: "#ff5a5a", txt: "#fff",     crown: "👑" },
  { name: "あお",     color: "#2d9cff", txt: "#fff",     crown: "👑" },
  { name: "きいろ",   color: "#ffc93c", txt: "#6b4a00",  crown: "👑" },
  { name: "みどり",   color: "#34d17e", txt: "#fff",     crown: "👑" },
  { name: "むらさき", color: "#a66bff", txt: "#fff",     crown: "👑" },
  { name: "オレンジ", color: "#ff8a3d", txt: "#fff",     crown: "👑" },
];

const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

// オセロ判定: idx に team を置いたとき裏返るマスの一覧
function computeFlips(board, idx, team) {
  const r0 = Math.floor(idx / SIZE), c0 = idx % SIZE;
  const out = [];
  for (const [dr, dc] of DIRS) {
    let r = r0 + dr, c = c0 + dc;
    const line = [];
    let bracketed = false;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
      const j = r * SIZE + c;
      const o = board[j];
      if (o === null) break;          // 空きマスで途切れる → 裏返らない
      if (o === team) { bracketed = true; break; } // 自分の色で挟めた
      line.push(j);                    // 相手の色 → 候補
      r += dr; c += dc;
    }
    if (bracketed && line.length) out.push(...line);
  }
  return out;
}

// ---- 紙吹雪 ----
function Confetti() {
  const pieces = React.useMemo(() => {
    const cols = TEAMS.map(t => t.color).concat(["#fff", "#ffe08a"]);
    return Array.from({ length: 110 }, (_, i) => ({
      left: Math.random() * 100,
      c: cols[i % cols.length],
      w: 8 + Math.random() * 10,
      h: 12 + Math.random() * 14,
      dur: 2.4 + Math.random() * 2.6,
      delay: -Math.random() * 4,
    }));
  }, []);
  return (
    <div className="confetti">
      {pieces.map((p, i) => (
        <i key={i} style={{
          left: p.left + "%", "--c": p.c, "--w": p.w + "px", "--h": p.h + "px",
          "--dur": p.dur + "s", "--delay": p.delay + "s",
        }}></i>
      ))}
    </div>
  );
}

function Trophy({ color }) {
  return (
    <svg className="trophy" viewBox="0 0 120 130" fill="none">
      <path d="M30 14h60v22a30 30 0 0 1-60 0V14Z" fill={color} stroke="#5a3500" strokeWidth="4" strokeLinejoin="round"/>
      <path d="M30 18H16a10 10 0 0 0 0 20c6 0 12-4 14-9" stroke="#5a3500" strokeWidth="5" fill="none" strokeLinecap="round"/>
      <path d="M90 18h14a10 10 0 0 1 0 20c-6 0-12-4-14-9" stroke="#5a3500" strokeWidth="5" fill="none" strokeLinecap="round"/>
      <rect x="52" y="62" width="16" height="20" fill={color} stroke="#5a3500" strokeWidth="4"/>
      <path d="M36 84h48l-6 16H42l-6-16Z" fill={color} stroke="#5a3500" strokeWidth="4" strokeLinejoin="round"/>
      <rect x="30" y="100" width="60" height="14" rx="4" fill="#5a3500"/>
      <path d="M52 30l4 8 9 1-6.5 6 1.5 9-8-4.5-8 4.5 1.5-9-6.5-6 9-1 4-8Z" fill="#fff8e6"/>
    </svg>
  );
}

function App() {
  const [board, setBoard] = useState(() => Array(CELLS).fill(null));
  const [active, setActive] = useState(0);
  const [armed, setArmed] = useState(false);        // アタックチャンス中
  const [banner, setBanner] = useState(false);      // 全画面演出
  const [flash, setFlash] = useState(false);
  const [result, setResult] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const [popped, setPopped] = useState(-1);
  const [flips, setFlips] = useState([]);
  const [shaking, setShaking] = useState(-1);
  const [hintsOn, setHintsOn] = useState(true);    // とれるマスのヒント
  const [flipToast, setFlipToast] = useState(null);
  const history = useRef([]);
  const animTimer = useRef(null);

  const counts = TEAMS.map((_, t) => board.reduce((a, x) => a + (x === t ? 1 : 0), 0));
  const remaining = board.reduce((a, x) => a + (x === null ? 1 : 0), 0);
  const maxCount = Math.max(...counts);
  const leaders = maxCount > 0 ? counts.map((c, i) => c === maxCount ? i : -1).filter(i => i >= 0) : [];

  // いまのチームで置いたら何枚とれるか（オセロのヒント）
  const hintCounts = React.useMemo(() => {
    if (!hintsOn || result) return null;
    return board.map((owner, i) => {
      const placeable = armed ? true : owner === null;
      if (!placeable) return 0;
      return computeFlips(board, i, active).length;
    });
  }, [board, active, armed, hintsOn, result]);

  const clearAnim = () => { clearTimeout(animTimer.current); setPopped(-1); setFlips([]); };

  const place = useCallback((i) => {
    if (result || banner) return;
    const target = board[i];
    if (!armed && target !== null) {           // 通常時は空きマスのみ
      setShaking(i);
      setTimeout(() => setShaking(-1), 360);
      return;
    }
    history.current.push({ board: board.slice(), active, armed });
    const newBoard = board.slice();
    newBoard[i] = active;
    const r0 = Math.floor(i / SIZE), c0 = i % SIZE;
    const toFlip = computeFlips(board, i, active);
    // 置いたマスから近い順に並べて、パタパタと順番にめくる
    toFlip.sort((a, b) => {
      const da = Math.max(Math.abs(Math.floor(a / SIZE) - r0), Math.abs((a % SIZE) - c0));
      const db = Math.max(Math.abs(Math.floor(b / SIZE) - r0), Math.abs((b % SIZE) - c0));
      return da - db;
    });
    toFlip.forEach(j => { newBoard[j] = active; });
    setBoard(newBoard);

    clearAnim();
    setPopped(i);
    setFlips(toFlip);
    const totalAnim = 520 + toFlip.length * 55;
    animTimer.current = setTimeout(() => { setPopped(-1); setFlips([]); }, totalAnim);
    if (toFlip.length > 0) {
      const key = Date.now();
      setFlipToast({ n: toFlip.length, key });
      setTimeout(() => setFlipToast(t => (t && t.key === key ? null : t)), 1300);
    }

    if (armed) {
      setArmed(false);
      setFlash(true);
      setTimeout(() => setFlash(false), 480);
    }
  }, [board, active, armed, result, banner]);

  const startAttack = () => {
    if (result) return;
    setBanner(true);
    setTimeout(() => { setBanner(false); setArmed(true); }, 2300);
  };

  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    clearAnim();
    setBoard(prev.board);
    setActive(prev.active);
    setArmed(prev.armed);
  };

  const doReset = () => {
    clearAnim();
    setBoard(Array(CELLS).fill(null));
    setActive(0);
    setArmed(false);
    setResult(null);
    setConfirmReset(false);
    history.current = [];
  };

  const showResult = () => {
    setArmed(false);
    setBanner(false);
    setResult({ leaders: leaders.slice(), counts: counts.slice() });
  };

  // 全マス埋まったら自動で結果発表
  useEffect(() => {
    if (remaining === 0 && !result && !banner) {
      const t = setTimeout(() => showResult(), 900);
      return () => clearTimeout(t);
    }
  }, [remaining, result, banner]);

  // キーボード操作（運営向け）
  useEffect(() => {
    const onKey = (e) => {
      if (e.key >= "1" && e.key <= "6") setActive(+e.key - 1);
      else if (e.key === "a" || e.key === "A") startAttack();
      else if (e.key === "u" || e.key === "U") undo();
      else if (e.key === "h" || e.key === "H") setHintsOn(v => !v);
      else if (e.key === "Escape") { setBanner(false); setResult(null); setConfirmReset(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const at = TEAMS[active];
  // ランキング（結果用）
  const ranking = result
    ? TEAMS.map((t, i) => ({ ...t, i, c: result.counts[i] })).sort((a, b) => b.c - a.c)
    : [];
  const winColor = result && result.leaders.length ? TEAMS[result.leaders[0]].color : "#ccc";
  const isTie = result && result.leaders.length > 1;

  const titleChars = "アタックチャンス".split("");

  return (
    <div className="app" style={{ "--tc": at.color }}>
      {/* ===== topbar ===== */}
      <div className="topbar">
        <div className="brand">
          <h1>
            {titleChars.map((ch, i) => (
              <span key={i} style={{
                color: TEAMS[i % TEAMS.length].color,
                "--rot": (i % 2 ? 3 : -3) + "deg",
              }}>{ch}</span>
            ))}
          </h1>
          <div className="tag">6チームで パネルを とりあえ！</div>
        </div>
        <div className="status">
          <div className="turnchip" style={{ "--tc": at.color }}>
            <div className="dot"></div>
            <div className="who">
              <small>いまのチーム</small>
              <b>{at.name}チーム</b>
            </div>
          </div>
          <div className="remain">
            <div className="n">{remaining}</div>
            <div className="l">のこり</div>
          </div>
        </div>
      </div>

      {/* ===== stage ===== */}
      <div className="stage">
        <div className="board-wrap">
          <div className={"board-card" + (armed ? " armed" : "")}>
            {armed && <div className="armed-badge">⚡ アタックチャンス中！すきなパネルをえらぼう</div>}
            <div className="board">
              {board.map((owner, i) => {
                const owned = owner !== null;
                const t = owned ? TEAMS[owner] : null;
                const flipOrder = flips.indexOf(i);
                const hintN = hintCounts ? hintCounts[i] : 0;
                let cls = "panel " + (owned ? "owned" : "blank");
                if (i === popped) cls += " pop";
                else if (flipOrder >= 0) cls += " flip";
                if (i === shaking) cls += " shake";
                if (hintN > 0) cls += " hint";
                const style = owned ? { "--tc": t.color, "--txt": t.txt } : {};
                if (hintN > 0) style["--hc"] = at.color;
                if (flipOrder >= 0) style.animationDelay = (flipOrder * 55) + "ms";
                return (
                  <button
                    key={i}
                    className={cls}
                    style={style}
                    onClick={() => place(i)}
                  >
                    <span className="num">{i + 1}</span>
                    {hintN > 0 && <span className="flipbadge">+{hintN}</span>}
                  </button>
                );
              })}
            </div>
            {flipToast && <div className="fliptoast" key={flipToast.key}>+{flipToast.n}まい ゲット！</div>}
          </div>
        </div>

        {/* ===== sidebar ===== */}
        <div className="sidebar">
          <div className="side-title">
            とくてんボード
            <button
              className={"hinttoggle" + (hintsOn ? " on" : "")}
              onClick={() => setHintsOn(v => !v)}
            >
              💡 とれるマス {hintsOn ? "ON" : "OFF"}
            </button>
          </div>
          <div className="scoreboard">
            {TEAMS.map((t, i) => {
              const isLead = leaders.includes(i) && counts[i] > 0;
              return (
                <button
                  key={i}
                  className={"tcard" + (active === i ? " active" : "")}
                  style={{ "--tc": t.color }}
                  onClick={() => setActive(i)}
                >
                  <div className="swatch">
                    {isLead && <span className="crown">{t.crown}</span>}
                  </div>
                  <div className="meta">
                    <div className="nm">{t.name}</div>
                    <div className="bar"><i style={{ width: (counts[i] / CELLS * 100) + "%" }}></i></div>
                  </div>
                  <div className="cnt">{counts[i]}<small>まい</small></div>
                  <span className="pickhint">えらび中</span>
                </button>
              );
            })}
          </div>

          <div className="controls">
            <button className="btn btn-attack" onClick={startAttack} disabled={!!result}>
              ⚡ アタックチャンス！
            </button>
            <div className="btn-row">
              <button className="btn btn-undo" onClick={undo}>↩ ひとつもどる</button>
              <button className="btn btn-reset" onClick={() => setConfirmReset(true)}>はじめから</button>
            </div>
            <button className="btn btn-result" onClick={showResult}>🏆 けっか はっぴょう</button>
          </div>
        </div>
      </div>

      {/* ===== attack banner ===== */}
      {banner && (
        <div className="overlay attack-banner" onClick={() => { setBanner(false); setArmed(true); }}>
          <div className="rays"></div>
          <div className="pulse"></div>
          <span className="spark" style={{ left: "12%", top: "20%" }}>⭐</span>
          <span className="spark" style={{ right: "14%", top: "24%", animationDelay: ".3s" }}>✨</span>
          <span className="spark" style={{ left: "18%", bottom: "18%", animationDelay: ".6s" }}>✨</span>
          <span className="spark" style={{ right: "16%", bottom: "20%", animationDelay: ".2s" }}>⭐</span>
          <div className="attack-word">
            アタックチャンス！
            <small>すきな パネルを ねらえ</small>
          </div>
        </div>
      )}

      {flash && <div className="flash"></div>}

      {/* ===== result ===== */}
      {result && (
        <div className="overlay result">
          <Confetti />
          <div className="result-card" style={{ "--tc": winColor }}>
            <div className="label">けっか はっぴょう</div>
            <Trophy color={winColor} />
            {isTie ? (
              <div className="champ" style={{ "--tc": "#ff9f1c" }}>
                ひきわけ！
              </div>
            ) : (
              <div className="champ">
                {TEAMS[result.leaders[0]].name}<small>チーム</small>
              </div>
            )}
            <div className="panels">
              {isTie
                ? result.leaders.map(i => TEAMS[i].name).join("・") + " が " + maxCount + "まいで どうてん！"
                : "ゆうしょう！　" + maxCount + "まい かくとく 🎉"}
            </div>
            <div className="ranks">
              {ranking.map((t, idx) => (
                <span key={t.i} className="rk" style={{ "--c": t.color }}>
                  <span className="d"></span>{idx + 1}い {t.name} {t.c}
                </span>
              ))}
            </div>
            <div className="rbtns">
              <button className="btn btn-ghost" onClick={() => setResult(null)}>もどる</button>
              <button className="btn btn-result" onClick={doReset}>もういちど あそぶ</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== reset confirm ===== */}
      {confirmReset && (
        <div className="overlay confirm" onClick={() => setConfirmReset(false)}>
          <div className="confirm-card" onClick={e => e.stopPropagation()}>
            <h2>はじめから やりなおす？</h2>
            <p>いまのとくてんは ぜんぶ きえちゃうよ</p>
            <div className="cbtns">
              <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>やめる</button>
              <button className="btn btn-reset" onClick={doReset}>リセットする</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
