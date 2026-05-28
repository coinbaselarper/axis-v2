"use client";

import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";
import { useEffect, useMemo, useState } from "react";

function readAccent(): string {
  if (typeof window === "undefined") return "#e8e8e8";
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--axis-accent")
    .trim();
  return v || "#e8e8e8";
}

export default function ParticlesBg() {
  const [ready, setReady] = useState(false);
  const [accent, setAccent] = useState<string>("#e8e8e8");

  useEffect(() => {
    import("../api/ads/ads");
  }, []);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setReady(true));
  }, []);

  useEffect(() => {
    setAccent(readAccent());
    const onSettings = () => setAccent(readAccent());
    document.addEventListener("axis:settings-change", onSettings);
    const obs = new MutationObserver(() => setAccent(readAccent()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style", "class"],
    });
    return () => {
      document.removeEventListener("axis:settings-change", onSettings);
      obs.disconnect();
    };
  }, []);

  const options: ISourceOptions = useMemo(
    () => ({
      fullScreen: { enable: false },
      background: { color: { value: "transparent" } },
      fpsLimit: 60,
      detectRetina: true,
      interactivity: {
        events: {
          onHover: { enable: true, mode: "grab" },
          resize: { enable: true },
        },
        modes: {
          grab: {
            distance: 140,
            links: { opacity: 0.6 },
          },
        },
      },
      particles: {
        color: { value: accent },
        links: {
          color: accent,
          distance: 130,
          enable: true,
          opacity: 0.25,
          width: 1,
        },
        move: {
          enable: true,
          direction: "right",
          outModes: { default: "out" },
          random: false,
          speed: 5,
          straight: true,
        },
        number: {
          density: { enable: true, width: 1600, height: 900 },
          value: 60,
        },
        opacity: {
          value: { min: 0.15, max: 0.55 },
          animation: { enable: true, speed: 0.6, sync: false },
        },
        shape: { type: "circle" },
        size: {
          value: { min: 1, max: 2.4 },
        },
      },
      smooth: true,
    }),
    [accent],
  );

  if (!ready) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
    >
      <Particles
        id="axis-particles"
        options={options}
        className="h-full w-full"
      />
    </div>
  );
}
