"use client";

import { Button } from "@my-better-t-app/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@my-better-t-app/ui/components/tooltip";
import { Trash2 } from "lucide-react";

import type { BrokerTarget } from "./types";
import { useClearTarget } from "./use-broker-mutations";

const DESTRUCTIVE_GHOST = "text-destructive hover:bg-destructive/10 hover:text-destructive";

/** Removes the target price (the product stays in the cart). Icon-only in the wide table layout. */
export function RemoveTargetButton({
  target,
  iconOnly = false,
}: {
  target: BrokerTarget;
  iconOnly?: boolean;
}) {
  const clearTarget = useClearTarget();
  const remove = () => clearTarget.mutate({ productId: target.productId });

  if (iconOnly) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className={DESTRUCTIVE_GHOST}
              aria-label={`Elimină ținta pentru ${target.title}`}
              disabled={clearTarget.isPending}
              onClick={remove}
            />
          }
        >
          <Trash2 aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>Elimină ținta</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      variant="ghost"
      className={DESTRUCTIVE_GHOST}
      disabled={clearTarget.isPending}
      onClick={remove}
    >
      <Trash2 aria-hidden="true" />
      Elimină ținta
      <span className="sr-only"> pentru {target.title}</span>
    </Button>
  );
}
