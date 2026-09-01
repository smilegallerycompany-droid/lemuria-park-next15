import QRCode from "qrcode";

export async function TicketQrSvg({
  value,
  caption,
}: {
  value: string;
  caption: string;
}) {
  const svg = await QRCode.toString(value, {
    type: "svg",
    margin: 1,
    width: 180,
    errorCorrectionLevel: "M",
  });

  return (
    <figure style={{ margin: 0, textAlign: "center" }}>
      <div
        aria-hidden
        style={{ width: 180, height: 180, margin: "0 auto" }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <figcaption style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>{caption}</figcaption>
    </figure>
  );
}
