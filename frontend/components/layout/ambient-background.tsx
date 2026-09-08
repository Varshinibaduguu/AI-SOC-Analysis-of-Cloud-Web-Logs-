"use client";

/** Animated mesh + orbs behind the SOC UI */
export function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-mesh-gradient opacity-90" />
      <div className="absolute inset-0 bg-grid-fine opacity-40" />
      <div className="orb orb-cyan absolute -left-32 top-20 h-[420px] w-[420px]" />
      <div className="orb orb-violet absolute -right-24 top-1/3 h-[380px] w-[380px]" />
      <div className="orb orb-blue absolute bottom-0 left-1/3 h-[320px] w-[320px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(222_47%_4%)_75%)]" />
    </div>
  );
}
