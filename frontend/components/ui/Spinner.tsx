import { clsx } from "clsx";

export function Spinner({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <div className={clsx(
      "border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin",
      size === "sm" && "w-4 h-4",
      size === "md" && "w-6 h-6",
      size === "lg" && "w-10 h-10",
      className
    )} />
  );
}