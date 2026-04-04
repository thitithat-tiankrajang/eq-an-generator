// ══════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════

const TILE_POINTS = {
    '0':1,'1':1,'2':1,'3':1,'4':2,'5':2,'6':2,'7':2,'8':2,'9':2,
    '10':3,'11':4,'12':3,'13':6,'14':4,'15':4,'16':4,'17':6,'18':4,'19':7,'20':5,
    '+':2,'-':2,'x':2,'÷':2,'+/-':1,'x/÷':1,'=':1,'?':0
  };
  
  const PAD_TILES = [
    {v:'1'},{v:'2'},{v:'3'},{v:'4'},{v:'5'},{v:'+'},
    {v:'6'},{v:'7'},{v:'8'},{v:'9'},{v:'10'},{v:'-'},
    {v:'11'},{v:'12'},{v:'13'},{v:'14'},{v:'15'},{v:'x'},
    {v:'16'},{v:'17'},{v:'18'},{v:'19'},{v:'20'},{v:'÷'},
    {v:'0',span:2},{v:'+/-'},{v:'x/÷'},{v:'?'},{v:'='},
  ];
  
  const BONUS_CYCLE  = ['p1','p2','p3','e2','e3'];
  const BONUS_LABELS = { p1:'p×1', p2:'p×2', p3:'p×3', e2:'e×2', e3:'e×3' };
  
  const SPECIAL_MAP = {
    '+/-': ['+', '-'],
    'x/÷': ['*', '/'],
    'x':   ['*'],
    '÷':   ['/'],
    '?':   ['0','1','2','3','4','5','6','7','8','9',
            '10','11','12','13','14','15','16','17','18','19','20',
            '+','-','*','/','=']
  };
  
  // Shared token classification sets (reused by all check functions)
  const MARKS_SET = new Set(['=','+','-','*','/']);
  const UNIT_SET  = new Set(['0','1','2','3','4','5','6','7','8','9']);
  const TENS_SET  = new Set(['10','11','12','13','14','15','16','17','18','19','20']);
  
  function mustBeNum(t) { return UNIT_SET.has(t) || TENS_SET.has(t); }
  function mustBeOp(t)  { return t==='+' || t==='-' || t==='*' || t==='/'; }
  function mustBeEq(t)  { return t==='='; }
  function couldBeEq(t) { return t==='=' || t==='?'; }

  
  // ══════════════════════════════════════════════════════════════
  // OPTIMIZATION 1 — ConditionTemplate
  // Structural pre-filter on raw (unexpanded) token sequence.
  // Eliminates sequences that can NEVER be valid, before expand.
  // Called on every permutation → avoids 26x branch explosion from '?'.
  // ══════════════════════════════════════════════════════════════
  
  function ConditionTemplate(seq) {
    const n = seq.length;
    if (n === 0) return false;
    if (!seq.some(couldBeEq)) return false;           // must have some '='
  
    const first = seq[0];
    if (first==='+' || first==='*' || first==='/' || mustBeEq(first)) return false;
  
    const last = seq[n-1];
    if (mustBeOp(last) || mustBeEq(last)) return false;
  
    for (let i = 0; i < n-1; i++) {
      const a = seq[i], b = seq[i+1];
      // two definite operators/eq adjacent
      if ((mustBeOp(a)||mustBeEq(a)) && (mustBeOp(b)||mustBeEq(b))) {
        if (!(couldBeEq(a) && b==='-')) return false;
      }
      if (TENS_SET.has(a) && TENS_SET.has(b)) return false;
      if (mustBeNum(a) && mustBeNum(b)) {
        if ((TENS_SET.has(a)&&UNIT_SET.has(b)) || (UNIT_SET.has(a)&&TENS_SET.has(b))) return false;
      }
      if ((a==='/'||a==='-') && b==='0') return false;
    }
    return true;
  }
  
  // ══════════════════════════════════════════════════════════════
  // OPTIMIZATION 3 — Prefix pruning for permutation generation
  // Rejects partial sequences early during backtracking,
  // avoiding entire subtrees that can never be valid.
  // ══════════════════════════════════════════════════════════════
  
  function prefixOk(prefix, totalLen) {
    const n = prefix.length;
    if (n === 0) return true;
  
    const first = prefix[0];
    if (first==='+' || first==='*' || first==='/' || mustBeEq(first)) return false;
  
    if (n === totalLen) {
      if (!prefix.some(couldBeEq)) return false;
      const last = prefix[n-1];
      if (mustBeOp(last) || mustBeEq(last)) return false;
    }
  
    if (n >= 2) {
      const a = prefix[n-2], b = prefix[n-1];
      if ((mustBeOp(a)||mustBeEq(a)) && (mustBeOp(b)||mustBeEq(b))) {
        if (!(couldBeEq(a) && b==='-')) return false;
      }
      if (TENS_SET.has(a) && TENS_SET.has(b)) return false;
      if (mustBeNum(a) && mustBeNum(b)) {
        if ((TENS_SET.has(a)&&UNIT_SET.has(b)) || (UNIT_SET.has(a)&&TENS_SET.has(b))) return false;
      }
      if ((a==='/'||a==='-') && b==='0') return false;
    }
    return true;
  }
  
  function* permsGen(arr) {
    function* rec(remaining, prefix, totalLen) {
      if (!remaining.length) { yield prefix; return; }
      const seen = new Set();
      for (let i = 0; i < remaining.length; i++) {
        const v = remaining[i];
        if (seen.has(v)) continue;
        seen.add(v);
        const next = [...prefix, v];
        if (!prefixOk(next, totalLen)) continue;
        yield* rec(remaining.filter((_,j)=>j!==i), next, totalLen);
      }
    }
    yield* rec(arr, [], arr.length);
  }
  
  // ══════════════════════════════════════════════════════════════
  // State
  // ══════════════════════════════════════════════════════════════
  
  let filled        = [];
  let maxFilled     = 9;
  let currentTarget = "top";
  let mode          = "mode1";
  let solutions     = [];
  let shownCount    = 0;
  let segments      = [];
  let trailingEmpty = 0;
  let bonusMap      = {};
  
  // ══════════════════════════════════════════════════════════════
  // Tile helpers
  // ══════════════════════════════════════════════════════════════
  
  function tilePoint(v) { return TILE_POINTS[v] ?? 0; }
  
  function makeTileEl(v, extraClass = '') {
    const el = document.createElement("div");
    el.className = "pawn-slot" + (extraClass ? ' ' + extraClass : '');
    el.textContent = v;
    const pt = document.createElement("span");
    pt.className = "tile-pt";
    pt.textContent = tilePoint(v);
    el.appendChild(pt);
    return el;
  }
  
  // ══════════════════════════════════════════════════════════════
  // Build pawn pad
  // ══════════════════════════════════════════════════════════════
  
  function buildPad() {
    const pad = document.getElementById("pawnPad");
    pad.innerHTML = "";
    PAD_TILES.forEach(tile => {
      const wrap = document.createElement("div");
      wrap.className = "pawn-btn-wrap" + (tile.span === 2 ? " zero" : "");
      const btn = document.createElement("input");
      btn.type = "button"; btn.value = tile.v;
      wrap.appendChild(btn);
      const ptBadge = document.createElement("span");
      ptBadge.className = "pad-pt";
      ptBadge.textContent = tilePoint(tile.v);
      wrap.appendChild(ptBadge);
      wrap.addEventListener("click", () => handlePadClick(tile.v));
      pad.appendChild(wrap);
    });
  }
  
  function handlePadClick(v) {
    if (currentTarget === "top") {
      if (filled.length < maxFilled) { filled.push(v); renderTop(); }
      else alert("Rack is full!");
    } else if (currentTarget && currentTarget._segIdx !== undefined) {
      const si = currentTarget._segIdx, ti = currentTarget._tileIdx;
      segments[si].tiles[ti] = v;
      if (ti+1 < segments[si].tiles.length && segments[si].tiles[ti+1]==="")
        currentTarget = { _segIdx: si, _tileIdx: ti+1 };
      buildSegmentUI();
    }
  }
  
  // ══════════════════════════════════════════════════════════════
  // Rack display
  // ══════════════════════════════════════════════════════════════
  
  function renderTop() {
    const box = document.getElementById("topDisplay");
    box.innerHTML = "";
    filled.forEach(v => box.appendChild(makeTileEl(v)));
    if (currentTarget === "top") box.classList.add("targeting");
    else box.classList.remove("targeting");
  }
  
  // ══════════════════════════════════════════════════════════════
  // Segment builder
  // ══════════════════════════════════════════════════════════════
  
  function buildSegmentUI() {
    const builder = document.getElementById("segmentBuilder");
    builder.innerHTML = "";
  
    segments.forEach((seg, si) => {
      const row = document.createElement("div");
      row.className = "seq-row";
      row.style.marginBottom = "6px";
  
      row.appendChild(makeEmptyBox(seg.before, v => {
        segments[si].before = Math.max(0, parseInt(v)||0); updatePreview();
      }, "Before"));
  
      const arrow = document.createElement("span");
      arrow.textContent = "→"; arrow.style.color = "#aaa";
      row.appendChild(arrow);
  
      const lbl = document.createElement("span");
      lbl.style.cssText = "font-size:12px;color:#888;";
      lbl.textContent = `Group ${si+1}:`;
      row.appendChild(lbl);
  
      const addBtn = document.createElement("button");
      addBtn.className = "add-tile-btn"; addBtn.textContent = "+";
      addBtn.addEventListener("click", () => { segments[si].tiles.push(""); buildSegmentUI(); });
      row.appendChild(addBtn);
  
      if (seg.tiles.length > 0) {
        const remBtn = document.createElement("button");
        remBtn.className = "remove-tile-btn"; remBtn.textContent = "−";
        remBtn.addEventListener("click", () => {
          segments[si].tiles.pop();
          if (currentTarget && currentTarget._segIdx===si &&
              currentTarget._tileIdx>=segments[si].tiles.length) selectTopTarget();
          buildSegmentUI();
        });
        row.appendChild(remBtn);
      }
  
      const tileGroup = document.createElement("div");
      tileGroup.className = "tile-group";
      seg.tiles.forEach((t, ti) => tileGroup.appendChild(makeFixedTileSlot(t, si, ti)));
      row.appendChild(tileGroup);
      builder.appendChild(row);
    });
  
    const trailRow = document.createElement("div");
    trailRow.className = "seq-row";
    trailRow.appendChild(makeEmptyBox(trailingEmpty, v => {
      trailingEmpty = Math.max(0, parseInt(v)||0); updatePreview();
    }, "After"));
    builder.appendChild(trailRow);
    updatePreview();
  }
  
  function makeEmptyBox(val, onChange, label) {
    const wrap = document.createElement("div"); wrap.className = "empty-box";
    const lbl = document.createElement("span");
    lbl.className = "empty-label"; lbl.textContent = label + ":";
    const inp = document.createElement("input");
    inp.type = "number"; inp.min = "0"; inp.value = val; inp.className = "empty-input";
    inp.addEventListener("input", () => onChange(inp.value));
    wrap.appendChild(lbl); wrap.appendChild(inp);
    return wrap;
  }
  
  function makeFixedTileSlot(val, si, ti) {
    const slot = document.createElement("div");
    slot.className = "tile-slot" + (val ? " filled" : "");
    slot._segIdx = si; slot._tileIdx = ti;
    const txt = document.createElement("span");
    txt.textContent = val || "?";
    slot.appendChild(txt);
    if (val) {
      const pt = document.createElement("span");
      pt.className = "tile-pt"; pt.textContent = tilePoint(val);
      slot.appendChild(pt);
    }
    if (currentTarget && currentTarget._segIdx===si && currentTarget._tileIdx===ti)
      slot.classList.add("selected");
    slot.addEventListener("click", () => { currentTarget = slot; buildSegmentUI(); });
    return slot;
  }
  
  function addSegment() { segments.push({ before: 0, tiles: [] }); buildSegmentUI(); }
  
  // ══════════════════════════════════════════════════════════════
  // Sequence structure
  // ══════════════════════════════════════════════════════════════
  
  function computeSeqStructure() {
    const positions = [];
    for (const seg of segments) {
      for (let i = 0; i < seg.before; i++) positions.push({ type: 'empty' });
      for (const t of seg.tiles) positions.push({ type: 'fixed', value: t });
    }
    for (let i = 0; i < trailingEmpty; i++) positions.push({ type: 'empty' });
    return positions;
  }
  
  // ══════════════════════════════════════════════════════════════
  // Interactive preview
  // ══════════════════════════════════════════════════════════════
  
  function updatePreview() {
    const wrap = document.getElementById("seqPreview");
    wrap.innerHTML = "";
    const positions = computeSeqStructure();
    if (!positions.length) {
      wrap.innerHTML = '<span style="color:#aaa;font-size:13px;font-style:italic;">No sequence defined</span>';
      return;
    }
    positions.forEach((pos, i) => {
      const slotWrap = document.createElement("div");
      slotWrap.className = "preview-slot";
      const tileBox = document.createElement("div");
      if (pos.type === 'fixed') {
        tileBox.className = "preview-tile-box is-fixed";
        const txt = document.createElement("span");
        txt.textContent = pos.value || "?";
        tileBox.appendChild(txt);
        if (pos.value) {
          const pt = document.createElement("span");
          pt.className = "tile-pt"; pt.textContent = tilePoint(pos.value);
          tileBox.appendChild(pt);
        }
      } else {
        const bonus = bonusMap[i] || 'p1';
        tileBox.className = `preview-tile-box is-empty bonus-${bonus}`;
        tileBox.title = "Click to cycle bonus";
        const mainLbl = document.createElement("span");
        mainLbl.textContent = BONUS_LABELS[bonus];
        mainLbl.style.cssText = "font-size:11px;font-weight:800;color:white;";
        tileBox.appendChild(mainLbl);
        tileBox.appendChild(Object.assign(document.createElement("span"), { className: "preview-bonus-label" }));
        tileBox.addEventListener("click", () => {
          const idx = BONUS_CYCLE.indexOf(bonusMap[i] || 'p1');
          bonusMap[i] = BONUS_CYCLE[(idx+1) % BONUS_CYCLE.length];
          updatePreview();
        });
      }
      slotWrap.appendChild(tileBox);
      wrap.appendChild(slotWrap);
    });
  }
  
  // ══════════════════════════════════════════════════════════════
  // Target selection
  // ══════════════════════════════════════════════════════════════
  
  function selectTopTarget() {
    currentTarget = "top";
    renderTop();
    document.querySelectorAll(".tile-slot.selected").forEach(s => s.classList.remove("selected"));
  }
  
  // ══════════════════════════════════════════════════════════════
  // Control buttons
  // ══════════════════════════════════════════════════════════════
  
  document.querySelectorAll(".control input").forEach(ctrl => {
    ctrl.addEventListener("click", () => {
      if (ctrl.value === "Back") {
        if (currentTarget === "top") { filled.pop(); renderTop(); }
        else if (currentTarget && currentTarget._segIdx !== undefined) {
          segments[currentTarget._segIdx].tiles[currentTarget._tileIdx] = "";
          buildSegmentUI();
        }
      } else if (ctrl.value === "Clear") {
        filled = []; segments = []; trailingEmpty = 0; bonusMap = {};
        solutions = []; shownCount = 0;
        document.getElementById("solutionsContainer").innerHTML = "";
        selectTopTarget();
        if (mode === "mode2") { addSegment(); buildSegmentUI(); }
        else renderTop();
      } else if (ctrl.value === "Submit") {
        runAMath();
      }
    });
  });
  
  // ══════════════════════════════════════════════════════════════
  // Mode switch
  // ══════════════════════════════════════════════════════════════
  
  document.getElementById("mode1").addEventListener("click", () => {
    mode = "mode1";
    document.getElementById("mode1").classList.add("active");
    document.getElementById("mode2").classList.remove("active");
    document.getElementById("mode2Panel").style.display = "none";
    segments = []; trailingEmpty = 0; bonusMap = {};
    selectTopTarget(); renderTop();
  });
  
  document.getElementById("mode2").addEventListener("click", () => {
    mode = "mode2";
    document.getElementById("mode2").classList.add("active");
    document.getElementById("mode1").classList.remove("active");
    document.getElementById("mode2Panel").style.display = "block";
    if (!segments.length) addSegment();
    buildSegmentUI(); selectTopTarget();
  });
  
  // ══════════════════════════════════════════════════════════════
  // Core A-Math Functions
  // ══════════════════════════════════════════════════════════════
  
  function* expandGen(arr) {
    function* rec(i, cur) {
      if (i === arr.length) { yield cur; return; }
      const t = arr[i];
      if (t in SPECIAL_MAP) for (const op of SPECIAL_MAP[t]) yield* rec(i+1, [...cur, op]);
      else yield* rec(i+1, [...cur, t]);
    }
    yield* rec(0, []);
  }
  
  function Condition(seq) {
    if (!seq.includes('=')) return false;
    const first = seq[0], last = seq[seq.length-1];
    if ((MARKS_SET.has(first) && first !== '-') || MARKS_SET.has(last)) return false;
    for (let i = 0; i < seq.length-1; i++) {
      const a = seq[i], b = seq[i+1];
      if (MARKS_SET.has(a) && MARKS_SET.has(b) && !(a==='='&&b==='-')) return false;
      if (TENS_SET.has(a) && TENS_SET.has(b)) return false;
      if (UNIT_SET.has(a) && TENS_SET.has(b)) return false;
      if (TENS_SET.has(a) && UNIT_SET.has(b)) return false;
      if ((a==='/'||a==='-') && b==='0') return false;
    }
    let cnt = 0;
    for (const x of seq) {
      if (UNIT_SET.has(x)) { cnt++; if (cnt>3) return false; } else cnt=0;
    }
    let temp="";
    for (const x of seq) {
      if (!MARKS_SET.has(x)) temp += x;
      else { if (temp.length>=2 && temp[0]==='0') return false; temp=""; }
    }
    if (temp.length>=2 && temp[0]==='0') return false;
    return true;
  }
  
  // ══════════════════════════════════════════════════════════════
  // OPTIMIZATION 2 — Memoized eval cache
  // eval() is called repeatedly on the same sub-expressions.
  // Caching results eliminates redundant JS engine invocations.
  // Cache is reset at the start of each runAMath() call.
  // ══════════════════════════════════════════════════════════════
  
  let _evalCache = new Map();
  
  function cachedEval(exprStr) {
    if (_evalCache.has(exprStr)) return _evalCache.get(exprStr);
    let result;
    try { result = eval(exprStr); } catch { result = NaN; }
    _evalCache.set(exprStr, result);
    return result;
  }
  
  function Check_Equation(seq) {
    const parts = []; let temp = [];
    for (const t of seq) {
      if (t==='=') { parts.push(temp); temp=[]; } else temp.push(t);
    }
    parts.push(temp);
    try {
      const vals = parts.map(p => {
        if (!p.length) return null;
        return cachedEval(p.join(''));
      });
      if (vals.some(v => v===null || !isFinite(v))) return false;
      return vals.every(v => Math.abs(v-vals[0]) < 1e-9);
    } catch { return false; }
  }
  
  // Keep non-pruning Permutations for workUnit weight estimation only
  function Permutations(arr) {
    if (!arr.length) return [[]];
    if (arr.length===1) return [[arr[0]]];
    const res=[], seen=new Set();
    for (let i=0; i<arr.length; i++) {
      const v=arr[i]; if (seen.has(v)) continue; seen.add(v);
      for (const p of Permutations(arr.filter((_,j)=>j!==i))) res.push([v,...p]);
    }
    return res;
  }
  
  function Combinations(arr, k) {
    if (k===0) return [[]];
    if (k>arr.length) return [];
    const res=[], seen=new Set();
    for (let i=0; i<=arr.length-k; i++) {
      const v=arr[i]; if (seen.has(v)) continue; seen.add(v);
      for (const c of Combinations(arr.slice(i+1),k-1)) res.push([v,...c]);
    }
    return res;
  }
  
  // distributeGen — yields {dist, offsets} for each gap group.
  // dist[gi]   = how many rack tiles go into gap group gi
  // offsets[gi] = starting index within gapGroups[gi] (window position)
  //
  // FIX: the old version always took positions from the START of each gap group (offset=0).
  // This missed valid equations where rack tiles must come from the END of a gap group
  // (e.g. a 7-slot gap contributing 3 tiles adjacent to a fixed tile at slot 7 needs offset=4).
  // When use=0, offset is irrelevant so we only yield offset=0 to avoid duplicates.
  function* distributeGen(gapGroups, k, idx=0, partialDist=[], partialOff=[]) {
    if (idx === gapGroups.length) {
      if (k === 0) yield { dist: partialDist, offsets: partialOff };
      return;
    }
    const gap = gapGroups[idx];
    const maxUse = Math.min(k, gap.length);
    for (let use = 0; use <= maxUse; use++) {
      const maxOffset = use === 0 ? 0 : gap.length - use;
      for (let off = 0; off <= maxOffset; off++) {
        yield* distributeGen(
          gapGroups, k - use, idx + 1,
          [...partialDist, use], [...partialOff, off]
        );
      }
    }
  }
  
  function computeScore(subOrigSeq, subBonuses, rackUsedCount) {
    let sum=0, eMult=1;
    subOrigSeq.forEach((origToken,i)=>{
      const bonus=subBonuses[i]||'p1', pt=tilePoint(origToken);
      if      (bonus==='p1') sum+=pt;
      else if (bonus==='p2') sum+=pt*2;
      else if (bonus==='p3') sum+=pt*3;
      else if (bonus==='e2') { sum+=pt; eMult*=2; }
      else if (bonus==='e3') { sum+=pt; eMult*=3; }
    });
    let score=sum*eMult;
    if (rackUsedCount>=8) score+=40;
    return score;
  }
  
  // ══════════════════════════════════════════════════════════════
  // Loading UI
  // ══════════════════════════════════════════════════════════════
  
  function showLoading() { document.getElementById("loadingOverlay").classList.add("active"); setProgress(0,"Preparing..."); }
  function hideLoading() { document.getElementById("loadingOverlay").classList.remove("active"); }
  function setProgress(pct, detail) {
    const p=Math.min(100,Math.max(0,Math.round(pct)));
    document.getElementById("loadingPct").textContent=p+"%";
    document.getElementById("loadingBarFill").style.width=p+"%";
    document.getElementById("loadingPct").style.color=`hsl(${Math.round(20+p)},90%,45%)`;
    if (detail) document.getElementById("loadingDetail").textContent=detail;
  }
  function yieldFrame() { return new Promise(r=>setTimeout(r,0)); }
  
  // ══════════════════════════════════════════════════════════════
  // Main solver (async with progress)
  // ══════════════════════════════════════════════════════════════
  
  async function runAMath() {
    solutions=[]; shownCount=0;
    const seenKey=new Set();
    _evalCache=new Map();   // reset memo cache
  
    const minTiles=Math.max(1,parseInt(document.getElementById("minTileInput").value)||1);
    showLoading();
    await yieldFrame();
  
    if (mode==='mode1') {
      // Collect pruned permutations into array for progress tracking
      const allPerms=[...permsGen(filled)];
      const total=allPerms.length;
      const YIELD_MS=40;
      let lastYield=performance.now();
  
      for (let pi=0; pi<total; pi++) {
        const perm=allPerms[pi];
        // ConditionTemplate already implied by permsGen prefix pruning at full length,
        // but call it again for the minTiles guard and any edge cases
        if (perm.length>=minTiles && ConditionTemplate(perm)) {
          for (const exp of expandGen(perm)) {
            if (Condition(exp) && Check_Equation(exp)) {
              const key=exp.join('');
              if (!seenKey.has(key)) {
                seenKey.add(key);
                solutions.push({eq:key, score:null, usedCount:filled.length});
              }
            }
          }
        }
        const now=performance.now();
        if (now-lastYield>=YIELD_MS) {
          setProgress(((pi+1)/total)*100,`Checking ${pi+1}/${total} — ${solutions.length} found`);
          await yieldFrame(); lastYield=performance.now();
        }
      }
  
    } else {
      const positions=computeSeqStructure();
      if (!positions.length) { hideLoading(); alert("Please define a sequence first."); return; }
      if (positions.some(p=>p.type==='fixed'&&!p.value)) { hideLoading(); alert("Please fill all fixed tile slots."); return; }
  
      const gapGroups=[]; let curGap=null;
      positions.forEach((p,i)=>{
        if (p.type==='empty') { if (!curGap) { curGap=[]; gapGroups.push(curGap); } curGap.push(i); }
        else curGap=null;
      });
  
      const rackCount=filled.length;
      if (rackCount===0) { hideLoading(); alert("Please add tiles to the rack first."); return; }
  
      const slotBonuses=positions.map((p,i)=>p.type==='fixed'?'p1':(bonusMap[i]||'p1'));
  
      const workUnits=[]; let totalWeight=0;
      for (let k=1; k<=rackCount; k++) {
        if (k<minTiles) continue;
        for (const rackSubset of Combinations(filled,k)) {
          const permCount=Permutations(rackSubset).length;
          for (const {dist,offsets} of distributeGen(gapGroups,k)) {
            workUnits.push({k,rackSubset,dist,offsets,weight:permCount});
            totalWeight+=permCount;
          }
        }
      }
  
      if (!workUnits.length) { hideLoading(); alert(`No combinations use at least ${minTiles} tile(s).`); return; }
  
      setProgress(0,`Approx. ${totalWeight.toLocaleString()} permutations to check`);
      await yieldFrame();
  
      const YIELD_MS=40;
      let doneWeight=0, lastYield=performance.now();
  
      for (let wi=0; wi<workUnits.length; wi++) {
        const {k,rackSubset,dist,offsets,weight}=workUnits[wi];
  
        const filledSet=new Set();
        dist.forEach((useCount,gi)=>{ for (let j=0;j<useCount;j++) filledSet.add(gapGroups[gi][offsets[gi]+j]); });
  
        const active=[];
        positions.forEach((p,i)=>{ if (p.type==='fixed'||filledSet.has(i)) active.push(i); });
  
        let contiguous=true;
        for (let ii=1;ii<active.length;ii++) { if (active[ii]!==active[ii-1]+1){contiguous=false;break;} }
  
        if (!contiguous||!active.length) {
          doneWeight+=weight;
        } else {
          const subBonuses=active.map(i=>slotBonuses[i]);
          const sortedFilled=[...filledSet].sort((a,b)=>a-b);
  
          for (const perm of Permutations(rackSubset)) {
            const subOrigSeq=active.map(i=>{
              const p=positions[i];
              if (p.type==='fixed') return p.value;
              return perm[sortedFilled.indexOf(i)];
            });
  
            if (!ConditionTemplate(subOrigSeq)) { doneWeight++; continue; }
  
            for (const exp of expandGen(subOrigSeq)) {
              if (Condition(exp) && Check_Equation(exp)) {
                const key=exp.join('')+'|'+active.join(',');
                if (!seenKey.has(key)) {
                  seenKey.add(key);
                  const score=computeScore(subOrigSeq,subBonuses,k);
                  solutions.push({eq:exp.join(''),score,usedTiles:rackSubset,usedCount:k});
                }
              }
            }
            doneWeight++;
          }
        }
  
        const now=performance.now();
        if (now-lastYield>=YIELD_MS) {
          setProgress((doneWeight/totalWeight)*100,
            `${doneWeight.toLocaleString()} / ${totalWeight.toLocaleString()} checked — ${solutions.length} found`);
          await yieldFrame(); lastYield=performance.now();
        }
      }
  
      solutions.sort((a,b)=>b.score-a.score);
    }
  
    setProgress(100,`Done — ${solutions.length} solution${solutions.length!==1?'s':''} found`);
    await yieldFrame();
    hideLoading();
    renderSolutions();
  }
  
  // ══════════════════════════════════════════════════════════════
  // Render solutions
  // ══════════════════════════════════════════════════════════════
  
  function beautify(expr) { return expr.replace(/\*/g,"×").replace(/\//g,"÷"); }
  
  function computeLeftover(s) {
    if (s.usedTiles) {
      const rem=[...filled];
      for (const t of s.usedTiles) { const idx=rem.indexOf(t); if (idx!==-1) rem.splice(idx,1); }
      return rem;
    }
    return s.usedCount>=filled.length?[]:[];
  }
  
  function makeSolutionItem(s) {
    const div=document.createElement("div"); div.className="solution-item";
    const eq=document.createElement("span"); eq.className="solution-eq";
    eq.textContent=beautify(s.eq); div.appendChild(eq);
    const meta=document.createElement("div"); meta.className="solution-meta";
    if (s.score!==null) {
      const sc=document.createElement("span"); sc.className="solution-score";
      sc.textContent=`${s.score} pts`; meta.appendChild(sc);
    }
    const leftover=computeLeftover(s);
    if (leftover.length===0) {
      const b=document.createElement("span"); b.className="badge-bingo";
      b.textContent="Bingo"; meta.appendChild(b);
    } else {
      const b=document.createElement("span"); b.className="badge-leftover";
      b.textContent="Left: "+leftover.map(t=>t==='*'?'×':t==='/'?'÷':t).join(", ");
      meta.appendChild(b);
    }
    div.appendChild(meta);
    return div;
  }
  
  function renderSolutions() {
    const sc=document.getElementById("solutionsContainer");
    sc.innerHTML=""; sc.style.display="flex";
  
    if (!solutions.length) {
      const div=document.createElement("div"); div.className="solution-item";
      div.style.color="#d44"; div.style.fontWeight="bold";
      div.innerHTML='<span class="solution-eq">No solutions found.</span>';
      sc.appendChild(div);
    } else {
      const show=solutions.slice(0,20);
      shownCount=show.length;
      show.forEach(s=>sc.appendChild(makeSolutionItem(s)));
    }
  
    const actions=document.createElement("div"); actions.className="solution-actions";
  
    if (solutions.length>shownCount) {
      const moreBtn=document.createElement("button"); moreBtn.className="show-more-btn";
      moreBtn.textContent=`Show more (${solutions.length-shownCount} remaining)`;
      moreBtn.addEventListener("click",()=>{
        const more=solutions.slice(shownCount,shownCount+10);
        shownCount+=more.length;
        more.forEach(s=>sc.insertBefore(makeSolutionItem(s),actions));
        moreBtn.textContent=shownCount>=solutions.length
          ?`All ${solutions.length} solutions shown`
          :`Show more (${solutions.length-shownCount} remaining)`;
        sc.scrollTop=sc.scrollHeight;
      });
      actions.appendChild(moreBtn);
    }
  
    if (window.innerWidth<700) {
      const backBtn=document.createElement("button"); backBtn.className="show-more-btn";
      backBtn.textContent="Back"; backBtn.style.background="#8a8a8a";
      backBtn.addEventListener("click",()=>{
        sc.style.display="none";
        document.querySelector(".container").scrollIntoView({behavior:"smooth"});
      });
      actions.appendChild(backBtn);
    }
  
    if (actions.children.length) sc.appendChild(actions);
    sc.scrollTop=0;
  }
  
  // ══════════════════════════════════════════════════════════════
  // Init
  // ══════════════════════════════════════════════════════════════
  buildPad();
  selectTopTarget();
  renderTop();