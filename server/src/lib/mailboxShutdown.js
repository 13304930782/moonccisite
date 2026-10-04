function installMailboxShutdown(server, shutdown, { signals = process, exit = code => process.exit(code), graceMs = 60000 } = {}) {
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    shutdown(); // Synchronously reject new pool tasks and destroy retained sockets.
    const timeout = setTimeout(() => exit(1), graceMs);
    timeout.unref?.();
    server.close(() => { clearTimeout(timeout); exit(0); });
  };
  signals.once('SIGTERM', stop);
  signals.once('SIGINT', stop); // PM2 normally uses SIGINT.
}
module.exports = { installMailboxShutdown };
