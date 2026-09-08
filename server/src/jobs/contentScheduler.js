const { syncAll } = require('../services/githubSync');
const { deliverWeek } = require('../services/newsletter');
function startContentScheduler() {
  if (process.env.MOONCCI_TASK_PROCESS !== 'true') return () => {};
  function repeat(name, work) {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await work();
      } catch (error) {
        console.error(`[${name}]`, error.code || error.message);
      } finally {
        running = false;
      }
    };
    const timer = setInterval(tick, 60000);
    timer.unref();
    const startup = setTimeout(tick, 10000);
    startup.unref();
    return () => {
      clearInterval(timer);
      clearTimeout(startup);
    };
  }
  const stopGithub = repeat('github-sync', async () => {
    if (process.env.GITHUB_SYNC_ENABLED === 'true') await syncAll();
  });
  const stopNewsletter = repeat('newsletter', () => deliverWeek());
  return () => {
    stopGithub();
    stopNewsletter();
  };
}
module.exports = { startContentScheduler };
