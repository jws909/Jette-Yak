export function createLatestRequest() {
  let version = 0;
  return {
    begin() {
      const request = ++version;
      return () => request === version;
    },
    cancel() { version += 1; },
  };
}
