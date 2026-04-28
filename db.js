// sql.js SQLite wrapper — persists DB bytes in localStorage

const LS_KEY = 'go_weiqi_db';

export async function initDB() {
  const SQL = await initSqlJs({
    locateFile: file =>
      `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${file}`
  });

  let db;
  const saved = localStorage.getItem(LS_KEY);
  if (saved) {
    const bytes = Uint8Array.from(atob(saved), c => c.charCodeAt(0));
    db = new SQL.Database(bytes);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      date          TEXT,
      board_size    INTEGER,
      difficulty    TEXT,
      black_player  TEXT DEFAULT 'Human',
      white_player  TEXT DEFAULT 'AI',
      result        TEXT,
      total_moves   INTEGER,
      duration_sec  INTEGER,
      sgf           TEXT
    )
  `);

  persist(db);
  return db;
}

function persist(db) {
  try {
    const bytes = db.export();
    const b64 = btoa(String.fromCharCode(...bytes));
    localStorage.setItem(LS_KEY, b64);
  } catch (e) {
    console.warn('Could not persist DB:', e);
  }
}

export async function saveGame(db, { date, board_size, difficulty, result,
                                     total_moves, duration_sec, sgf }) {
  db.run(
    `INSERT INTO games (date, board_size, difficulty, result, total_moves, duration_sec, sgf)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [date, board_size, difficulty, result, total_moves, duration_sec, sgf]
  );
  persist(db);
}

export async function loadHistory(db) {
  const rows = [];
  const res = db.exec(
    'SELECT id, date, board_size, difficulty, result, total_moves FROM games ORDER BY id DESC LIMIT 50'
  );
  if (res.length === 0) return rows;
  const { columns, values } = res[0];
  for (const row of values) {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    rows.push(obj);
  }
  return rows;
}

export function exportSGF(db, id) {
  const res = db.exec(`SELECT sgf, date, board_size FROM games WHERE id = ${parseInt(id)}`);
  if (!res.length || !res[0].values.length) return;
  const [sgf, date, size] = res[0].values[0];
  const blob = new Blob([sgf], { type: 'application/x-go-sgf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `go_${size}x${size}_${date}.sgf`;
  a.click();
  URL.revokeObjectURL(url);
}
