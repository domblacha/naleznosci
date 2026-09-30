import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  pending: boolean;
  pendingText: string;
  icon: ReactNode;
  children: ReactNode;
}

export function SubmitButton({ pending, pendingText, icon, children }: SubmitButtonProps) {
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : icon}
      {pending ? pendingText : children}
    </Button>
  );
}
