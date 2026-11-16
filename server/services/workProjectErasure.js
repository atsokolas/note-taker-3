const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

// Each database batch is transactional, so every API instance can sweep safely.
function startWorkProjectErasure({ connection, eraseDue, onError = console.error }) {
  let running = false;
  const sweep = async () => {
    if (running || connection.readyState !== 1) return;
    running = true;
    try {
      const result = await eraseDue();
      if (result?.blocked || result?.failed) onError('[work-project-erasure] incomplete batches', { blocked: result.blocked || 0, failed: result.failed || 0 });
    }
    catch (error) { onError('[work-project-erasure] sweep failed', error); }
    finally { running = false; }
  };
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  timer.unref?.();
  connection.on('connected', sweep);
  void sweep();
  return () => { clearInterval(timer); connection.off('connected', sweep); };
}
module.exports = { startWorkProjectErasure, SWEEP_INTERVAL_MS };
