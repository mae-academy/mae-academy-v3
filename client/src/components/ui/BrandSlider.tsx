import * as React from "react";
import { cn } from "@/lib/utils";

export interface BrandSliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  className?: string;
}

export const BrandSlider = React.forwardRef<HTMLInputElement, BrandSliderProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="range"
        className={cn(
          "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-[#2563eb] via-[#7c3aed] to-[#f43f5e] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#2563eb] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[#2563eb] [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent",
          className
        )}
        {...props}
      />
    );
  }
);

BrandSlider.displayName = "BrandSlider";

export default BrandSlider;
