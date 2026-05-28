"use client";

import gsap from "gsap";
import { useEffect, useRef } from "react";

export function usePopIn<T extends HTMLElement = HTMLDivElement>(
  deps: unknown[] = [],
) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(
      ref.current,
      { opacity: 0, y: 10, scale: 0.97 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.32,
        ease: "power2.out",
        clearProps: "transform",
      },
    );

  }, deps);
  return ref;
}


export function useStaggerIn<T extends HTMLElement = HTMLDivElement>(
  deps: unknown[] = [],
  options?: { y?: number; stagger?: number; duration?: number },
) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const items = Array.from(ref.current.children);
    if (items.length === 0) return;
    gsap.fromTo(
      items,
      { opacity: 0, y: options?.y ?? 12 },
      {
        opacity: 1,
        y: 0,
        duration: options?.duration ?? 0.35,
        stagger: options?.stagger ?? 0.04,
        ease: "power2.out",
        overwrite: "auto",
        clearProps: "transform",
      },
    );

  }, deps);
  return ref;
}

export function useFadeSwap<T extends HTMLElement = HTMLDivElement>(
  key: unknown,
) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(
      ref.current,
      { opacity: 0, y: 8 },
      {
        opacity: 1,
        y: 0,
        duration: 0.28,
        ease: "power2.out",
        clearProps: "transform",
      },
    );
  }, [key]);
  return ref;
}


export function hoverLift(y: number = -2, duration: number = 0.18) {
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      gsap.to(e.currentTarget, { y, duration, ease: "power2.out" });
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      gsap.to(e.currentTarget, { y: 0, duration, ease: "power2.out" });
    },
  };
}


export function pressScale(down = 0.94, up = 1) {
  return {
    onMouseDown: (e: React.MouseEvent<HTMLElement>) => {
      gsap.to(e.currentTarget, {
        scale: down,
        duration: 0.08,
        ease: "power2.out",
      });
    },
    onMouseUp: (e: React.MouseEvent<HTMLElement>) => {
      gsap.to(e.currentTarget, {
        scale: up,
        duration: 0.14,
        ease: "back.out(2)",
      });
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      gsap.to(e.currentTarget, {
        scale: up,
        duration: 0.14,
        ease: "power2.out",
      });
    },
  };
}
