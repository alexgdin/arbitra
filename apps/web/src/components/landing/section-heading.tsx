export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="font-medium text-primary text-sm">{eyebrow}</p>
      <h2 id={id} className="mt-2 font-semibold text-3xl tracking-tight sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 text-pretty text-base text-muted-foreground">{description}</p>
    </div>
  );
}
