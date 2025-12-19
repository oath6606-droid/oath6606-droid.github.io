// 基础配置
const CONFIG = {
  cols: 20,
  rows: 20,
  baseSpeedMs: 220,
  speedStepMs: 18, // 每升级一次减少的间隔
  maxLevel: 8,
  foodScore: 10,
  foodForLevelUp: 5,
};

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("bestScore");
const speedEl = document.getElementById("speed");
const overlayEl = document.getElementById("overlay");
const overlayTitleEl = document.getElementById("overlayTitle");
const overlayMessageEl = document.getElementById("overlayMessage");
const btnStartOverlay = document.getElementById("btnStartOverlay");
const btnStart = document.getElementById("btnStart");
const btnPause = document.getElementById("btnPause");
const btnRestart = document.getElementById("btnRestart");
const touchButtons = document.querySelectorAll(".touch-btn");
const difficultySelect = document.getElementById("difficultySelect");

let cellSize;
let gameLoopId = null;
let lastFrameTime = 0;

const Direction = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

const GameState = {
  READY: "ready",
  RUNNING: "running",
  PAUSED: "paused",
  OVER: "over",
};

const Difficulty = {
  EASY: "easy",
  NORMAL: "normal",
  HARD: "hard",
  HELL: "hell",
};

const DifficultySpeedFactor = {
  [Difficulty.EASY]: 1.0, // 1.0x
  [Difficulty.NORMAL]: 1.4, // 1.4x
  [Difficulty.HARD]: 2.0, // 2.0x
  [Difficulty.HELL]: 3.0, // 3.0x
};

let state;

function initGameState() {
  const startX = Math.floor(CONFIG.cols / 2);
  const startY = Math.floor(CONFIG.rows / 2);

  state = {
    snake: [
      { x: startX - 1, y: startY },
      { x: startX, y: startY },
    ],
    direction: Direction.RIGHT,
    nextDirection: Direction.RIGHT,
    food: spawnFood(new Set()),
    score: 0,
    bestScore: getBestScore(),
    level: 1,
    eatenCount: 0,
    difficulty: DifficultySelectValue(),
    status: GameState.READY,
  };

  updateScoreUI();
  updateSpeedUI();
  setOverlay(GameState.READY);
  computeCellSize();
  draw();
}

function getBestScore() {
  try {
    const raw = localStorage.getItem("snake_best_score");
    const val = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(val) && val > 0 ? val : 0;
  } catch {
    return 0;
  }
}

function setBestScore(score) {
  try {
    localStorage.setItem("snake_best_score", String(score));
  } catch {
    // ignore
  }
}

function computeCellSize() {
  const { width, height } = canvas;
  cellSize = Math.floor(Math.min(width / CONFIG.cols, height / CONFIG.rows));
}

function getSpeedMs() {
  const step = (state.level - 1) * CONFIG.speedStepMs;
  const base = Math.max(80, CONFIG.baseSpeedMs - step);
  const factor = DifficultySpeedFactor[state.difficulty] ?? 1.0;
  return base / factor;
}

function updateScoreUI() {
  scoreEl.textContent = state.score.toString();
  bestScoreEl.textContent = state.bestScore.toString();
}

function updateSpeedUI() {
  const factor = (CONFIG.baseSpeedMs / getSpeedMs()).toFixed(1);
  const diffLabel =
    state.difficulty === Difficulty.EASY
      ? "简单"
      : state.difficulty === Difficulty.NORMAL
      ? "普通"
      : state.difficulty === Difficulty.HARD
      ? "困难"
      : "地狱";
  speedEl.textContent = `${factor}x · ${diffLabel}`;
}

function DifficultySelectValue() {
  const val = difficultySelect?.value || Difficulty.NORMAL;
  if (
    val === Difficulty.EASY ||
    val === Difficulty.NORMAL ||
    val === Difficulty.HARD ||
    val === Difficulty.HELL
  ) {
    return val;
  }
  return Difficulty.NORMAL;
}

function setOverlay(status) {
  switch (status) {
    case GameState.READY:
      overlayTitleEl.textContent = "准备开始";
      overlayMessageEl.textContent = "按 空格 或 点击“开始游戏”";
      overlayEl.classList.add("overlay--visible");
      break;
    case GameState.PAUSED:
      overlayTitleEl.textContent = "已暂停";
      overlayMessageEl.textContent = "再次按 空格 或 点击“开始”继续";
      overlayEl.classList.add("overlay--visible");
      break;
    case GameState.OVER:
      overlayTitleEl.textContent = "游戏结束";
      overlayMessageEl.textContent = "点击“重新开始”再来一局";
      overlayEl.classList.add("overlay--visible");
      break;
    case GameState.RUNNING:
      overlayEl.classList.remove("overlay--visible");
      break;
  }
}

function spawnFood(occupiedSet) {
  while (true) {
    const x = Math.floor(Math.random() * CONFIG.cols);
    const y = Math.floor(Math.random() * CONFIG.rows);
    const key = `${x},${y}`;
    if (!occupiedSet.has(key)) {
      return { x, y };
    }
  }
}

function getOccupiedSet() {
  const set = new Set();
  state.snake.forEach((seg) => set.add(`${seg.x},${seg.y}`));
  return set;
}

function positionsEqual(a, b) {
  return a.x === b.x && a.y === b.y;
}

function step() {
  const head = state.snake[state.snake.length - 1];
  const dir = state.nextDirection;

  // 防止直接反向
  if (state.snake.length > 1) {
    const prev = state.snake[state.snake.length - 2];
    if (prev.x === head.x + dir.x && prev.y === head.y + dir.y) {
      // 直接反向时，保持原方向
      state.nextDirection = state.direction;
    }
  }

  const finalDir = state.nextDirection;
  const newHead = {
    x: head.x + finalDir.x,
    y: head.y + finalDir.y,
  };

  // 撞墙
  if (
    newHead.x < 0 ||
    newHead.x >= CONFIG.cols ||
    newHead.y < 0 ||
    newHead.y >= CONFIG.rows
  ) {
    onGameOver();
    return;
  }

  // 撞自己
  if (state.snake.some((seg) => positionsEqual(seg, newHead))) {
    onGameOver();
    return;
  }

  const ateFood = positionsEqual(newHead, state.food);

  // 移动蛇身
  state.snake.push(newHead);
  if (!ateFood) {
    state.snake.shift();
  }

  if (ateFood) {
    state.score += CONFIG.foodScore;
    state.eatenCount += 1;

    if (state.score > state.bestScore) {
      state.bestScore = state.score;
      setBestScore(state.bestScore);
    }

    if (state.eatenCount % CONFIG.foodForLevelUp === 0) {
      state.level = Math.min(CONFIG.maxLevel, state.level + 1);
      flashCanvas();
    }

    state.food = spawnFood(getOccupiedSet());
    updateScoreUI();
    updateSpeedUI();
  }

  state.direction = finalDir;
}

function flashCanvas() {
  const original = canvas.style.boxShadow;
  canvas.style.boxShadow = "0 0 0 4px rgba(248, 113, 113, 0.7)";
  setTimeout(() => {
    canvas.style.boxShadow = original;
  }, 140);
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= CONFIG.cols; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cellSize + 0.5, 0);
    ctx.lineTo(x * cellSize + 0.5, CONFIG.rows * cellSize);
    ctx.stroke();
  }
  for (let y = 0; y <= CONFIG.rows; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cellSize + 0.5);
    ctx.lineTo(CONFIG.cols * cellSize, y * cellSize + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSnake() {
  const len = state.snake.length;

  for (let i = 0; i < len; i++) {
    const seg = state.snake[i];
    const isHead = i === len - 1;
    const x = seg.x * cellSize;
    const y = seg.y * cellSize;

    if (isHead) {
      // 头
      const radius = cellSize * 0.45;
      const cx = x + cellSize / 2;
      const cy = y + cellSize / 2;

      const grd = ctx.createRadialGradient(
        cx - cellSize * 0.2,
        cy - cellSize * 0.2,
        cellSize * 0.2,
        cx,
        cy,
        radius
      );
      grd.addColorStop(0, "#3b82f6");
      grd.addColorStop(1, "#0b7285");

      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // 眼睛
      const eyeOffset = cellSize * 0.18;
      let eyeDx = 0;
      let eyeDy = 0;
      if (state.direction === Direction.UP) eyeDy = -eyeOffset;
      else if (state.direction === Direction.DOWN) eyeDy = eyeOffset;
      else if (state.direction === Direction.LEFT) eyeDx = -eyeOffset;
      else if (state.direction === Direction.RIGHT) eyeDx = eyeOffset;

      const baseOffsetSide = cellSize * 0.18;
      const eyeRadius = cellSize * 0.11;
      const pupilRadius = eyeRadius * 0.5;

      const eye1x = cx + baseOffsetSide + eyeDx * 0.2;
      const eye1y = cy - baseOffsetSide + eyeDy * 0.2;
      const eye2x = cx + baseOffsetSide + eyeDx * 0.2;
      const eye2y = cy + baseOffsetSide + eyeDy * 0.2;

      ctx.fillStyle = "#ffffff";
      [ [eye1x, eye1y], [eye2x, eye2y] ].forEach(([ex, ey]) => {
        ctx.beginPath();
        ctx.arc(ex, ey, eyeRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111827";
        ctx.beginPath();
        ctx.arc(ex + eyeDx * 0.15, ey + eyeDy * 0.15, pupilRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
      });

      // 小舌头
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = cellSize * 0.08;
      ctx.beginPath();
      ctx.moveTo(cx + eyeDx * 0.9, cy + eyeDy * 0.9);
      ctx.lineTo(cx + eyeDx * 1.3, cy + eyeDy * 1.3);
      ctx.stroke();
    } else {
      // 身体方块，带轻微弧度
      const pad = cellSize * 0.1;
      const radius = cellSize * 0.3;
      const grd = ctx.createLinearGradient(
        x,
        y,
        x + cellSize,
        y + cellSize
      );
      grd.addColorStop(0, "#22c55e");
      grd.addColorStop(1, "#16a34a");

      ctx.fillStyle = grd;
      roundRect(ctx, x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2, radius);
      ctx.fill();

      // 轻微花纹
      ctx.strokeStyle = "rgba(15, 118, 110, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + pad * 1.2, y + cellSize / 2);
      ctx.lineTo(x + cellSize - pad * 1.2, y + cellSize / 2);
      ctx.stroke();
    }
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawFood() {
  const { x, y } = state.food;
  const px = x * cellSize;
  const py = y * cellSize;
  const r = cellSize * 0.35;
  const cx = px + cellSize / 2;
  const cy = py + cellSize / 2;

  const grd = ctx.createRadialGradient(
    cx - cellSize * 0.15,
    cy - cellSize * 0.15,
    cellSize * 0.1,
    cx,
    cy,
    r
  );
  grd.addColorStop(0, "#fecaca");
  grd.addColorStop(1, "#f97316");

  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // 叶子
  ctx.fillStyle = "#22c55e";
  ctx.beginPath();
  ctx.ellipse(
    cx - r * 0.2,
    cy - r * 0.9,
    r * 0.2,
    r * 0.45,
    -Math.PI / 8,
    0,
    Math.PI * 2
  );
  ctx.fill();
}

function clearCanvas() {
  ctx.fillStyle = "#e0f7ff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function draw() {
  clearCanvas();
  drawGrid();
  drawFood();
  drawSnake();
}

function loop(timestamp) {
  if (state.status !== GameState.RUNNING) return;

  if (!lastFrameTime) {
    lastFrameTime = timestamp;
  }

  const elapsed = timestamp - lastFrameTime;
  if (elapsed >= getSpeedMs()) {
    step();
    draw();
    lastFrameTime = timestamp;
  }

  gameLoopId = requestAnimationFrame(loop);
}

function startGame() {
  if (state.status === GameState.RUNNING) return;
  if (state.status === GameState.OVER) {
    initGameState();
  }
  state.status = GameState.RUNNING;
  lastFrameTime = 0;
  setOverlay(GameState.RUNNING);
  cancelAnimationFrame(gameLoopId);
  gameLoopId = requestAnimationFrame(loop);
}

function pauseGame() {
  if (state.status !== GameState.RUNNING) return;
  state.status = GameState.PAUSED;
  setOverlay(GameState.PAUSED);
  cancelAnimationFrame(gameLoopId);
}

function restartGame() {
  cancelAnimationFrame(gameLoopId);
  initGameState();
}

function onGameOver() {
  state.status = GameState.OVER;
  setOverlay(GameState.OVER);
  cancelAnimationFrame(gameLoopId);
}

function handleDirectionChange(newDir) {
  // 防止掉头
  const cur = state.direction;
  if (
    (cur === Direction.UP && newDir === Direction.DOWN) ||
    (cur === Direction.DOWN && newDir === Direction.UP) ||
    (cur === Direction.LEFT && newDir === Direction.RIGHT) ||
    (cur === Direction.RIGHT && newDir === Direction.LEFT)
  ) {
    return;
  }
  state.nextDirection = newDir;
}

// 键盘控制
window.addEventListener("keydown", (e) => {
  switch (e.key) {
    case "ArrowUp":
    case "w":
    case "W":
      e.preventDefault();
      handleDirectionChange(Direction.UP);
      break;
    case "ArrowDown":
    case "s":
    case "S":
      e.preventDefault();
      handleDirectionChange(Direction.DOWN);
      break;
    case "ArrowLeft":
    case "a":
    case "A":
      e.preventDefault();
      handleDirectionChange(Direction.LEFT);
      break;
    case "ArrowRight":
    case "d":
    case "D":
      e.preventDefault();
      handleDirectionChange(Direction.RIGHT);
      break;
    case " ":
      e.preventDefault();
      if (state.status === GameState.RUNNING) {
        pauseGame();
      } else {
        startGame();
      }
      break;
  }
});

// 触屏按钮
touchButtons.forEach((btn) => {
  const dirLabel = btn.dataset.dir;
  btn.addEventListener("click", () => {
    if (dirLabel === "up") handleDirectionChange(Direction.UP);
    if (dirLabel === "down") handleDirectionChange(Direction.DOWN);
    if (dirLabel === "left") handleDirectionChange(Direction.LEFT);
    if (dirLabel === "right") handleDirectionChange(Direction.RIGHT);
    if (state.status === GameState.READY || state.status === GameState.PAUSED) {
      startGame();
    }
  });
});

// 触摸滑动控制
let touchStartX = null;
let touchStartY = null;

canvas.addEventListener(
  "touchstart",
  (e) => {
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  },
  { passive: true }
);

canvas.addEventListener(
  "touchend",
  (e) => {
    if (touchStartX == null || touchStartY == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const minDist = 24;
    if (absX < minDist && absY < minDist) {
      // 轻点当作暂停/开始
      if (state.status === GameState.RUNNING) pauseGame();
      else startGame();
      touchStartX = touchStartY = null;
      return;
    }
    if (absX > absY) {
      if (dx > 0) handleDirectionChange(Direction.RIGHT);
      else handleDirectionChange(Direction.LEFT);
    } else {
      if (dy > 0) handleDirectionChange(Direction.DOWN);
      else handleDirectionChange(Direction.UP);
    }
    if (state.status === GameState.READY || state.status === GameState.PAUSED) {
      startGame();
    }
    touchStartX = touchStartY = null;
  },
  { passive: true }
);

// 按钮事件
btnStartOverlay.addEventListener("click", () => {
  startGame();
});

btnStart.addEventListener("click", () => startGame());
btnPause.addEventListener("click", () => pauseGame());
btnRestart.addEventListener("click", () => restartGame());

// 难度切换
if (difficultySelect) {
  difficultySelect.addEventListener("change", () => {
    state.difficulty = DifficultySelectValue();
    updateSpeedUI();
  });
}

// 适配缩放（保持画面清晰）
function resizeCanvasForDisplay() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.width * dpr; // 保持方形
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  computeCellSize();
  draw();
}

window.addEventListener("resize", () => {
  resizeCanvasForDisplay();
});

// 初始化
initGameState();
resizeCanvasForDisplay();


