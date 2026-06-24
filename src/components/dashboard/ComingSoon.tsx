import type { LucideIcon } from "lucide-react";

export function ComingSoon({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="glass-card rounded-3xl p-10 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-primary to-accent grid place-content-center mb-5 shadow-[0_0_30px_rgba(139,92,246,0.4)]">
          <Icon className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground mt-2">{description}</p>
      </div>
    </div>
  );
}
