import { clsx } from "clsx";

const variants = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  success: "bg-green-500/10 text-green-400 border-green-500/20",
  neutral: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  doctor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  patient: "bg-green-500/10 text-green-400 border-green-500/20",
  admin: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

interface BadgeProps {
  variant?: keyof typeof variants;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "neutral", children, className }: BadgeProps) {
  return (
    <span className={clsx(
      "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border",
      variants[variant], className
    )}>
      {children}
    </span>
  );
}