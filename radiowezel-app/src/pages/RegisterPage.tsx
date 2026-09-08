import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { ALLOWED_EMAIL_DOMAIN } from "@/types/api";

export function RegisterPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({ title: "Podaj adres e-mail", variant: "destructive" });
      return;
    }
    if (!email.trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      toast({
        title: "Nieprawidłowa domena",
        description: `Dozwolone są tylko adresy @${ALLOWED_EMAIL_DOMAIN}`,
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      }).then((r) => {
        if (!r.ok) return r.json().then((j) => { throw new Error(j.message); });
        return r.json();
      });
      setSent(true);
      toast({ title: "Wysłano link", description: "Kliknij link w e-mailu, aby potwierdzić rejestrację i zalogować się." });
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sprawdź e-mail</CardTitle>
            <CardDescription>
              Wysłaliśmy link weryfikacyjny na adres {email}. Kliknij go, aby potwierdzić rejestrację i zalogować się. Link jest ważny 1 godzinę.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/login">
              <Button variant="outline" className="w-full">
                Wróć do logowania
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Rejestracja</CardTitle>
          <CardDescription>
            Wpisz adres e-mail szkolny (@{ALLOWED_EMAIL_DOMAIN}). Wyślemy link – po kliknięciu będziesz zarejestrowany i zalogowany.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder={`user@${ALLOWED_EMAIL_DOMAIN}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Wysyłanie…" : "Zarejestruj się"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            Masz już konto?{" "}
            <Link to="/login" className="text-primary underline">
              Zaloguj się
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
