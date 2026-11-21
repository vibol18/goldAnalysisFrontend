interface Props {
  className?: string;
}

const TEXT =
  'Educational analysis only. Not financial advice. Trading gold is risky and signals can be wrong. Never risk money you can\u2019t afford to lose.';

/** Mandatory risk disclaimer shown on every page. */
export default function Disclaimer({ className = '' }: Props) {
  return (
    <p
      className={`text-[11px] leading-relaxed text-amber-200/70 ${className}`}
      role="note"
      aria-label="Risk disclaimer"
    >
      ⚠ {TEXT}
    </p>
  );
}
