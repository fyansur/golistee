import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useNavigate, Link } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FieldLabel, FieldContent, FieldError } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, Lock, CircleAlertIcon } from "lucide-react";

interface LoginForm {
  email: string;
  password: string;
}

export default function Login() {
  const navigate = useNavigate();
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
      navigate("/");
    } catch {
      setServerError("Invalid credentials");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <span className="text-accent text-2xl font-logo">golistee</span>
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
                      <InputGroupAddon align="inline-start"><Mail className="size-3.5" /></InputGroupAddon>
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
                      <InputGroupAddon align="inline-start"><Lock className="size-3.5" /></InputGroupAddon>
                      <InputGroupInput type="password" aria-invalid={fieldState.invalid} {...field} />
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
