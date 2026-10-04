"use client";

import { Badge } from "@my-better-t-app/ui/components/badge";
import { Card, CardContent } from "@my-better-t-app/ui/components/card";
import { Label } from "@my-better-t-app/ui/components/label";
import { Switch } from "@my-better-t-app/ui/components/switch";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { useId } from "react";
import { toast } from "sonner";

import { getMissingSetup } from "./setup-status";
import type { BrokerSettingsData } from "./types";
import { useUpdateSettings } from "./use-broker-mutations";

export function BrokerToggleCard({ settings }: { settings: BrokerSettingsData }) {
  const switchId = useId();
  const descriptionId = useId();
  const updateSettings = useUpdateSettings();

  const enabled = updateSettings.isPending
    ? Boolean(updateSettings.variables?.enabled)
    : settings.enabled;
  const missing = getMissingSetup(settings);

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Label htmlFor={switchId} className="font-semibold text-base tracking-tight">
                Broker automat activ
              </Label>
              <StatusBadge enabled={enabled} ready={missing.length === 0} />
            </div>
            <p id={descriptionId} className="text-muted-foreground text-sm">
              Când un produs din lista ta ajunge la prețul țintă, îl cumpărăm automat pentru tine,
              în limitele pe care le setezi mai jos.
            </p>
          </div>
          <Switch
            id={switchId}
            checked={enabled}
            disabled={updateSettings.isPending}
            aria-describedby={descriptionId}
            onCheckedChange={(next) =>
              updateSettings.mutate(
                { enabled: next },
                {
                  onSuccess: () =>
                    toast.success(
                      next ? "Brokerul automat a fost activat." : "Brokerul automat a fost oprit.",
                    ),
                },
              )
            }
          />
        </div>

        <div aria-live="polite">
          {enabled && missing.length > 0 ? <SetupWarning missing={missing} /> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ enabled, ready }: { enabled: boolean; ready: boolean }) {
  if (!enabled) {
    return <Badge variant="secondary">Oprit</Badge>;
  }
  if (!ready) {
    return (
      <Badge variant="warning">
        <TriangleAlert aria-hidden="true" />
        Activ, dar incomplet
      </Badge>
    );
  }
  return (
    <Badge variant="success">
      <CircleCheck aria-hidden="true" />
      Activ
    </Badge>
  );
}

function SetupWarning({ missing }: { missing: string[] }) {
  return (
    <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/15 p-3 text-sm text-warning-foreground dark:border-warning/50 dark:bg-warning/20">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-1.5">
        <p className="font-medium">Brokerul este activ, dar încă nu poate cumpăra.</p>
        <p>Mai ai de completat:</p>
        <ul className="list-disc space-y-0.5 pl-5">
          {missing.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
