import { useForm, Controller } from "react-hook-form";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldContent, FieldError } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, Lock, CircleAlertIcon, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
}

export default function Settings() {
  const { user } = useAuth();

  const { control, handleSubmit, setError, reset, formState } = useForm<PasswordForm>({
    defaultValues: { currentPassword: "", newPassword: "" },
    mode: "onBlur",
  });

  const onSubmitPassword = async (values: PasswordForm) => {
    try {
      await api.put("/auth/password", values);
      toast.success("Password updated successfully");
      reset({ currentPassword: "", newPassword: "" });
    } catch (err: any) {
      setError("currentPassword", {
        type: "server",
        message: err.response?.data?.error ?? "Current password is incorrect",
      });
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-7xl mx-auto justify-center p-8 space-y-6">
      <div className="flex items-center justify-between mb-16">
        <p className="text-3xl font-black flex gap-3 items-center">
          <SettingsIcon size="24" />Settings
        </p>
      </div>

      <div className="max-w-lg space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Account</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field>
              <FieldLabel>Email</FieldLabel>
              <FieldContent>
                <InputGroup>
                  <InputGroupAddon align="inline-start"><Mail className="size-3.5" /></InputGroupAddon>
                  <InputGroupInput value={user.email} disabled />
                </InputGroup>
              </FieldContent>
            </Field>
            <p className="text-xs text-muted-foreground">
              Member since {new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Change Password</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmitPassword)} className="flex flex-col gap-4">
              <Controller
                name="currentPassword"
                control={control}
                rules={{ required: "Current password is required" }}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>Current Password</FieldLabel>
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

              <Controller
                name="newPassword"
                control={control}
                rules={{
                  required: "New password is required",
                  minLength: { value: 6, message: "At least 6 characters" },
                }}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>New Password</FieldLabel>
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

              <Button type="submit" className="self-start" disabled={formState.isSubmitting}>
                Change Password
              </Button>
            </form>
          </CardContent>
        </Card>
{/* 
        <Card>
          <CardHeader><CardTitle className="text-sm">Appearance</CardTitle></CardHeader>
          <CardContent className="flex flex-row items-center justify-between">
            <p className="text-sm text-muted-foreground">Switch between light and dark theme.</p>
            <ModeToggle />
          </CardContent>
        </Card> */}
      </div>
    </div>
  );
}
