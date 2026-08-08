import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Mail, MessageCircle, MapPin, Phone, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { SocialPlatforms } from "@/components/landing/SocialPlatforms";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PageGate } from "@/components/PageGate";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact AD4YOU — We're here to help" },
      { name: "description", content: "Reach the AD4YOU team via email, WhatsApp, or the contact form. We respond within 24 hours." },
    ],
  }),
  component: () => (
    <PageGate pageKey="page_contact_enabled">
      <ContactPage />
    </PageGate>
  ),
});

function ContactPage() {
  const { data: settings } = useQuery({
    queryKey: ["settings", "contact"],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("key,value")
        .in("key", ["contact_info", "support_email", "whatsapp_number", "contact_address", "contact_phone"]);
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { if (r.value) map[r.key] = r.value; });
      return map;
    },
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!name.trim() || !email.trim() || !message.trim()) { toast.error("Please fill all fields"); return; }
    setSending(true);
    const { error } = await supabase.from("contact_messages").insert({
      name: name.trim(), email: email.trim(), message: message.trim(), status: "new",
    } as never);
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success("Message sent! We'll reply within 24 hours.");
    setName(""); setEmail(""); setMessage("");
  };

  const wa = settings?.whatsapp_number?.replace(/[^\d]/g, "");
  const supportEmail = settings?.support_email || "support@ad4you.click";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pt-28 pb-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center mb-12">
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight bg-gradient-to-r from-white via-primary to-accent bg-clip-text text-transparent">
              Get in touch
            </h1>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              {settings?.contact_info || "We would love to hear from you."}
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <ContactCard icon={<Mail className="w-5 h-5" />} title="Email" value={supportEmail} href={`mailto:${supportEmail}`} />
              {wa && (
                <ContactCard icon={<MessageCircle className="w-5 h-5" />} title="WhatsApp" value={settings?.whatsapp_number ?? ""} href={`https://wa.me/${wa}`} external />
              )}
              {settings?.contact_phone && (
                <ContactCard icon={<Phone className="w-5 h-5" />} title="Phone" value={settings.contact_phone} href={`tel:${settings.contact_phone}`} />
              )}
              {settings?.contact_address && (
                <ContactCard icon={<MapPin className="w-5 h-5" />} title="Address" value={settings.contact_address} />
              )}
              <div className="glass-card rounded-2xl p-6">
                <p className="text-sm font-semibold mb-3">Follow us</p>
                <SocialPlatforms />
              </div>
            </div>

            <div className="glass-card rounded-3xl p-8 space-y-4">
              <h2 className="text-2xl font-bold">Send a message</h2>
              <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Textarea rows={6} placeholder="How can we help?" value={message} onChange={(e) => setMessage(e.target.value)} />
              <Button onClick={submit} disabled={sending} className="w-full bg-gradient-to-r from-primary to-accent text-white">
                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Send message
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function ContactCard({ icon, title, value, href, external }: { icon: React.ReactNode; title: string; value: string; href?: string; external?: boolean }) {
  const inner = (
    <div className="glass-card rounded-2xl p-5 flex items-center gap-4 hover:bg-white/5 transition">
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/25 to-accent/20 grid place-items-center text-primary">{icon}</div>
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{title}</p>
        <p className="font-semibold">{value}</p>
      </div>
    </div>
  );
  return href ? (
    <a href={href} target={external ? "_blank" : undefined} rel="noreferrer">{inner}</a>
  ) : inner;
}
