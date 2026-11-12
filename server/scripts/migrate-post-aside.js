async function applyPostAside(connection, sql) {
  const read = async () => (await connection.query("SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='posts' AND COLUMN_NAME='aside'"))[0][0];
  let column = await read();
  if (!column) { await connection.query(sql); column = await read(); }
  if (!column || column.COLUMN_TYPE.toLowerCase() !== 'varchar(40)' || column.IS_NULLABLE !== 'YES' || column.COLUMN_DEFAULT !== null) {
    throw new Error('posts.aside has an unexpected definition');
  }
}
module.exports = { applyPostAside };
