import { useState } from "react";
import { Eye, EyeOff, LogIn, UserPlus, KeyRound, ArrowLeft, Check } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import logoSrc from "../../imports/raivstream-logo-1.jpg";

type AuthView = "signin" | "signup" | "forgot" | "reset";

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", ok: password.length >= 8 },
    { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "Number", ok: /\d/.test(password) },
    { label: "Special character", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-green-500"];
  const labels = ["Weak", "Fair", "Good", "Strong"];

  if (!password) return null;

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`flex-1 h-1 rounded-full transition-all ${i < score ? colors[score - 1] : "bg-muted"}`} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Strength</span>
        <span className={`text-xs font-medium ${score >= 3 ? "text-green-400" : score >= 2 ? "text-yellow-400" : "text-red-400"}`}>
          {score > 0 ? labels[score - 1] : ""}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {checks.map(c => (
          <div key={c.label} className={`flex items-center gap-1.5 text-[10px] ${c.ok ? "text-green-400" : "text-muted-foreground"}`}>
            <Check size={10} className={c.ok ? "opacity-100" : "opacity-30"} />
            {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AuthScreens() {
  const [view, setView] = useState<AuthView>("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  return (
    <div className="min-h-full flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img src={logoSrc} alt="Raivstream" className="h-8 object-contain" />
        </div>

        {/* Sign In */}
        {view === "signin" && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <h2 className="font-semibold">Sign in</h2>
              <p className="text-xs text-muted-foreground">Welcome back to Raivstream</p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" placeholder="you@example.com" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Password</Label>
                  <button onClick={() => setView("forgot")} className="text-[10px] text-primary hover:underline">Forgot?</button>
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="h-9 text-sm pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
            <Button className="w-full gap-1.5">
              <LogIn size={14} />Sign In
            </Button>
            <div className="text-center text-xs text-muted-foreground">
              Don't have an account?{" "}
              <button onClick={() => setView("signup")} className="text-primary hover:underline">Sign up free</button>
            </div>
          </div>
        )}

        {/* Sign Up */}
        {view === "signup" && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <h2 className="font-semibold">Create account</h2>
              <p className="text-xs text-muted-foreground">Join Raivstream — free forever</p>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>First Name</Label>
                  <Input placeholder="Nova" className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label>Last Name</Label>
                  <Input placeholder="Creates" className="h-9 text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Username</Label>
                <Input placeholder="@nova_creates" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" placeholder="you@example.com" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label>Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a strong password"
                    className="h-9 text-sm pr-9"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <PasswordStrength password={password} />
              </div>
            </div>
            <Button className="w-full gap-1.5">
              <UserPlus size={14} />Create Account
            </Button>
            <div className="text-center text-xs text-muted-foreground">
              Already have an account?{" "}
              <button onClick={() => setView("signin")} className="text-primary hover:underline">Sign in</button>
            </div>
          </div>
        )}

        {/* Forgot Password */}
        {view === "forgot" && !emailSent && (
          <div className="space-y-5">
            <div className="space-y-1">
              <button onClick={() => setView("signin")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2">
                <ArrowLeft size={12} />Back to sign in
              </button>
              <h2 className="font-semibold">Forgot password</h2>
              <p className="text-xs text-muted-foreground">Enter your email to receive a reset link</p>
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" placeholder="you@example.com" className="h-9 text-sm" />
            </div>
            <Button className="w-full" onClick={() => setEmailSent(true)}>Send Reset Link</Button>
          </div>
        )}

        {view === "forgot" && emailSent && (
          <div className="text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-primary/15 flex items-center justify-center">
              <KeyRound size={22} className="text-primary" />
            </div>
            <h2 className="font-semibold">Check your email</h2>
            <p className="text-sm text-muted-foreground">We sent a reset link to your email address. It expires in 15 minutes.</p>
            <button onClick={() => { setView("signin"); setEmailSent(false); }} className="text-xs text-primary hover:underline">
              Back to sign in
            </button>
          </div>
        )}

        {/* Reset Password */}
        {view === "reset" && !resetDone && (
          <div className="space-y-5">
            <div className="space-y-1">
              <h2 className="font-semibold">Reset password</h2>
              <p className="text-xs text-muted-foreground">Enter your new password</p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>New Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="New password"
                    className="h-9 text-sm pr-9"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <PasswordStrength password={password} />
              </div>
              <div className="space-y-1">
                <Label>Confirm Password</Label>
                <Input type="password" placeholder="Confirm new password" className="h-9 text-sm" />
              </div>
            </div>
            <Button className="w-full" onClick={() => setResetDone(true)}>Reset Password</Button>
          </div>
        )}

        {view === "reset" && resetDone && (
          <div className="text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-green-500/15 flex items-center justify-center">
              <Check size={22} className="text-green-400" />
            </div>
            <h2 className="font-semibold">Password updated</h2>
            <p className="text-sm text-muted-foreground">Your password has been reset successfully.</p>
            <Button size="sm" onClick={() => setView("signin")}>Sign in</Button>
          </div>
        )}

        {/* Demo nav */}
        <div className="mt-8 pt-4 border-t border-border flex flex-wrap justify-center gap-2">
          {(["signin", "signup", "forgot", "reset"] as AuthView[]).map(v => (
            <button
              key={v}
              onClick={() => { setView(v); setEmailSent(false); setResetDone(false); }}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors
                ${view === v ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-foreground/30"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
