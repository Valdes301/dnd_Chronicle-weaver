import db from './src/lib/db.js';
const tableInfo = db.prepare("PRAGMA table_info(Session)").all();
console.log(JSON.stringify(tableInfo, null, 2));
