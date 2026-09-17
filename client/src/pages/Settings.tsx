import { useForm, Controller } from "react-hook-form";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldContent, FieldError } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, Lock, CircleAlertIcon, Settings as SettingsIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
}

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

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

  const scheduleDeletion = async () => {
    setDeleting(true);
    try {
      await api.post("/auth/delete-account", { password: deletePassword });
      setDeletePassword("");
      await refreshUser();
      toast.success("Account deletion scheduled for 7 days from now");
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Could not schedule account deletion");
    } finally {
      setDeleting(false);
    }
  };

  const cancelDeletion = async () => {
    setDeleting(true);
    try {
      await api.delete("/auth/delete-account");
      await refreshUser();
      toast.success("Account deletion canceled");
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Could not cancel account deletion");
    } finally {
      setDeleting(false);
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
      <div className="flex items-center justify-between mb-8">
        <p className="text-xl font-black">Account Information</p>
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Account</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field>
              <FieldLabel>Email</FieldLabel>
              <FieldContent>
                <InputGroup>
                  <InputGroupAddon align="inline-start"><Mail className="size-4" /></InputGroupAddon>
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
                        <InputGroupAddon align="inline-start"><Lock className="size-4" /></InputGroupAddon>
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
                        <InputGroupAddon align="inline-start"><Lock className="size-4" /></InputGroupAddon>
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
        <Card className="border-destructive/40">
          <CardHeader><CardTitle className="text-sm text-destructive">Delete Account</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {user.deletionScheduledAt ? (
              <>
                <Alert className="border-destructive/30 bg-destructive/5">
                  <CircleAlertIcon />
                  <AlertDescription>
                    Your account and stored data will be permanently deleted on {new Date(user.deletionScheduledAt).toLocaleString()}.
                  </AlertDescription>
                </Alert>
                <Button variant="outline" onClick={cancelDeletion} disabled={deleting}>Cancel account deletion</Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Deletion has a 7-day waiting period. You can cancel anytime before the deadline.
                </p>
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="destructive" />}>
                    <Trash2Icon /> Delete account
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Schedule permanent account deletion?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Enter your password to confirm. Your account stays available for 7 days so you can cancel.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input
                      type="password"
                      placeholder="Current password"
                      value={deletePassword}
                      onChange={(event) => setDeletePassword(event.target.value)}
                    />
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setDeletePassword("")}>Keep account</AlertDialogCancel>
                      <AlertDialogAction onClick={scheduleDeletion} disabled={!deletePassword || deleting}>Schedule deletion</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
