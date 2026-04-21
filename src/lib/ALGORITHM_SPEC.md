# A-Math Bingo Generator — Algorithm Specification (v6.2)

> **วัตถุประสงค์ของไฟล์นี้**: อธิบาย algorithm การทำงาน, โครงสร้างไฟล์, และทุก function ในระบบ
> เขียนเพื่อให้ AI หรือ Developer อ่านแล้วเข้าใจระบบทั้งหมดได้ภายในไฟล์เดียว โดยไม่ต้องอ่านโค้ดทุกบรรทัด

---

## 1. ภาพรวมระบบ (System Overview)

Generator นี้สร้าง **puzzle ทางคณิตศาสตร์** สำหรับเกม A-Math Bingo
รับ config เข้ามา → สุ่มสร้าง equation ที่ valid → แจกแจง tile → วาง tile ลงบอร์ด

### Output ที่ได้
```
{
  mode: 'cross' | 'expand' | 'plain',
  equation: "3+5=8",
  solutionTiles: ['3','+','5','=','8'],
  rackTiles: ['3','+','5'],           // tile ที่ผู้เล่นถือ
  boardSlots: [...],                  // slot บนบอร์ด (locked/unlocked)
  board: [...],                       // 15×15 grid (cross mode เท่านั้น)
  totalTile: 5,
  eqCount: 1,
  difficulty: { ... },
  generatorVersion: 'v6.2'
}
```

### สามโหมด
| Mode | คำอธิบาย | Board |
|------|----------|-------|
| `plain` | แค่ tile บน rack ไม่มีบอร์ด | ไม่มี |
| `cross` | วาง equation ใน 15×15 grid แบบ horizontal/vertical | 15×15 |
| `expand` | วาง tile บน strip 3×15 มี fixed tile + rack | 3×15 |

---

## 2. ศัพท์สำคัญ (Key Terminology)

| คำ | ความหมาย |
|----|----------|
| **Tile** | กระเบื้องแต่ละแผ่น เช่น `'3'`, `'+'`, `'='`, `'?'` |
| **Heavy tile** | tile เลข 10–20 ที่ใช้กระเบื้อง 1 แผ่น (ต่างจาก `'1','0'` 2 แผ่น) |
| **Wild tile** | tile ที่แทนค่าได้หลายอย่าง: `?` (ตัวเลขหรือ op ใดก็ได้), `+/-` (บวกหรือลบ), `×/÷` (คูณหรือหาร) |
| **eqCount** | จำนวนเครื่องหมาย `=` ในสมการ (1, 2, หรือ 3) |
| **totalTile** | จำนวน tile ทั้งหมดในสมการ (8–15) |
| **numBudget** | จำนวน tile ที่เหลือสำหรับตัวเลข = `totalTile - eqCount - N_ops` |
| **N_ops** | จำนวน operator ในสมการ (+, -, ×, ÷) |
| **POOL_DEF** | จำนวน tile ทั้งหมดในเกมที่มีอยู่ (pool) |
| **tileCounts** | multiset ของ tile: `{'3':1, '+':1, '5':1, '=':1, '8':1}` |
| **opSpec** | constraint ของ operator แต่ละตัว เช่น `{'÷': [1,1]}` = ต้องการ ÷ พอดี 1 ตัว |
| **Rack** | tile ที่ผู้เล่นถือไว้ในมือ (ไม่ได้อยู่บอร์ด) |
| **Fixed slot** | ช่องบนบอร์ดที่ tile ถูก lock ไว้แล้ว ผู้เล่นเห็นตั้งแต่ต้น |

---

## 3. สถาปัตยกรรมไฟล์ (File Architecture)

```
dependency graph (→ = imports from)

bingoMath.js          ← zero deps (pure math)
    ↑
tileHelpers.js        ← bingoMath
boardConstants.js     ← zero deps (constants only)
    ↑
crossBingoPlacement.js ← boardConstants

equationConstructors.js ← bingoMath, tileHelpers
dfsSolver.js            ← bingoMath, tileHelpers
boardBuilder.js         ← bingoMath, tileHelpers
equationMutator.js      ← bingoMath, tileHelpers, equationConstructors (POOL_DEF)
configValidator.js      ← bingoMath, tileHelpers, equationConstructors (POOL_DEF)

bingoGenerator.js  ← ทุกไฟล์ข้างต้น  (public API)
```

**หลักการ**: ไฟล์ที่อยู่ล่างในกราฟไม่รู้จักไฟล์ที่อยู่บน ไม่มี circular dependency

---

## 4. ไฟล์และ Function ทั้งหมด

---

### 4.1 `bingoMath.js` — Pure Math Utilities

**หน้าที่**: คณิตศาสตร์ล้วน ๆ ไม่มี import จากไฟล์อื่น เป็น foundation ของทั้งระบบ

#### Constants
```
OPS_ALL    = ['+', '-', '×', '÷']     // operator ทั้ง 4 ตัว
RESULT_MIN = 0
RESULT_MAX = 1_000_000
EQ_MAX     = 3                         // จำนวน = สูงสุดที่รองรับ
```

#### Functions

**`clamp(val, lo, hi)`**
- คืนค่า val ที่ถูก clamp ให้อยู่ใน [lo, hi]

**`toRange(v)`**
- แปลง constraint หลายรูปแบบให้เป็น `[lo, hi]` หรือ `null`
- `null/undefined` → `null`
- `5` → `[5, 5]`
- `[1, 3]` → `[1, 3]`
- ใช้ทั่วระบบเพื่อ normalize constraint

**`randInt(lo, hi)`**
- สุ่มเลขจำนวนเต็มในช่วง [lo, hi] รวมสองปลาย

**`shuffle(arr)`**
- Fisher-Yates shuffle คืน array ใหม่ (ไม่แก้ของเดิม)

**`weightedSample(items, weights)`**
- สุ่มเลือก 1 รายการจาก items โดยใช้น้ำหนัก weights
- ใช้สำหรับเลือก operator ด้วย bias (+ และ × มีน้ำหนักสูงกว่า)

**`evalExpr(expr)`**
- คำนวณสำนวนคณิต เช่น `"3+5"` → `8`, `"10÷3"` → `null` (ไม่ลงตัว)
- ประเมิน left-to-right ไม่มี operator precedence (A-Math rules)
- คืน `null` ถ้า divide ไม่ลงตัว หรือ intermediate ติดลบ

**`evalExprRational(expr)`**
- เหมือน evalExpr แต่คืน `{n, d}` (rational number) เพื่อตรวจ equality ของ balanced equation
- ใช้ใน `tryBuildEq1Balanced` เพื่อจับคู่สองข้างของ `=`

**`tokenizeEquation(eq)`**
- แยก string เป็น token array: `"12+3=15"` → `['12','+','3','=','15']`
- รองรับ heavy tile (10–20), operator, =, เลขหลายหลัก

**`isValidEquation(eq, requiredEquals, checkRange?)`**
- ตรวจว่าสมการ valid หรือไม่:
  1. tokenize ได้
  2. จำนวน `=` ตรงกับ requiredEquals
  3. ทุก segment ระหว่าง `=` คำนวณได้ค่าเดียวกัน
  4. ค่าอยู่ใน [RESULT_MIN, RESULT_MAX] ถ้า checkRange=true

**`scoreEquationDifficulty(eq)`**
- ประเมินความยากของสมการ คืน object `{score, level, ...}`
- ใช้ปัจจัย: จำนวน op, มี ÷ ไหม, ค่าตัวเลขใหญ่แค่ไหน, มี heavy tile ไหม

---

### 4.2 `tileHelpers.js` — Tile-Specific Helpers

**หน้าที่**: ทุกอย่างที่เกี่ยวกับ tile pool, การแปลง equation → tile, การตรวจสอบ constraint

#### Constants
```
LIGHT_DIGS = ['1'..'9']               // เลขหลักเดียว (ไม่รวม 0)
HEAVY_LIST = ['10'..'20']             // tile เลข 10-20 (heavy)
HEAVY_SET  = Set(HEAVY_LIST)
OPS_SET    = Set(['+','-','×','÷','+/-','×/÷'])
WILDS_SET  = Set(['?','+/-','×/÷'])   // tile ที่ resolve ได้หลายค่า
```

#### Functions

**`numTiles(n)`**
- บอกว่าเลข n ใช้ tile กี่แผ่น
- 10–20 → 1 (heavy tile)
- 0–9 → 1
- 21+ → นับตัวอักษร เช่น 123 → 3

**`makeCounts(poolDef)`**
- shallow copy ของ pool definition object

**`equationToTileCounts(eq, opts)`**
- แปลง equation string → `{tile: count}` multiset
- `preferHeavy=true`: เลข 10–20 ใช้ heavy tile แทน digit แยก

**`equationToSourceTiles(eq)`**
- แปลง equation → ordered tile array (ไม่มี wild card)
- ใช้ O(n) แทน DFS สำหรับ equation ที่ไม่มี wildcard
- คืน `null` ถ้า error

**`analyzeTiles(tileList)` / `analyzeCounts(tileCounts)`**
- วิเคราะห์ tile set คืน `{ops, heavy, equals, wilds, blanks, opSpec}`
- `analyzeCounts` แปลง multiset → list ก่อน แล้วเรียก analyzeTiles

**`satisfiesConfigFromCounts(tileCounts, cfg, requiredEquals)`**
- ตรวจว่า tile set ตรงกับ constraint ใน cfg ทุกข้อ
- ตรวจ: operatorCount, heavyCount, wildcardCount, blankCount, operatorSpec

**`withinPoolLimits(tileCounts, poolDef)`**
- ตรวจว่า tileCounts ไม่เกิน pool ที่มีอยู่
- เช่น ถ้า pool มี `'='` แค่ 8 แต่ต้องการ 9 → false

---

### 4.3 `boardConstants.js` — Shared Board Constants

**หน้าที่**: ค่าคงที่ที่ใช้ร่วมกันระหว่าง crossBingoPlacement และ bingoGenerator
(แยกออกมาเพื่อป้องกัน circular dependency)

```
OPS_SET          // set ของ operator ทั้งหมด
WILDS_SET        // set ของ wild tile
HEAVY_SET        // set ของ heavy tile
DESCRIPTION_BOARD  // 15×15 array ของ slot type ('px1','px2','px3','ex2','ex3',...)
```

**`DESCRIPTION_BOARD`** คือ layout ของบอร์ด A-Math 15×15 ระบุ bonus type ของแต่ละ cell
- `px1` = ปกติ, `px2` = letter×2, `px3` = letter×3
- `ex2` = word×2, `ex3` = word×3, `px3star` = letter×3 + center star

---

### 4.4 `crossBingoPlacement.js` — Cross Board Placement

**หน้าที่**: เลือกตำแหน่งวาง tile บน 15×15 board (cross mode) โดยใช้ popularity + heatmap

#### Algorithm: Popularity-Aware Placement

**สูตร**:
```
finalWeight = α × popularityWeight + (1−α) × heatmapWeight
```
- `α = 0.55` (ค่อนข้าง popularity-dominant)
- heatmap = คะแนนจากระยะห่างจากกลางบอร์ด + bonus cell weight
- popularityWeight = ข้อมูลจาก `strip-freq.json` (simulate จากการเล่นจริง)

#### Functions

**`initPopularityWeights(jsonUrl?)`** *(async)*
- โหลด `strip-freq.json` ที่ generate จาก `simulate-strip-popularity.mjs`
- ถ้าไม่มีไฟล์ → fallback เป็น pure heatmap

**`selectRealisticPlacement(tileCount)`**
- เลือก placement (row, col, direction) สำหรับ strip ยาว `tileCount` tiles
- Blend popularity + heatmap weight
- คืน `{cells, rowIdx, colStart, dir, slotProbs}` โดย cells คือ `[{r,c,type}, ...]`

**`selectLockPositions(totalTile, lockCount, placement)`**
- เลือก tile indices ที่จะ lock บนบอร์ด (ผู้เล่นเห็นตั้งแต่เริ่ม)
- ใช้ `slotProbs` จาก placement เพื่อเลือก slot ที่น่าสนใจ
- หลีกเลี่ยงการ lock tile ที่อยู่ติดกัน (non-adjacent)

**`passesRealismFilter(placement)`**
- ตรวจว่า placement ผ่านเกณฑ์ realism หรือไม่
- ป้องกัน placement ที่อยู่ขอบจอเกินไป หรือผิดปกติ

---

### 4.5 `equationConstructors.js` — Equation Builder

**หน้าที่**: สร้าง equation string ที่ valid จาก budget (จำนวน tile) และ constraint

#### Export สำคัญ

**`POOL_DEF`**
```js
{
  '0':0, '1':4, '2':4, ..., '9':4,
  '10':1, ..., '20':1,
  '+':4, '-':4, '×':4, '÷':4,
  '+/-':4, '×/÷':4, '=':8, '?':2
}
```
จำนวน tile ทั้งหมดในเกม A-Math

---

#### Internal Helpers

**`pickNumForBudget(budget)`**
- เลือกตัวเลขที่ใช้ tile ตรงตาม budget
- budget=1 → 1–20, budget=2 → 21–99, budget=3 → 100–200
- **Bugfix**: budget=2 ต้องเป็น 21–99 ไม่ใช่ 1–99 เพราะ 10–20 เป็น heavy tile (นับเป็น budget=1)

**`distributeTileBudget(total, nSlots)`**
- แจก `total` tile ให้กับ `nSlots` slot โดย tile แต่ละ slot = 1–3
- คืน array ของ budget ต่อ slot หรือ `null` ถ้าเป็นไปไม่ได้

**`pickOperatorsForSpec(N, spec)`**
- เลือก N operator ให้ตรง spec (min/max ต่อ type)
- ถ้าไม่มี spec → weighted random (+/× มากกว่า ÷)

**`buildExprStr(nums, ops)`**
- สร้าง string จาก array ตัวเลขและ operator
- `[3,5], ['+']` → `"3+5"`

---

#### eqCount=1 Builders

**`tryBuildEq1Forward(lhsOps, numBudget)`**
- สร้าง `LHS = V` (คำนวณ LHS ก่อน หาค่า V)
- **Bugfix ÷**: ถ้า op คือ ÷ ใช้ backward-solve: เลือก V ก่อน แล้ว `a = V × b`
  เพราะ forward (สุ่ม a,b แล้ว a÷b) มีโอกาสลงตัวต่ำมาก

**`tryBuildEq1Flip(rhsOps, numBudget)`**
- สร้าง `V = RHS` (flip ของ Forward)
- ใช้ backward-solve เหมือนกันสำหรับ ÷

**`tryBuildEq1Balanced(lhsOps, rhsOps, numBudget)`**
- สร้าง `LHS = RHS` สองข้าง
- คำนวณ LHS ก่อน ใช้ evalExprRational เพื่อรองรับ fraction
- สำหรับ ÷ และ × ใช้ backward-solve ฝั่ง RHS เพื่อให้สองข้างเท่ากัน

**`tryBuildEq1FractionAddSub(ops, numBudget)`**
- สร้างสมการที่มี fraction เช่น `a÷b + c÷d = V` หรือ `a÷b + c = e÷f`
- ใช้เฉพาะเมื่อ ops มี ÷ ≥2 และมี + หรือ -
- `pickReducedFraction` สุ่ม fraction ที่ตัดแล้ว (gcd=1)

---

#### eqCount=2 Builders

**`tryBuildChainEq2(ops, numBudget)`**
- สร้าง `expr = V = V` (chain: สองข้างเท่ากับ V)
- ลองทั้ง vBudget=1 (V≤20) และ vBudget=2 (V≤99)
- **Bugfix ÷**: backward-solve path เหมือนกัน

**`tryBuildThreeWayEq2(lhsOps, rhsOps, numBudget)`**
- สร้าง `LHS = RHS = V`
- คำนวณ LHS และ RHS แยก แล้วตรวจว่าเท่ากัน

---

#### eqCount=3 Builders

**`_buildExprForTarget(V, ops, numBudgetTotal)`**
- helper: สร้าง expression ที่คำนวณได้ค่า V ด้วย ops และ tile budget ที่กำหนด
- zero ops: คืน String(V) ถ้า budget match
- single op: algebraic backward-solve (60 attempts, v6.2 เพิ่มจาก 30)
- multi op: forward random พร้อม check

**`_tryBuildEq3(ops, numBudget)`**
- สร้าง `expr1 = expr2 = expr3 = V` โดยพยายาม 4 patterns:
  - **Pattern A**: `allOpsExpr = V = V = V`
  - **Pattern B**: `expr1 = expr2 = V = V` (split ops เป็น 2 กลุ่ม)
  - **Pattern C**: `e1 = e2 = e3 = V` (split ops เป็น 3 กลุ่ม)
  - **Pattern D** *(v6.2 new)*: exhaustive scan ค่า V ทั้งหมดที่เป็นไปได้
    แทนการสุ่ม V → รับประกันหาสมการได้ถ้ามี solution
- Fallback: `V = V = V = V` (0 op)

---

#### Top-Level Constructors

**`constructEquationV6(N_ops, eqCount, targetTile, opSpec, poolDef)`**
- orchestrator หลักสำหรับสร้าง equation
- เรียก `_tryBuildEq1/2/3` ตาม eqCount
- ตรวจ tile count หลังสร้าง ต้องตรง targetTile
- มี fallback tier ใช้แค่ `+` ถ้า tries หมด

**`constructEquation(eqCount, opts)`**
- legacy wrapper สำหรับ backward compatibility
- สุ่ม N_ops และ numBudget เอง ไม่ต้องระบุ

---

### 4.6 `dfsSolver.js` — DFS Equation Finder

**หน้าที่**: หา equation จาก tile multiset โดย DFS + LRU cache

#### Cache

```js
DFS_CACHE_MAX = 800           // max entries
_dfsCache     = Map           // key: canonical tile string → results[]
_dfsCacheHits / _dfsInvocations  // stats
```

**`canonicalTileKey(tileCounts)`**
- แปลง tileCounts → sorted string สำหรับเป็น cache key
- `{'3':1, '+':1, '8':1, '=':1, '5':1}` → `"+=1,3:1,5:1,8:1,=:1"`

**`_dfsLookupOrRun(tileCounts, eqCount)`**
- ตรวจ cache ก่อน ถ้าไม่มี → รัน DFS → เก็บ cache
- LRU: ถ้า cache เต็ม → ลบ entry แรก (oldest)

**`getDfsCacheStats()`**
- คืน `{cacheSize, invocations, hits, hitRate}` สำหรับ debug/monitor

---

#### DFS Algorithm: `findEquationsFromTiles(tileCounts, requiredEquals, maxResults)`

**ใช้เมื่อ**: tile set มี wild card (`?`, `+/-`, `×/÷`) → ต้องหาว่า wild เป็นอะไร

**Structure**:
```
dfs(phase, usedEq)
  phase='num' → buildNum() → dfs('op', usedEq)
  phase='op'  → try '=' tile → dfs('num', usedEq+1)
             → try operator tiles → dfs('num', usedEq)
```

**`buildNum(onComplete, zeroOk)`**
- ลอง place ตัวเลขตำแหน่งปัจจุบัน:
  1. Heavy tile โดยตรง (10–20)
  2. `?` tile → ลอง represent เป็น heavy (10, 12)
  3. `0` (ถ้า zeroOk)
  4. `composeDigits` → สร้างตัวเลข 1–3 หลักจาก digit tile และ `?`

**Backtracking**: ใช้ take(t)/put(t) บน shared `tileCounts` object
ไม่ copy → O(1) per step

**จุดสิ้นสุด**: เมื่อ tiles หมด (`rem()===0`) และ phase='op', usedEq=requiredEquals
→ validate ด้วย `isValidEquation` → เพิ่มใน results

---

### 4.7 `boardBuilder.js` — Expand Mode Board Layout

**หน้าที่**: สร้าง board layout สำหรับ `expand` mode (strip 3×15)

#### Constants
```
BOARD_SIZE = 15   // length ของ strip
BOARD_COLS = 5    // columns ต่อ row
BOARD_ROWS = 3    // rows ของ strip
RACK_SIZE  = 8    // tile บน rack เสมอ
```

**`buildTilePerToken(equationTokens, orderedSourceTiles)`**
- map token แต่ละตัวกลับไปหา source tile
- จัดการ: heavy tile (1 tile), digit multi-char (หลาย tile), wild card
- คืน array of `{token, srcs[], src}` หรือ `null` ถ้า mismatch

**`pickFixedIndicesHeuristic(equationTokens, tilePerToken, fixedCount)`**
- เลือก token index ที่จะ lock บนบอร์ด
- **Must-lock**: `=` tokens ทั้งหมด (ผู้เล่นเห็น = เสมอ)
- **Heuristic score**: heavy tile (+40), operator (+8), long number (+6)
- **Constraint**: ไม่ lock tile ที่อยู่ติดกัน (ป้องกัน cluster)

**`scorePlacement(space)`**
- ให้คะแนนโทษ (penalty) ของ layout
- บทลงโทษ: op มากเกินไปใน 1 row, op อยู่ติดกัน
- ใช้หา layout ที่ดีที่สุดจากทุก start position

**`optimizeBoardLayout(board)`**
- ลอง start position ทุกค่า (0 → BOARD_SIZE-totalTile)
- เลือก position ที่ให้ penalty ต่ำสุด

**`buildBoard(eq, orderedSourceTiles, cfg, meta)`**
- pipeline หลักสำหรับ expand mode:
  1. tokenize equation
  2. map tiles → tokens (buildTilePerToken)
  3. เลือก fixed indices (pickFixedIndicesHeuristic)
  4. สร้าง rack = tiles ที่ไม่ถูก lock
  5. optimize start position
  6. คืน publicBoard (strip out internal fields)

---

### 4.8 `equationMutator.js` — Tile Set Mutation

**หน้าที่**: แปลง tile set จาก equation ให้ตรงกับ constraint ที่ต้องการ
(เช่น ต้องการ `+/-` wild, ต้องการ `?` blank tile จำนวนหนึ่ง)

**`mutateTileCountsSmart(tileCounts, cfg, eqCount, poolDef)`**
- รับ tileCounts จากสมการ → แปลงให้ตรง cfg
- **Step 1**: แปลง + หรือ - → `+/-` ตาม `cfg.operatorSpec['+/-']` min
- **Step 2**: แปลง × หรือ ÷ → `×/÷` ตาม `cfg.operatorSpec['×/÷']` min
- **Step 3**: แปลงตัวเลขเป็น `?` (blank) ตาม `cfg.blankCount` min
- **Step 4**: เพิ่ม wild tile (`?`, `+/-`, `×/÷`) ตาม `cfg.wildcardCount` min
- ตรวจว่าไม่เกิน maxBlank/maxWild
- ตรวจ `withinPoolLimits` และ `satisfiesConfigFromCounts`
- คืน mutated counts หรือ `null` ถ้าทำไม่ได้

**`quickChecks(tileCounts, cfg, eqCount)`**
- ตรวจ tile set อย่างรวดเร็วก่อนทำ DFS
- เงื่อนไข: equals count ถูก, มีตัวเลขจริง ≥2, ops อยู่ใน range, heavy อยู่ใน range

---

### 4.9 `configValidator.js` — Config Validation & Feasibility

**หน้าที่**: ตรวจสอบ config ก่อน generate, วิเคราะห์ความเป็นไปได้

#### Constants
```
EQ_MAX_LOCAL = 3    // max eqCount ที่ generator รองรับ (override จาก bingoMath.EQ_MAX)
```

**`resolveEqualCount(mode, cfg)`**
- เลือก eqCount จาก cfg.equalCount range
- expand mode default: 80% โอกาส eqCount=2, 20% โอกาส eqCount=1
- plain/cross default: eqCount=1

**`validateConfig(cfg)`**
- throw Error ถ้า config ผิด format:
  - mode ไม่ใช่ 'cross'/'expand'/'plain'
  - totalTile นอกช่วง 8–15
  - expand mode แต่ totalTile < 11
  - equalCount range ผิด
  - pool ไม่มี `=` tile พอ

**`validateDetailedConstraints(cfg)`**
- throw Error ถ้า operatorSpec ต้องการ op มากกว่าที่ผ่านได้
- throw Error ถ้า poolDef ไม่มี op tile พอตาม operatorSpec

**`isConfigFeasible(cfg)`**
- คืน boolean ว่า config มีโอกาสสำเร็จหรือไม่ (ไม่ throw)
- ตรวจ: tile น้อยเกินไป, wild เกินไป, pool ไม่พอ

**`getOperatorMinMap(operatorSpec)`**
- แปลง operatorSpec → `{'+':min, '-':min, '×':min, '÷':min}`

**`explainConstraintFailure(cfg)`**
- คืน string อธิบายว่าทำไม config ถึงไม่ feasible
- ใช้ใน error message เพื่อ debug

**`sanitizeConfigForFallback(cfg)`**
- ลด constraint ให้เหลือแค่ส่วนที่จำเป็น (mode, totalTile, equalCount)
- ใช้เป็น fallback เมื่อ generate ไม่ได้

---

### 4.10 `bingoGenerator.js` — Public API (Orchestrator)

**หน้าที่**: pipeline หลัก, public exports, backward compatibility

#### Constants ที่ประกาศที่นี่
```
GENERATOR_VERSION = 'v6.2'
TILE_POINTS = { '0':1, '1':1, ..., '+':2, '=':1, '?':0 }
```

#### Core Internal Functions

**`applyTileAssignmentToPlacement(solutionTiles, placement, tileAssignmentSpec)`**
- ปรับ `slotProbs` ใน placement ตาม tileAssignmentSpec
- spec บอกว่า tile แต่ละ type ควร lock กี่ตัวหรืออยู่บน rack กี่ตัว
- ใช้ใน cross mode ก่อนเรียก selectLockPositions

**`computeResolvedTiles(solutionTiles, equation)`**
- สำหรับ tile ที่เป็น wild (`?`, `+/-`, `×/÷`) → หาว่า wild นั้นแทนค่าอะไรจริง ๆ
- ใช้ใน cross mode เพื่อแสดง resolved value บน locked slot

**`equationFirstBuilder(totalTile, cfg, eqCount, poolDef)`** *(private)*
- **v6.2 fix**: pre-filter N_ops ที่ feasible ก่อน ไม่สุ่ม N_ops ทั้งหมด
  → ลด wasted retry บน impossible operator count อย่างมาก
- Pipeline:
  1. เลือก feasible N_ops
  2. เรียก `constructEquationV6`
  3. ตรวจ tile count
  4. เรียก `mutateTileCountsSmart`
  5. เรียก `quickChecks`
  6. ถ้ามี wild → `_dfsLookupOrRun` เพื่อยืนยัน equation มีอยู่จริง
  7. คืน `{tileCounts, seedEquation}`

**`_buildBoardResult(mode, chosen, tileCounts, seedEquation, cfg, totalTile, eqCount)`** *(private)*
- แปลง equation + tiles → output object สุดท้าย ตาม mode
- **plain**: boardSlots ว่าง + rackTiles shuffle
- **cross**: selectRealisticPlacement → lockPositions → board 15×15
- **expand**: เรียก `buildBoard` จาก boardBuilder.js

**`forceGuaranteedPuzzle(cfg)`** *(private)*
- ทางออกสุดท้าย เมื่อ generate ไม่ได้เลย
- ลำดับ fallback:
  1. ใช้ template สำเร็จรูป (เช่น `'3+4=7=7'`)
  2. equationFirstBuilder แบบ safe config
  3. broader config (N_ops 0–3)
  4. deterministic construction แบบ loop ทีละค่า
  5. absolute last resort: สร้าง `1+1+...=N`

---

## 5. End-to-End Generation Flow

```
generateBingo(cfg)
│
├─ validateConfig(cfg)              // throw ถ้า config ผิด format
├─ validateDetailedConstraints(cfg) // throw ถ้า op spec impossible
│
├─ isConfigFeasible(cfg)?
│   └─ NO → sanitize → retry หรือ forceGuaranteedPuzzle
│
├─ คำนวณ committedOpCount          // เลือก N_ops จาก cfg.operatorCount
│   └─ small board bias: ถ้า totalTile≤11 → ชอบ N_ops น้อย (weighted)
│
├─ committedOp1 (single op case)   // ถ้า N_ops=1, สุ่มเลือก op เดียวแบบ balanced weight
│
├─ MAIN RETRY LOOP (MAX_RETRIES ครั้ง)
│   ├─ เลือก eqCount จาก range
│   ├─ equationFirstBuilder(totalTile, cfgCommitted, eqCount)
│   │   ├─ pre-filter feasible N_ops           [v6.2 fix]
│   │   ├─ constructEquationV6(N_ops, eqCount, totalTile, opSpec)
│   │   │   ├─ pickOperatorsForSpec(N_ops, opSpec)
│   │   │   ├─ _tryBuildEq1 / _tryBuildEq2 / _tryBuildEq3
│   │   │   │   └─ tryBuildEq1Forward/Flip/Balanced/FractionAddSub
│   │   │   │   └─ tryBuildChainEq2 / tryBuildThreeWayEq2
│   │   │   │   └─ _buildExprForTarget / Pattern A/B/C/D   [eq3]
│   │   │   └─ verify tile count = targetTile
│   │   ├─ mutateTileCountsSmart(tileCounts, cfg)  // เพิ่ม wild/blank ตาม spec
│   │   ├─ quickChecks(mutated)
│   │   └─ ถ้า wilds > 0: _dfsLookupOrRun(mutated, eqCount)  // verify solvable
│   │
│   └─ tryBuildResultFromBuilt(built, eqCount)
│       ├─ ถ้าไม่มี wild: equationToSourceTiles(seedEquation)  // O(n)
│       └─ ถ้ามี wild: DFS find tiles
│           └─ _buildBoardResult(mode, chosen, ...)
│
├─ [custom constraints]: deep strict pass (ทุก eqCount × nOps combination)
│
├─ [fallback tiers]: ลด constraint ทีละขั้น
│   └─ wildcardCount=0 → heavyCount=null → operatorSpec=null → minimal cfg
│
└─ forceGuaranteedPuzzle(sanitizedCfg)   // guaranteed แต่ equation เรียบง่าย
```

---

## 6. Algorithm Deep Dives

### 6.1 Budget-Based Equation Construction

**ปัญหา**: ต้องการ equation ที่ valid และใช้ tile พอดี `totalTile` ตัว

**แนวคิด**:
```
totalTile = N_ops + eqCount + numBudget
numBudget = tile ที่เหลือสำหรับตัวเลขทั้งหมด
```

แต่ละ "number slot" ใช้ 1–3 tile (เช่น `7` = 1 tile, `42` = 2 tile, `123` = 3 tile)
ดังนั้น `numBudget` ต้องอยู่ใน `[numSlots, 3×numSlots]`

`distributeTileBudget(total, nSlots)` แจก tile ให้แต่ละ slot โดยแต่ละ slot ได้อย่างน้อย 1

### 6.2 Backward-Solve สำหรับ ÷

**ปัญหา**: `a÷b` แบบสุ่ม a,b มีโอกาส integer ต่ำมาก (≈10%)

**วิธีแก้**:
```
เลือก V (ผลลัพธ์) ก่อน
เลือก b ก่อน
แล้ว a = V × b  ← รับประกัน a÷b = V เสมอ
```

ใช้ใน: `tryBuildEq1Forward`, `tryBuildEq1Flip`, `tryBuildEq1Balanced`, `tryBuildChainEq2`, `_buildExprForTarget`

### 6.3 Pattern D สำหรับ eqCount=3 (v6.2)

**ปัญหา**: `totalTile=9, eqCount=3` → N_ops=1 feasible แต่การสุ่ม V มักพลาด

**วิธีแก้**: แทนที่จะสุ่ม V → iterate V ทุกค่าที่เป็นไปได้ใน range
```
for vb in [1, 2]:
  for V in shuffle(all values where numTiles(V)==vb):
    try _buildExprForTarget(V, ops, eb)
    if found → return equation
```

รับประกันหา solution ได้ถ้ามี solution อยู่จริง

### 6.4 Pre-Filter Feasible N_ops (v6.2)

**ปัญหา**: N_ops=0 หรือ N_ops=2 อาจ impossible สำหรับ totalTile เล็กๆ
แต่ถ้าสุ่มสม่ำเสมอ 2 ใน 3 ครั้งจะเสียไปกับค่าที่ impossible

**วิธีแก้**:
```js
const feasibleOps = [];
for (let n = rawLo; n <= rawHi; n++) {
  const nb = totalTile - eqCount - n;
  const ns = n + eqCount + 1;
  if (nb >= ns && nb <= 3 * ns) feasibleOps.push(n);
}
// สุ่มเฉพาะจาก feasibleOps เท่านั้น
```

### 6.5 DFS Wildcard Resolution

**เมื่อไหร่ใช้**: tile set มี `?`, `+/-`, หรือ `×/÷`
wild tile resolve ได้หลายค่า → ต้องพิสูจน์ว่า valid equation มีอยู่จริง

**Optimization**: LRU cache (800 entries) ด้วย canonical tile key
→ ลด DFS invocations อย่างมากเมื่อ tile set ซ้ำ

---

## 7. Data Structures

### Config Object (Input)
```ts
{
  mode: 'cross' | 'expand' | 'plain',
  totalTile: number,          // 8–15
  equalCount?: number | [lo, hi],      // default: 1 (plain/cross), 1-2 (expand)
  operatorCount?: number | [lo, hi],   // default: 1–3
  heavyCount?: number | [lo, hi],      // constraint จำนวน heavy tile
  wildcardCount?: number | [lo, hi],   // constraint จำนวน wild tile รวม
  blankCount?: number | [lo, hi],      // constraint จำนวน ? tile
  operatorSpec?: {                     // constraint ต่อ operator type
    '+': number | [lo, hi],
    '-': number | [lo, hi],
    '×': number | [lo, hi],
    '÷': number | [lo, hi],
    '+/-': number | [lo, hi],
    '×/÷': number | [lo, hi],
  },
  tileAssignmentSpec?: {               // lock/rack assignment ต่อ tile type
    [tileType]: { locked?: number, onRack?: number }
  },
  poolDef?: Record<string, number>,    // custom pool (default: POOL_DEF)
  noBonus?: boolean,                   // cross mode: ไม่ใช้ bonus cell
}
```

### TileCounts (Internal)
```ts
Record<string, number>   // { '3': 1, '+': 1, '5': 1, '=': 1, '8': 1 }
```

### Built Object (Internal, from equationFirstBuilder)
```ts
{ tileCounts: TileCounts, seedEquation: string }
```

### Placement Object (from crossBingoPlacement)
```ts
{
  cells: Array<{r, c, type}>,  // ordered cells บนบอร์ด
  rowIdx: number,
  colStart: number,
  dir: 'H' | 'V',
  slotProbs: number[],         // probability weight ต่อ slot
}
```

### Result Object (Output จาก generateBingo)
```ts
// common fields
{
  mode, equation, solutionTiles, rackTiles,
  boardSlots: Array<{tile, isLocked, resolvedValue, slotType}>,
  totalTile, eqCount, difficulty, generatorVersion, tileCounts
}

// cross mode extra:
{ board: string[][], placementRow, placementCol, placementDir, noBonus }

// expand mode extra:
{ space: (string|null)[], equationStart, fixedIndices, rack, analysis,
  equationTokens, layoutScore, seedEquation }
```

---

## 8. Retry Strategy & Fallback Tiers

```
Tier 0: MAIN LOOP
  MAX_RETRIES ครั้ง (14–30 ตาม op/eqCount)
  ใช้ cfgCommitted (committed op count + op spec)

Tier 1: CUSTOM CONSTRAINTS DEEP PASS (เฉพาะ hasCustomConstraints=true)
  iterate ทุก (eqCount, nOps) combination
  120–200 tries ต่อ combination
  → throw Error พร้อม explainConstraintFailure ถ้าหมด

Tier 2: CONSTRAINT RELAXATION (ทีละขั้น, 12 tries ต่อ tier)
  2a: wildcardCount=0, blankCount=0
  2b: + heavyCount=null
  2c: + operatorSpec=null
  2d: minimal cfg (operatorCount=[1,1])
  2e: equalCount locked + operatorCount=[0,1]  (เฉพาะ eqCount≥3)

Tier 3: forceGuaranteedPuzzle
  template → safe config → broader config → deterministic → last resort
```

---

## 9. Performance Characteristics

| Operation | ความเร็ว | หมายเหตุ |
|-----------|---------|----------|
| `equationFirstBuilder` (1 attempt) | ~0.1–1ms | ส่วนใหญ่เป็น string ops |
| `findEquationsFromTiles` (DFS) | ~1–50ms | ขึ้นกับ tile set และ wild count |
| `_dfsLookupOrRun` (cache hit) | <0.1ms | O(1) map lookup |
| `generateBingo` (no custom) | ~5–55ms | wall time budget: 35ms (small), 55ms (large) |
| `generateBingo` (custom constraints) | ไม่มี timeout | deep pass ไม่มี wall budget |

**Wall Budget**: สำหรับ config ปกติ (ไม่มี custom constraint) มี budget 35–55ms
ถ้าเกิน → ข้ามไป relaxation tier โดยอัตโนมัติ

---

## 10. Known Constraints & Gotchas

1. **`numTiles(20) = 1`** (heavy) แต่ `numTiles(21) = 2` — boundary ที่ต้องระวัง
   `pickNumForBudget(2)` ต้องเริ่มจาก 21 ไม่ใช่ 10

2. **evalExpr ไม่มี operator precedence** — A-Math rule: คำนวณ left-to-right
   `2+3×4 = 20` ไม่ใช่ 14

3. **eqCount ใน output vs input** — input เป็น constraint range, output เป็นค่าจริง

4. **DFS ใช้ mutate shared object** — `tileCounts` ถูก mutate directly
   caller ต้อง spread `{...tileCounts}` ก่อนส่งเข้า

5. **`?` tile ใน DFS** — `?` แทนได้ทั้ง digit, heavy (10,12), operator, =
   แต่ไม่แทน +/- หรือ ×/÷ (เพราะ wild tile แยกกัน)

6. **`DESCRIPTION_BOARD` ซ้ำใน bingoGenerator เดิม** — หลัง refactor ใช้จาก `boardConstants.js` อย่างเดียว

7. **expand mode ต้องการ totalTile ≥ 8 + RACK_SIZE=8** → totalTile ≥ 8 เสมอ
   และ fixedCount = totalTile - 8 → ถ้า totalTile=8 จะไม่มี fixed tile เลย

8. **Popularity weights** ใน cross mode ต้อง call `initPopularityWeights()` ที่ app boot
   ถ้าไม่ call → fallback เป็น pure heatmap (ยังใช้งานได้ แต่ placement ไม่ optimal)
