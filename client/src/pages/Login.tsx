import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useNavigate, Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FieldLabel, FieldContent, FieldError } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, Lock, CircleAlertIcon, ArrowLeftIcon } from "lucide-react";
import { useForceLightMode } from "@/hooks/use-force-light-mode";

interface LoginForm {
  email: string;
  password: string;
}

export default function Login() {
  useForceLightMode();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [serverError, setServerError] = useState("");

  const { control, handleSubmit, formState } = useForm<LoginForm>({
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  const onSubmit = async (values: LoginForm) => {
    setServerError("");
    try {
      const { data } = await api.post("/auth/login", values);
      localStorage.setItem("token", data.token);
      // AuthProvider only checks localStorage once on its own mount, which
      // already happened before this token existed — without this, `user`
      // stays null until an unrelated full reload, and any page gating on
      // it (Settings) renders blank right after login.
      await refreshUser();
      navigate("/products");
    } catch {
      setServerError("Invalid credentials");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-4">
      <div className="w-full max-w-sm">
      <Button variant="outline" size="sm" className="w-fit max-w-sm justify-start bg-card!" render={<Link to="/" />} nativeButton={false}>
        <ArrowLeftIcon className="size-4" /> Back
      </Button>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <span className="text-accent text-5xl font-logo text-center">golistee</span>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {serverError && (
              <Alert className="flex p-2 rounded-md text-destructive bg-destructive/10 border-destructive/10">
                <CircleAlertIcon className="size-4" />
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}

            <Controller
              name="email"
              control={control}
              rules={{ required: "Email is required" }}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Email</FieldLabel>
                  <FieldContent>
                    <InputGroup>
                      <InputGroupAddon align="inline-start"><Mail className="size-4" /></InputGroupAddon>
                      <InputGroupInput type="email" placeholder="you@example.com" aria-invalid={fieldState.invalid} {...field} />
                    </InputGroup>
                    {fieldState.invalid && (
                      <Alert className="mt-1 flex p-2 rounded-md text-destructive bg-destructive/10 border-destructive/10">
                        <CircleAlertIcon className="size-4" />
                        <AlertDescription><FieldError errors={[fieldState.error]} /></AlertDescription>
                      </Alert>
                    )}
                  </FieldContent>
                </Field>
              )}
            />

            <Controller
              name="password"
              control={control}
              rules={{ required: "Password is required" }}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Password</FieldLabel>
                  <FieldContent>
                    <InputGroup>
                      <InputGroupAddon align="inline-start"><Lock className="size-4" /></InputGroupAddon>
                      <InputGroupInput type="password" placeholder="Password" aria-invalid={fieldState.invalid} {...field} />
                    </InputGroup>
                    {fieldState.invalid && (
                      <Alert className="mt-1 flex p-2 rounded-md text-destructive bg-destructive/10 border-destructive/10">
                        <CircleAlertIcon className="size-4" />
                        <AlertDescription><FieldError errors={[fieldState.error]} /></AlertDescription>
                      </Alert>
                    )}
                  </FieldContent>
                </Field>
              )}
            />

            <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
              Login
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              No account? <Link to="/register" className="underline text-foreground">Register</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
