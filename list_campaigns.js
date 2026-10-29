import Database from 'better-sqlite3';
import path from 'path';
const db = new Database(path.join(process.cwd(), 'data', 'database.sqlite'));
const campaigns = db.prepare('SELECT * FROM Campaign').all();
console.log(JSON.stringify(campaigns, null, 2));
