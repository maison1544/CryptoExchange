import React from "react";

export function AdminLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium uppercase tracking-[0.12em] text-gray-500">
      {children}
    </label>
  );
}

export function AdminInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-white/8 bg-white/3 px-3.5 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-yellow-500/50 focus:bg-white/4 focus:outline-none ${props.className || ""}`}
    />
  );
}

export function AdminSelect(
  props: React.SelectHTMLAttributes<HTMLSelectElement>,
) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-white/8 bg-white/3 px-3.5 py-2.5 text-sm text-white focus:border-yellow-500/50 focus:bg-white/4 focus:outline-none [&>option]:text-black [&>option]:bg-white ${props.className || ""}`}
    >
      {props.children}
    </select>
  );
}

export function AdminButton({
  variant = "primary",
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  const baseClasses =
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

  const variantClasses = {
    primary: "bg-yellow-500 text-black hover:bg-yellow-400",
    secondary: "border border-white/8 bg-white/3 text-white hover:bg-white/5",
    danger:
      "border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/15",
  };

  const sizeClasses = {
    sm: "px-3 py-2 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-6 py-3 text-base",
  };

  return (
    <button
      {...props}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${props.className || ""}`}
    />
  );
}
