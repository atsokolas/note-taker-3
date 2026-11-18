// Work's tests are written against November 2026, and a date names its year only when it
// isn't this one. Each test runs on a clock moved back to then, still ticking.
export function runInNovember2026() {
  const RealDate = Date;
  beforeEach(() => {
    const offset = RealDate.parse('2026-11-18T12:00:00Z') - RealDate.now();
    global.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [RealDate.now() + offset])); }
      static now() { return RealDate.now() + offset; }
    };
  });
  afterEach(() => { global.Date = RealDate; });
}
