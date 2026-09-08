const db = require('../db');
const { businessDate } = require('../lib/weatherMood');
function createInteractionRepository(pool = db, clock = () => new Date()) {
  async function readToday() {
    const date = businessDate(clock(), 'Asia/Shanghai');
    const [rows] = await pool.query(
      "SELECT COALESCE(SUM(kind='pet'),0) AS pets, COALESCE(SUM(kind='hit'),0) AS hits FROM weather_companion_interactions WHERE interaction_date=?",
      [date],
    );
    return {
      date,
      timezone: 'Asia/Shanghai',
      pets: Number(rows[0].pets),
      hits: Number(rows[0].hits),
    };
  }
  async function record({ id, kind }) {
    const date = businessDate(clock(), 'Asia/Shanghai');
    try {
      await pool.query(
        'INSERT INTO weather_companion_interactions (id, interaction_date, kind, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3))',
        [id, date, kind],
      );
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
      const [rows] = await pool.query(
        'SELECT kind FROM weather_companion_interactions WHERE id=?',
        [id],
      );
      if (rows[0]?.kind !== kind)
        throw Object.assign(new Error('互动标识已被使用。'), { status: 409 });
    }
    return readToday();
  }
  return { readToday, record };
}
module.exports = {
  createInteractionRepository,
  ...createInteractionRepository(),
};
