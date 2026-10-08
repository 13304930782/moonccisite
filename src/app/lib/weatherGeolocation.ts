// City weather can use a coarse Wi-Fi fix; the user confirms the suggested city.
// Every user-initiated retry must request a fresh fix, not an old saved coordinate.
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
    return await read({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  } catch (error: any) {
    if (![2, 3].includes(error.code)) throw error;
    return read({ enableHighAccuracy: false, timeout: 8000, maximumAge: 0 });
  }
}
