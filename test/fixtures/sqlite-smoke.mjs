// Adaptador de testes para a API usada pelas migrações better-sqlite3.
import { DatabaseSync } from 'node:sqlite';
export default class Database extends DatabaseSync {
  inTransaction = false;
  pragma(sql, options = {}) {
    const rows = this.prepare('PRAGMA ' + sql).all();
    return options.simple ? (rows.length ? Object.values(rows[0])[0] : undefined) : rows;
  }
  transaction(fn) {
    return (...args) => {
      this.exec('BEGIN'); this.inTransaction = true;
      try { const result = fn(...args); this.exec('COMMIT'); return result; }
      catch (error) { this.exec('ROLLBACK'); throw error; }
      finally { this.inTransaction = false; }
    };
  }
}
