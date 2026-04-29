import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, strokeWidth = 1.75, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

export function IconSprout(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M7 20h10" />
      <path d="M10 20c5.5-2.5.42-9.5 5-12" />
      <path d="M14 20c-3-3.4-1.5-9 0-12 1.5 1 4 4 4 7-1.4 0-3-.5-4-2.5" />
      <path d="M9.8 16.4C7 15 5 12 4 9c2.5-1.5 7 0 9 2" />
    </svg>
  );
}
export function IconShield(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3 4 6v6c0 4.4 3.4 8.4 8 9 4.6-.6 8-4.6 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
export function IconMap(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}
export function IconCalculator(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
    </svg>
  );
}
export function IconCloud(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="17" cy="6.5" r="2.5" />
      <path d="M7 18h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.5 1A3.5 3.5 0 0 0 7 18Z" />
    </svg>
  );
}
export function IconFile(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}
export function IconArrowRight(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
export function IconSparkle(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
    </svg>
  );
}
export function IconAlert(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 4 2 20h20L12 4Z" />
      <path d="M12 10v4M12 17v.01" />
    </svg>
  );
}
export function IconCheck(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  );
}
export function IconChart(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 20h16" />
      <path d="M7 20V10M12 20V4M17 20v-8" />
    </svg>
  );
}
export function IconCoin(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9h5a2 2 0 1 1 0 4H9m0 0h5a2 2 0 1 1 0 4H9m0-8v10M7 9h2M7 17h2" />
    </svg>
  );
}
export function IconSearch(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.3-4.3" />
    </svg>
  );
}
export function IconBuilding(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M9 8h.01M14 8h.01M9 12h.01M14 12h.01M9 16h.01M14 16h.01" />
    </svg>
  );
}
export function IconLink(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 1 0 5.66 5.66l1-1" />
    </svg>
  );
}
export function IconLayers(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5M3 18l9 5 9-5" />
    </svg>
  );
}
