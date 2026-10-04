"use client";

import { Button } from "@my-better-t-app/ui/components/button";
import { Switch } from "@my-better-t-app/ui/components/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@my-better-t-app/ui/components/tooltip";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { BrokerTarget } from "./types";
import { useClearTarget, useSetTarget } from "./use-broker-mutations";

/** Turns automatic buying on or off for one product, keeping its target price and quantity. */
export function AutoBuySwitch({ target }: { target: BrokerTarget }) {
  const setTarget = useSetTarget();
  const checked = setTarget.isPending
    ? Boolean(setTarget.variables?.autoBuyEnabled)
    : target.autoBuyEnabled;

  return (
    <Switch
      checked={checked}
      disabled={setTarget.isPending}
      aria-label={`Cumpărare automată pentru ${target.title}`}
      onCheckedChange={(next) =>
        setTarget.mutate(
          {
            productId: target.productId,
            targetPrice: target.targetPrice,
            quantity: target.quantity,
            autoBuyEnabled: next,
          },
          {
            onSuccess: () =>
              toast.success(
                next
                  ? "Cumpărarea automată a fost activată pentru acest produs."
                  : "Cumpărarea automată a fost oprită pentru acest produs.",
              ),
          },
        )
      }
    />
  );
}

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
