// City weather can use a coarse Wi-Fi fix; the user confirms the suggested city.
// Start with a quick cached fix, then try a fresh fix on timeout/unavailability.
export async function locateWeatherDevice(geolocation: Geolocation, signal?: AbortSignal) {
  const read = (options: PositionOptions) =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
      const cancel = () => { cleanup(); reject(new DOMException('Location cancelled', 'AbortError')); };
      const timer = setTimeout(() => { cleanup(); reject({ code: 3 }); }, options.timeout! + 1000);
      if (signal?.aborted) { cancel(); return; }
      signal?.addEventListener('abort', cancel, { once: true });
      geolocation.getCurrentPosition(
        (position) => { cleanup(); resolve(position); },
        (error) => { cleanup(); reject(error); },
        options,
      );
    });
  try {
    return await read({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  } catch (error: any) {
    if (![2, 3].includes(error.code)) throw error;
    return read({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }
}
