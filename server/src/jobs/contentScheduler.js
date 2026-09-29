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
  const stopEngagement = repeat('notification-mail', () => require('../services/engagement').runMail());
  const stopPublishing = repeat('article-publishing', () => require('../services/articleWorkflow').runDue());
  const stopGithub = repeat('github-sync', async () => {
    if (process.env.GITHUB_SYNC_ENABLED === 'true') await syncAll();
  });
  const stopNewsletter = repeat('newsletter', () => deliverWeek());
  let lastCleanup=0;
  const stopRevisions=repeat('revision-cleanup',async()=>{if(Date.now()-lastCleanup<86400000)return;lastCleanup=Date.now();await require('../lib/articleRevisions').cleanup(require('../db'));});
  return () => {
    stopEngagement();
    stopPublishing();
    stopRevisions();
    stopGithub();
    stopNewsletter();
  };
}
module.exports = { startContentScheduler };
