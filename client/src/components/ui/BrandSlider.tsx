import * as React from "react";
import { StudioSlider } from "@/components/common/templates/StudioSlider";

export interface BrandSliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  className?: string;
}

export const BrandSlider = React.forwardRef<HTMLInputElement, BrandSliderProps>(
  ({ className = "", min = 0, max = 100, step = 1, value, defaultValue, onChange, ...props }, ref) => {
    return (
      <StudioSlider
        ref={ref}
        min={Number(min)}
        max={Number(max)}
        step={Number(step)}
        value={value !== undefined ? Number(value) : undefined}
        defaultValue={defaultValue !== undefined ? Number(defaultValue) : undefined}
        onChange={val => {
          if (onChange) {
            onChange({ target: { value: String(val) } } as unknown as React.ChangeEvent<HTMLInputElement>);
          }
        }}
        hideHeader
        className={className}
        {...props}
      />
    );
  }
);

BrandSlider.displayName = "BrandSlider";

export default BrandSlider;
