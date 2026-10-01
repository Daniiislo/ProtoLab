import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// shadcn/ui Button, giữ primitive và thay style bằng token của ProtoLab.
const buttonVariants = cva("button", {
  variants: {
    variant: { default: "button-primary", outline: "button-outline", ghost: "button-ghost" },
    size: { default: "", sm: "button-sm", icon: "button-icon" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };
function Button({
  className,
  variant,
  size,
  asChild = false,
  type = "button",
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
export { Button, buttonVariants };
