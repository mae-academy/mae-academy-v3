import { describe, expect, it } from "vitest";
import { CameraSync, moveCamera } from "./camera";

describe("3D orbit camera", () => {
  it("orbits and zooms within the IR limits", () => {
    const c = { azimuth: 1, elevation: 0.4, distance: 20 };
    expect(moveCamera(c, 0.5, 0.1)).toEqual({ azimuth: 1.5, elevation: 0.5, distance: 20 });
    expect(moveCamera(c, 0, 5).elevation).toBe(1.5);
    expect(moveCamera(c, 0, -5).elevation).toBe(-1.5);
    // Zoom limits are relative to the box half-size: 0.05·L to 200·L.
    expect(moveCamera(c, 0, 0, 1000, 5).distance).toBe(1000);
    expect(moveCamera(c, 0, 0, 0.001, 5).distance).toBe(0.25);
    // A large scene (L = 125, fitted far beyond 200) can still be orbited and zoomed out.
    expect(moveCamera({ ...c, distance: 600 }, 0.01, 0, 1.2, 125).distance).toBeCloseTo(720, 9);
  });
});

describe("CameraSync (which camera a step starts from)", () => {
  const cam = (azimuth: number, distance = 20) => ({ azimuth, elevation: 0.4, distance });
  const a = cam(1);
  const b = cam(1.1);
  const c = cam(1.2);

  it("a step is the next step's start, whatever the props still show", () => {
    const s = new CameraSync();
    s.sync(undefined, cam(0.5)); // fitted by the Worker
    expect(s.current()).toEqual(cam(0.5));
    s.emit(a);
    s.sync(undefined, cam(0.5)); // a frame arrives before the page stored the step
    expect(s.current()).toEqual(a);
  });

  it("a render showing an earlier step does not take a newer step back (the lost wheel tick)", () => {
    const s = new CameraSync();
    s.emit(a);
    s.sync(a, undefined); // commit of step a
    s.emit(b); // next wheel tick arrives before the passive effect of that commit
    s.sync(a, undefined); // the effect runs with the stale prop
    expect(s.current()).toEqual(b);
    s.emit(c);
    s.sync(b, undefined);
    s.sync(c, undefined);
    expect(s.current()).toEqual(c);
  });

  it("the mirror-the-props logic used before loses that step (model of the old behaviour)", () => {
    // The old rule: a step sets the ref; after every render the ref becomes the props' camera.
    const old: { ref: ReturnType<typeof cam> | null } = { ref: null };
    const oldEmit = (c: ReturnType<typeof cam>) => void (old.ref = c);
    const oldEffect = (props: ReturnType<typeof cam>) => void (old.ref = props);
    oldEmit(a);
    oldEffect(a); // effect for commit a
    oldEmit(b);
    oldEffect(a); // stale effect: the props still show a
    expect(old.ref).toEqual(a); // step b lost
    const s = new CameraSync();
    s.emit(a);
    s.sync(a, undefined);
    s.emit(b);
    s.sync(a, undefined);
    expect(s.current()).toEqual(b);
  });

  it("a camera that is not ours (loaded link, Reset view) replaces the ref", () => {
    const s = new CameraSync();
    s.emit(a);
    s.sync(a, undefined);
    s.sync(cam(3), undefined); // a link loaded
    expect(s.current()).toEqual(cam(3));
    s.emit(b);
    s.sync(b, undefined);
    s.sync(undefined, cam(0.5)); // Reset view: no document camera, the fitted one
    expect(s.current()).toEqual(cam(0.5));
  });

  it("alternating ticks over many renders in any interleaving end at the last step", () => {
    // Random interleavings of emits and (possibly stale) prop syncs: the last emitted step must always remain current.
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let trial = 0; trial < 200; trial++) {
      const s = new CameraSync();
      const steps: ReturnType<typeof cam>[] = [];
      for (let k = 0; k < 60; k++) {
        const next = cam(k * 0.01 + trial);
        steps.push(next);
        s.emit(next);
        // The page reports back some earlier step (never a later one), possibly several times.
        const shown = steps[Math.floor(rnd() * steps.length)];
        if (rnd() < 0.7) s.sync(shown, undefined);
        expect(s.current()).toEqual(next);
      }
    }
  });
});
