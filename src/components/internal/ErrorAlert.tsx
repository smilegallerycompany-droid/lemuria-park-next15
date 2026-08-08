type Props = {
  message: string;
  tone?: "error" | "warning" | "info";
};

export function ErrorAlert({ message, tone = "error" }: Props) {
  return (
    <div className={`internal-alert ${tone}`} role="alert">
      {message}
    </div>
  );
}
