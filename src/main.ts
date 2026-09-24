// Placeholder entry point: draws an empty grid to prove the pipeline works.
// Phase 1 (core maze) replaces this.

const COLS = 24;
const ROWS = 16;
const CELL = 32;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
canvas.width = COLS * CELL;
canvas.height = ROWS * CELL;

ctx.fillStyle = "#0b0f14";
ctx.fillRect(0, 0, canvas.width, canvas.height);

ctx.strokeStyle = "#1c2733";
ctx.lineWidth = 1;
for (let x = 0; x <= COLS; x++) {
  ctx.beginPath();
  ctx.moveTo(x * CELL + 0.5, 0);
  ctx.lineTo(x * CELL + 0.5, canvas.height);
  ctx.stroke();
}
for (let y = 0; y <= ROWS; y++) {
  ctx.beginPath();
  ctx.moveTo(0, y * CELL + 0.5);
  ctx.lineTo(canvas.width, y * CELL + 0.5);
  ctx.stroke();
}

ctx.fillStyle = "#5fb3ff";
ctx.font = "600 20px system-ui, sans-serif";
ctx.textAlign = "center";
ctx.fillText("Risen Tower Defence", canvas.width / 2, canvas.height / 2);
